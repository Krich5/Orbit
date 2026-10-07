(function () {
  const SEARCH_ENDPOINT = 'https://api.wxcc-us1.cisco.com/search';
  const QUEUE_ENDPOINT = (orgId, page = 0, pageSize = 200) =>
    `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/v3/contact-service-queue?page=${page}&pageSize=${pageSize}`;

  const cacheKeyBearer = 'authBearer';
  const cacheKeyOrg = 'authOrg';

  let queueCache = [];
  let queueSelections = new Set();
  let queueAllSelected = true;

  // WxCC's search API rate-limits aggressively (returns { error: { key: 429,
  // retryAfter: N } } once you exceed its per-window budget). We fire two
  // requests per queue (aggregation + dedup), so 3 workers = 6 concurrent
  // requests, which stays under the limit for most orgs. On 429 we retry
  // with backoff using the retryAfter hint the server gives us.
  const MAX_CONCURRENT_FETCHES = 3;
  const REQUEST_TIMEOUT_MS = 60 * 1000;
  const RATE_LIMIT_MAX_RETRIES = 6;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Cisco AI unit pricing (from AI Offer Adjustment / QM Q2FY26 experts deck).
  // Prices are per unit / bundle / month.
  const CISCO_PRICING = {
    aiAgent: { list: 115, committed: 100 },
    aiAssistant: { list: 34.50, committed: 30 },
    aiQmStandalone: { list: 34.50, committed: 30 },
    aiAssistantQmBundle: { list: 57.50, committed: 50 }
  };
  const CISCO_CAPACITY = {
    autonomousVoice:   { minPerUnit: 250 },
    scriptedVoice:     { minPerUnit: 1600 },
    autonomousDigital: { sessionsPerUnit: 200,  messagesPerSession: 10 },
    scriptedDigital:   { sessionsPerUnit: 4800, messagesPerSession: 10 },
    aiAssistantVoice:  { minPerUnit: 1500 },
    aiAssistantDigital:{ sessionsPerUnit: 1000, messagesPerSession: 10 }
  };

  let activePreset = 'last-month';
  // 'presented' (default) counts every call the AI touched; 'handled' only
  // counts calls that actually connected to a human. Persisted so the pill
  // remembers the user's pick across page loads.
  const VOLUME_BASE_KEY = 'agentCalcVolumeBase_v1';
  let volumeBase = (() => {
    try { return localStorage.getItem(VOLUME_BASE_KEY) === 'handled' ? 'handled' : 'presented'; }
    catch { return 'presented'; }
  })();
  // 'live' (default) fetches from Webex Contact Center; 'manual' takes
  // hand-typed Presented / Handled / Abandoned / Avg Handle values and
  // skips the fetch entirely -- useful for costing what-ifs without a
  // real tenant to query.
  const DATA_MODE_KEY = 'agentCalcDataMode_v1';
  let dataMode = (() => {
    try { return localStorage.getItem(DATA_MODE_KEY) === 'manual' ? 'manual' : 'live'; }
    catch { return 'live'; }
  })();

  function $(id) { return document.getElementById(id); }

  function getOrgIdValue() {
    const cachedId = localStorage.getItem('authOrgId') || '';
    if (cachedId) {
      if (/^Y2lz/i.test(cachedId)) {
        try {
          const padded = cachedId.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cachedId.length / 4) * 4, '=');
          const decoded = atob(padded);
          const parts = decoded.split('/');
          const result = parts[parts.length - 1] || decoded;
          localStorage.setItem('authOrgId', result);
          return result;
        } catch { return cachedId; }
      }
      const idx = cachedId.toLowerCase().indexOf('organization/');
      if (idx !== -1) return cachedId.slice(idx + 'organization/'.length) || cachedId;
      return cachedId;
    }
    const raw = localStorage.getItem(cacheKeyOrg) || '';
    if (!raw) return '';
    if (/^Y2lz/i.test(raw)) {
      try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const decoded = atob(padded);
        const parts = decoded.split('/');
        return parts[parts.length - 1] || decoded;
      } catch { return raw; }
    }
    const idx = raw.toLowerCase().indexOf('organization/');
    if (idx !== -1) return raw.slice(idx + 'organization/'.length) || raw;
    return raw;
  }

  function getAuthState() {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId = getOrgIdValue();
    if (!bearer || !orgId) return null;
    return { bearer, orgId };
  }

  function extractList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.contactServiceQueues)) return payload.contactServiceQueues;
    return [];
  }

  async function fetchQueueList(auth) {
    try {
      const res = await fetch(QUEUE_ENDPOINT(auth.orgId), {
        headers: { Authorization: `Bearer ${auth.bearer}`, OrgId: auth.orgId, 'Content-Type': 'application/json' }
      });
      if (!res.ok) return [];
      queueCache = extractList(await res.json()).filter(Boolean);
      return queueCache;
    } catch (err) {
      console.error('[agent-calculator] failed to load queues', err);
      return [];
    }
  }

  function updateDropdownBadge() {
    const el = $('sharedQueueDropdown');
    if (!el) return;
    const total = queueCache.length;
    const count = queueAllSelected ? total : queueSelections.size;
    const badge = el.querySelector('.filter-dropdown__badge');
    const toggle = el.querySelector('.filter-dropdown__toggle');
    const textEl = el.querySelector('.dashboard-filter-toggle__text');
    if (badge) { badge.textContent = count; badge.hidden = count === 0; }
    if (toggle) toggle.classList.toggle('has-selection', count > 0);
    if (textEl) textEl.textContent = queueAllSelected ? `All (${total})` : count ? `${count} of ${total}` : 'None';
  }

  function renderQueueOptions() {
    const listEl = $('sharedQueueList');
    const searchEl = $('sharedQueueSearch');
    if (!listEl) return;
    const items = queueCache
      .map((q) => ({ value: String(q?.id || ''), label: q?.name || q?.displayName || q?.customName || 'Unnamed queue' }))
      .filter((x) => x.value && x.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    const allValues = items.map((i) => i.value);
    const validValues = new Set(allValues);
    [...queueSelections].forEach((v) => { if (!validValues.has(v)) queueSelections.delete(v); });
    if (queueAllSelected) { queueSelections.clear(); allValues.forEach((v) => queueSelections.add(v)); }
    const term = (searchEl?.value || '').toLowerCase();
    const filtered = term ? items.filter((i) => i.label.toLowerCase().includes(term)) : items;
    const filteredValues = filtered.map((i) => i.value);
    const allVisibleSelected = filteredValues.length > 0 && filteredValues.every((v) => queueSelections.has(v));
    listEl.innerHTML = `
      <label class="filter-dropdown__item filter-dropdown__item--select-all">
        <input type="checkbox" data-select-all="true"${allVisibleSelected ? ' checked' : ''}>
        <span class="filter-dropdown__item-label">Select all</span>
      </label>
    ` + filtered.map((item) => `
      <label class="filter-dropdown__item">
        <input type="checkbox" value="${item.value}"${queueSelections.has(item.value) ? ' checked' : ''}>
        <span class="filter-dropdown__item-label">${escapeHtml(item.label)}</span>
      </label>
    `).join('');
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.dataset.selectAll === 'true') {
          if (cb.checked) {
            if (term) {
              filteredValues.forEach((v) => queueSelections.add(v));
              queueAllSelected = queueSelections.size === allValues.length && allValues.length > 0;
            } else {
              queueSelections.clear();
              allValues.forEach((v) => queueSelections.add(v));
              queueAllSelected = true;
            }
          } else {
            queueSelections.clear();
            queueAllSelected = false;
          }
        } else {
          queueAllSelected = false;
          if (cb.checked) queueSelections.add(cb.value); else queueSelections.delete(cb.value);
          if (queueSelections.size === allValues.length && allValues.length > 0) queueAllSelected = true;
        }
        renderQueueOptions();
        updateDropdownBadge();
      });
    });
    updateDropdownBadge();
  }

  // Close every control-row dropdown except the one passed in. Used so
  // opening Queues auto-closes Date Range / Handled Includes (and vice
  // versa) -- otherwise all three can be open at once because each
  // toggle stops the click from reaching the others' outside-click
  // listeners.
  function closeAllControlDropdowns(exceptEl) {
    document.querySelectorAll('.agent-calc-control-cell .filter-dropdown.open').forEach((d) => {
      if (d === exceptEl) return;
      d.classList.remove('open');
      d.querySelector('.filter-dropdown__toggle')?.setAttribute('aria-expanded', 'false');
    });
  }

  function initQueueDropdown() {
    const dropdown = $('sharedQueueDropdown');
    if (!dropdown) return;
    const toggle = $('sharedQueueToggle');
    const panel = $('sharedQueuePanel');
    const search = $('sharedQueueSearch');
    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllControlDropdowns(dropdown);
      const open = dropdown.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) search?.focus();
    });
    panel?.addEventListener('click', (e) => e.stopPropagation());
    search?.addEventListener('input', renderQueueOptions);
  }

  // Sniff whether a Cisco response is a rate-limit signal. It can come back
  // either as HTTP 429 with a Retry-After header, or as HTTP 200 with a body
  // like { error: { key: 429, retryAfter: N } }. Returns the retry delay in
  // milliseconds if throttled, otherwise null.
  function rateLimitRetryMs(res, payload) {
    const key = payload?.error?.key;
    const isRateLimited = res.status === 429 || key === 429 || key === '429';
    if (!isRateLimited) return null;
    const bodyRetry = Number(payload?.error?.retryAfter);
    const headerRetry = Number(res.headers.get('Retry-After'));
    const seconds = Number.isFinite(bodyRetry) && bodyRetry > 0 ? bodyRetry
      : Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry
      : 1;
    return Math.max(500, seconds * 1000);
  }

  async function fetchGraphQL(query, auth) {
    if (!auth) return null;
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`${SEARCH_ENDPOINT}?orgId=${encodeURIComponent(auth.orgId)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth.bearer}`, OrgId: auth.orgId, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: controller.signal
        });
        let payload = null;
        let bodyText = '';
        try { bodyText = await res.text(); payload = bodyText ? JSON.parse(bodyText) : null; } catch {}

        const retryMs = rateLimitRetryMs(res, payload);
        if (retryMs != null && attempt < RATE_LIMIT_MAX_RETRIES) {
          attempt++;
          // Exponential fallback on top of the server hint, with small
          // jitter so parallel workers don't all wake at the same instant.
          const backoff = retryMs * Math.pow(1.5, attempt - 1) + Math.floor(Math.random() * 250);
          setStatus(`Rate limited by Webex — waiting ${Math.round(backoff / 1000)}s (retry ${attempt}/${RATE_LIMIT_MAX_RETRIES})…`);
          await sleep(backoff);
          continue;
        }
        if (retryMs != null) {
          return { error: 'Rate limited by Webex Contact Center. Try fewer queues or a shorter range.', status: 429 };
        }
        if (!res.ok) {
          const msg = payload?.errors ? JSON.stringify(payload.errors)
            : payload?.message ? String(payload.message)
            : bodyText ? bodyText.slice(0, 500)
            : `HTTP ${res.status}`;
          return { error: msg, status: res.status };
        }
        if (payload?.errors) return { error: JSON.stringify(payload.errors), status: res.status };
        return { data: payload?.data || null };
      } catch (err) {
        if (err?.name === 'AbortError') return { error: `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`, status: 0, timeout: true };
        return { error: String(err?.message || err), status: 0 };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // WxCC search API's aggregate `task` root supports filter-inside-aggregation
  // with gt/lt on LongExpression, confirmed by prod probes. That lets us pull
  // every metric for one (queue × week) row in a single request — no more
  // paginating through thousands of individual tasks.
  //
  // Which queue to attribute a task to: 'first' matches Cisco Analyzer's
  // "Calls Presented" (a transferred call counts for the queue it arrived
  // at, not the queue it ended up in). 'last' would match "Calls Handled at
  // this queue" instead. First is the right one for AI Agent sizing — the
  // AI sits in front of the queue, so if a call arrives at the AI queue it
  // consumed AI capacity even if it later transferred to a human queue.
  //
  // Shape fallbacks: nested { firstQueue: { id: { equals } } } is tried
  // first; if the schema rejects that field or shape, we fall through the
  // list until one works.
  // Ordered by "known to work in this WxCC schema": lastQueue nested is proven
  // (matches Cisco Analyzer's Final Queue Name filter). The other shapes stay
  // as fallbacks in case a future org's schema differs, but they run only if
  // the primary is rejected.
  const QUEUE_FILTER_SHAPES = [
    { name: 'lastQueue nested',            build: (id) => `{ lastQueue: { id: { equals: "${id}" } } }` },
    { name: 'lastQueueId flat',            build: (id) => `{ lastQueueId: { equals: "${id}" } }` },
    { name: 'firstQueue nested',           build: (id) => `{ firstQueue: { id: { equals: "${id}" } } }` },
    { name: 'firstQueueId flat',           build: (id) => `{ firstQueueId: { equals: "${id}" } }` },
    { name: 'initialQueue nested',         build: (id) => `{ initialQueue: { id: { equals: "${id}" } } }` },
    { name: 'originalQueue nested',        build: (id) => `{ originalQueue: { id: { equals: "${id}" } } }` },
    { name: 'contactServiceQueue nested',  build: (id) => `{ contactServiceQueue: { id: { equals: "${id}" } } }` },
    { name: 'contactServiceQueueId flat',  build: (id) => `{ contactServiceQueueId: { equals: "${id}" } }` },
    { name: 'queue nested',                build: (id) => `{ queue: { id: { equals: "${id}" } } }` },
    { name: 'queueId flat',                build: (id) => `{ queueId: { equals: "${id}" } }` }
  ];
  let queueFilterShapeIdx = 0;

  function queueFilterClause(queueId) {
    return QUEUE_FILTER_SHAPES[queueFilterShapeIdx].build(queueId);
  }

  function queueFilterName() {
    return QUEUE_FILTER_SHAPES[queueFilterShapeIdx].name;
  }

  // Cisco Analyzer's CSQ report counts Contact Session ID, not task id. Task
  // count > session count when a session traverses multiple queues (transfer),
  // so counting id at the queue level over-attributes transferred calls. Try
  // the contactSessionId field first; if the schema rejects it, fall back
  // through likely names, then to plain id as a last resort.
  const COUNT_FIELD_CANDIDATES = ['contactSessionId', 'sessionId', 'id'];
  let countFieldIdx = 0;
  function countField() { return COUNT_FIELD_CANDIDATES[countFieldIdx]; }

  // HAR from prod confirmed: WxCC's AggregationType enum has NO distinct-count
  // variant. Every candidate (countDistinct/distinctCount/cardinality/
  // count_distinct/unique/distinct/uniq) is rejected. `count` on a string
  // field is record-count only, which overcounts sessions that make multiple
  // tasks in the same queue. We use plain `count` here and get exact
  // distinct-session numbers from the secondary taskDetails dedup fetch
  // below (fetchDistinctSessionCounts) instead.
  const COUNT_TYPE_CANDIDATES = ['count'];
  let countTypeIdx = 0;
  function countType() { return COUNT_TYPE_CANDIDATES[countTypeIdx]; }

  // Cisco's CSQ All Fields "Calls Handled" formula is:
  //   Count of Contact Session ID WHERE Termination Type IS IN
  //     (normal, sudden_disconnect, short_call)
  // If the schema rejects the terminationType field name we drop that
  // aggregation and populate Handled as null so the row still renders.
  let terminationTypeSupported = true;

  // For AI Agent sizing we only care about CONNECTED time (agent talk time).
  // Wrap-up and post-call are human-agent bookkeeping that the AI never does,
  // so they must not be included in the bundle math. Total column = sum of
  // connectedDuration; Avg = that / handled. That's what Cisco's own "Sum of
  // Connected Duration" column shows too, so we still match the piece of
  // their report that matters.
  let maxAggSupported = true;

  function buildAggregateQuery(fromMs, toMs, queueId) {
    const cf = countField();
    const ct = countType();
    const selectedTypes = getSelectedHandledTypes();
    const handledAgg = terminationTypeSupported ? `
      { field: "${cf}", type: ${ct}, name: "handled",
        filter: { or: [
${selectedTypes.map((t) => `          { terminationType: { equals: "${t}" } }`).join('\n')}
        ] } }` : '';
    const maxConnectedAgg = maxAggSupported
      ? `\n      { field: "connectedDuration", type: max, name: "maxConnectedMs" }`
      : '';
    return `{
  task(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    timeComparator: createdTime
    filter: { and: [
      { channelType: { equals: telephony } }
      ${queueFilterClause(queueId)}
    ] }
    aggregations: [
      { field: "${cf}", type: ${ct}, name: "presented" }${handledAgg}
      { field: "connectedDuration", type: sum, name: "totalMs" }${maxConnectedAgg}
    ]
    pagination: { cursor: "0" }
  ) { tasks { aggregation { name value } } }
}`;
  }

  function parseAggregation(dataRoot) {
    const arr = dataRoot?.task?.tasks?.[0]?.aggregation;
    if (!Array.isArray(arr)) return null;
    const out = {};
    arr.forEach((entry) => { out[entry.name] = Number(entry.value) || 0; });
    return out;
  }

  async function fetchQueueWeekAggregate(auth, fromMs, toMs, queueId) {
    const maxAttempts = QUEUE_FILTER_SHAPES.length + COUNT_FIELD_CANDIDATES.length + COUNT_TYPE_CANDIDATES.length + 12;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const query = buildAggregateQuery(fromMs, toMs, queueId);
      const result = await fetchGraphQL(query, auth);
      if (result?.error) {
        console.warn('[agent-calculator] query error on attempt', attempt + 1, '\n', query, '\nerror:', result.error);
        // Termination-type aggregation fallback. If the schema rejects the
        // terminationType field (or the `or` filter shape) drop the handled
        // aggregation and retry with everything else.
        if (terminationTypeSupported && /terminationType|"or"|`or`|FieldUndefined@\[task.*handled/i.test(result.error)) {
          console.warn('[agent-calculator] dropping handled aggregation (terminationType unsupported):', result.error);
          terminationTypeSupported = false;
          continue;
        }
        if (maxAggSupported && /\bmaxConnectedMs\b|type\s+max\b|argument\s+.type.*max/i.test(result.error)) {
          console.warn('[agent-calculator] dropping max aggregation (type unsupported):', result.error);
          maxAggSupported = false;
          continue;
        }
        // Count-field fallback. STRICT match — only trigger if the error
        // mentions the current count field name (e.g. "contactSessionId").
        const currentField = countField();
        if (countFieldIdx < COUNT_FIELD_CANDIDATES.length - 1 && new RegExp('\\b' + currentField + '\\b', 'i').test(result.error)) {
          console.warn(`[agent-calculator] count field "${currentField}" rejected, trying "${COUNT_FIELD_CANDIDATES[countFieldIdx + 1]}":`, result.error);
          countFieldIdx += 1;
          continue;
        }
        // Queue-filter shape fallback. STRICT match — only trigger if the
        // error clearly mentions one of the queue-attribution field names.
        // A generic WrongType/FieldUndefined at some other location (an
        // aggregation type, an operator) must not silently advance the
        // queue-filter shape.
        const looksLikeQueueFieldError = /firstQueue|lastQueue|initialQueue|originalQueue|contactServiceQueue|firstQueueId|lastQueueId|contactServiceQueueId|"?queue"?\s*:|"?queueId"?/i.test(result.error);
        const hasQueueFallbacks = queueFilterShapeIdx < QUEUE_FILTER_SHAPES.length - 1;
        if (looksLikeQueueFieldError && hasQueueFallbacks) {
          console.warn(`[agent-calculator] queue filter shape "${queueFilterName()}" rejected, trying next:`, result.error);
          queueFilterShapeIdx += 1;
          continue;
        }
        throw new Error(result.error);
      }
      return parseAggregation(result.data) || { presented: 0, handled: null, totalMs: 0, maxConnectedMs: 0 };
    }
    throw new Error('WxCC schema rejected every count-field / queue-filter combination');
  }

  // Simple pool-based concurrency limiter.
  async function mapPool(items, limit, worker) {
    const results = new Array(items.length);
    let cursor = 0;
    async function step() {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await worker(items[idx], idx);
      }
    }
    const runners = Array.from({ length: Math.min(limit, items.length) }, step);
    await Promise.all(runners);
    return results;
  }

  function buildRowFromAggregate(queueName, weekLabel, agg) {
    const toSec = (ms) => Math.max(0, ms || 0) / 1000;
    const presented = agg.presented || 0;
    const handled = terminationTypeSupported ? (agg.handled || 0) : null;
    // Handle-time. Cisco's Average Handled Time = (talk + hold + wrap-up) /
    // handled. Prefer sum(handleTime) if the schema exposes it and it comes
    // back non-zero; otherwise build it from talk + hold + wrap-up sums
    // (individually optional — anything missing falls out of the sum).
    const talkSec = toSec(agg.totalMs);
    // For AI sizing we care about talk time only (AI doesn't do wrap-up).
    const handleTimeSec = talkSec;
    const avgHandleSec = (handled && handled > 0) ? handleTimeSec / handled : 0;
    const maxConnectedSec = maxAggSupported && agg.maxConnectedMs != null
      ? toSec(agg.maxConnectedMs)
      : null;
    return {
      queueName,
      interval: weekLabel,
      presented,
      handled,
      abandoned: handled != null ? Math.max(0, presented - handled) : null,
      pctHandled: (handled != null && presented) ? (handled / presented) : null,
      handleTimeSec,
      avgHandleSec,
      maxConnectedSec,
      totalConnectedSec: talkSec
    };
  }

  function fmtHMS(seconds) {
    const total = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  }

  function renderTable(rows) {
    rows.sort((a, b) => b.presented - a.presented || a.queueName.localeCompare(b.queueName));
    const body = $('agentCalcBody');
    const count = $('agentCalcRowLabel');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="realtime-status">No calls in this window for the selected queues.</td></tr>';
      if (count) count.textContent = '0';
      return;
    }
    if (count) count.textContent = String(rows.length);
    body.innerHTML = rows.map((r) => {
      const handledCell   = r.handled   == null ? '—' : r.handled.toLocaleString();
      const abandonedCell = r.abandoned == null ? '—' : r.abandoned.toLocaleString();
      const pctCell       = r.pctHandled == null ? '—' : `${(r.pctHandled * 100).toFixed(2)}%`;
      const maxConnCell   = r.maxConnectedSec == null ? '—' : fmtHMS(r.maxConnectedSec);
      return `<tr>
        <td>${escapeHtml(r.queueName)}</td>
        <td>${r.presented.toLocaleString()}</td>
        <td>${handledCell}</td>
        <td>${abandonedCell}</td>
        <td>${pctCell}</td>
        <td>${fmtHMS(r.avgHandleSec)}</td>
        <td>${maxConnCell}</td>
        <td>${fmtHMS(r.handleTimeSec)}</td>
      </tr>`;
    }).join('');
  }

  function money(n) {
    return `$${Math.round(n).toLocaleString()}`;
  }
  // 2-decimal money for unit prices ($92.15/unit), where rounding to
  // whole dollars would hide the actual price the user typed in.
  function money2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$0.00';
    return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ─── Pricing controls (per product: agent / assistant) ───────────────────
  // Independent state per product, persisted so a user's discount% or
  // custom price sticks across page loads. Never touches the SKU
  // quantities -- those come from usage scenario math, so changing a
  // discount can never change how many units the customer needs.
  const PRICING_STATE_KEY = 'agentCalcPricingState_v1';
  function defaultPricingState() {
    return {
      agent:     { show: true, mode: 'discount', discountPct: 0, customPrice: CISCO_PRICING.aiAgent.committed },
      assistant: { show: true, mode: 'discount', discountPct: 0, customPrice: CISCO_PRICING.aiAssistant.committed }
    };
  }
  let pricingState = defaultPricingState();
  function loadPricingState() {
    try {
      const raw = localStorage.getItem(PRICING_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const def = defaultPricingState();
      pricingState = {
        agent:     { ...def.agent,     ...(parsed.agent     || {}) },
        assistant: { ...def.assistant, ...(parsed.assistant || {}) }
      };
    } catch {}
  }
  function savePricingState() {
    try { localStorage.setItem(PRICING_STATE_KEY, JSON.stringify(pricingState)); } catch {}
  }
  // Effective per-unit price given the product's list price and current
  // pricing state. Custom price is used as-is (no additional discount
  // stacked on top -- that's the "do not apply the discount again to the
  // custom price" requirement).
  function effectiveUnit(list, state) {
    if (state.mode === 'custom') {
      const v = Number(state.customPrice);
      return Number.isFinite(v) && v >= 0 ? v : 0;
    }
    const pct = Math.max(0, Math.min(100, Number(state.discountPct) || 0));
    return list * (1 - pct / 100);
  }

  // ─── Scenario model ───────────────────────────────────────────────────────
  // Baseline (from customer data): totals.presented, totals.handled,
  // totals.handleTimeSec (= sum of connected duration, talk time only).
  //
  // Assumptions the user can dial:
  //   Quick mode:    quickBotMin — average bot time per call; every call
  //                  enters AI, no containment split (all go on to a human).
  //   Detailed mode: pctEnterAI, pctContained, containedBotMin,
  //                  transferBotMin, humanAHTMin (defaults to avg handle).
  //
  // AI Agent min       = contained × containedBotMin + transferred × transferBotMin
  // AI Assistant min   = human-handled calls × humanAHT
  //   where human-handled = presented − contained  (transferred + bypassed)
  //
  // We use PRESENTED as the base call count (matches Cisco Analyzer "Calls
  // Presented"), because the AI would attempt every call routed to the queue.
  let baselineTotals = null;

  function readScenario() {
    const mode = document.querySelector('input[name="scenarioMode"]:checked')?.value || 'detailed';
    const num = (id, fallback) => {
      const v = parseFloat($(id)?.value);
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    };
    return {
      mode,
      quickBotMin: num('scQuickBotMin', 2),
      pctEnterAI:  Math.min(100, num('scPctEnterAI', 100)) / 100,
      pctContained: Math.min(100, num('scPctContained', 50)) / 100,
      containedBotMin: num('scContainedBotMin', 5),
      transferBotMin:  num('scTransferBotMin', 1),
      humanAHTMin:     num('scHumanAHTMin', 0)
    };
  }

  function computeScenario(totals, sc) {
    // Volume base = whichever call count the user picked in the "Volume
    // Base" pill. Presented = every call the AI sees (default, since the
    // bot plays before any human). Handled = only calls that actually
    // connected to a human -- useful when the intent is to size AI
    // capacity strictly on completed conversations.
    const volume = volumeBase === 'handled' ? (totals.handled || 0) : (totals.presented || 0);
    const dataAvgMin = totals.handled > 0 ? (totals.handleTimeSec / totals.handled) / 60 : 0;
    let enteredAI, contained, transferred, humanCalls, aiAgentMin, aiAssistantMin, humanAHT, notes;

    if (sc.mode === 'quick') {
      // Every call enters AI, no containment (all get bot minutes then go to human).
      enteredAI = volume;
      contained = 0;
      transferred = volume;
      humanCalls = volume; // all reach a human after the bot
      aiAgentMin = volume * sc.quickBotMin;
      humanAHT = dataAvgMin; // use data's avg handle
      aiAssistantMin = humanCalls * humanAHT;
      notes = `Quick: ${volume.toLocaleString()} ${volumeBase} calls × ${sc.quickBotMin} min bot`;
    } else {
      enteredAI = volume * sc.pctEnterAI;
      contained = enteredAI * sc.pctContained;
      transferred = enteredAI - contained;
      humanCalls = volume - contained; // transferred + bypassed
      aiAgentMin = contained * sc.containedBotMin + transferred * sc.transferBotMin;
      humanAHT = sc.humanAHTMin > 0 ? sc.humanAHTMin : dataAvgMin;
      aiAssistantMin = humanCalls * humanAHT;
      notes = `${Math.round(contained).toLocaleString()} contained × ${sc.containedBotMin}m + ${Math.round(transferred).toLocaleString()} transferred × ${sc.transferBotMin}m (base: ${volumeBase})`;
    }
    return {
      enteredAI, contained, transferred, humanCalls,
      aiAgentMin, aiAssistantMin, humanAHTMin: humanAHT,
      notes
    };
  }

  function updateSummary(rows) {
    const totals = rows.reduce((acc, r) => {
      acc.presented += r.presented;
      if (r.handled != null) acc.handled += r.handled;
      if (r.abandoned != null) acc.abandoned += r.abandoned;
      acc.handleTimeSec += r.handleTimeSec;
      return acc;
    }, { presented: 0, handled: 0, abandoned: 0, handleTimeSec: 0 });

    baselineTotals = totals; // stash so scenario input changes can recompute
    const avgHandleSec = totals.handled > 0 ? totals.handleTimeSec / totals.handled : 0;
    $('metric-presented').textContent = totals.presented.toLocaleString();
    $('metric-handled').textContent = terminationTypeSupported ? totals.handled.toLocaleString() : '—';
    $('metric-abandoned').textContent = terminationTypeSupported ? totals.abandoned.toLocaleString() : '—';
    $('metric-avgHandle').textContent = fmtHMS(avgHandleSec);
    // Both totals rounded to integers. The old ".1"-decimal hours ("1605.3")
    // read as ambiguous (is .3 minutes? tenths of an hour?) -- easier to
    // just show whole hours and let the minutes card carry the remainder.
    $('metric-totalHours').textContent = Math.round(totals.handleTimeSec / 3600).toLocaleString();
    $('metric-totalMinutes').textContent = Math.round(totals.handleTimeSec / 60).toLocaleString();

    // Prefill Human AHT input with data's avg (in minutes) if user hasn't set one.
    const humanAhtEl = $('scHumanAHTMin');
    if (humanAhtEl && (!humanAhtEl.value || parseFloat(humanAhtEl.value) === 0)) {
      humanAhtEl.value = (avgHandleSec / 60).toFixed(1);
    }
    const hint = $('scHumanAHTHint');
    if (hint) hint.textContent = `Data Avg Handle = ${(avgHandleSec / 60).toFixed(1)} min. Change if the post-transfer call would run different.`;

    recomputeScenarioCosts();
  }

  // Build one table row per SKU with the currently-active price applied.
  // priceEmpty means "Show pricing" is off -- render only Scenario, Units,
  // and Notes cells so the price columns collapse via .no-pricing CSS.
  function costRowHtml(label, units, listUnit, effUnit, note, priceEmpty) {
    const listTotal = units * listUnit;
    const effTotal  = units * effUnit;
    const savings   = Math.max(0, listTotal - effTotal);
    if (priceEmpty) {
      return `<tr>
        <td>${label}</td>
        <td class="agent-calc-cost-units">${units.toLocaleString()}</td>
        <td class="agent-calc-cost-note">${note}</td>
      </tr>`;
    }
    return `<tr>
      <td>${label}</td>
      <td class="agent-calc-cost-units">${units.toLocaleString()}</td>
      <td class="agent-calc-price-col agent-calc-cost-list">${money(listTotal)}</td>
      <td class="agent-calc-price-col agent-calc-cost-committed">${money(effTotal)}</td>
      <td class="agent-calc-price-col agent-calc-cost-save">${savings > 0 ? money(savings) : '—'}</td>
      <td class="agent-calc-cost-note">${note}</td>
    </tr>`;
  }

  function recomputeScenarioCosts() {
    if (!baselineTotals) return;
    const sc = readScenario();
    const s = computeScenario(baselineTotals, sc);

    // ── Cisco AI Agent ────────────────────────────────────────────────
    const agentPrice = CISCO_PRICING.aiAgent;
    const autonomousCap = CISCO_CAPACITY.autonomousVoice.minPerUnit;   // 250
    const scriptedCap   = CISCO_CAPACITY.scriptedVoice.minPerUnit;     // 1600
    const autonomousUnits = Math.ceil(s.aiAgentMin / autonomousCap);
    const scriptedUnits   = Math.ceil(s.aiAgentMin / scriptedCap);
    const agentState = pricingState.agent;
    const agentEff = effectiveUnit(agentPrice.list, agentState);
    const agentRows = [
      { label: 'Autonomous', units: autonomousUnits, cap: autonomousCap },
      { label: 'Scripted',   units: scriptedUnits,   cap: scriptedCap }
    ].map((row) => costRowHtml(
      row.label, row.units, agentPrice.list, agentEff,
      `${s.aiAgentMin.toFixed(0).toLocaleString()} min ÷ ${row.cap.toLocaleString()} min/unit · ${s.notes}`,
      !agentState.show
    )).join('');
    const costEl = $('agentCalcCostBody');
    if (costEl) costEl.innerHTML = agentRows;
    const costCard = $('agentCalcCostCard');
    if (costCard) {
      costCard.classList.toggle('is-visible', baselineTotals.presented > 0);
      costCard.classList.toggle('no-pricing', !agentState.show);
    }

    // ── Cisco AI Assistant ────────────────────────────────────────────
    const assistantPrice = CISCO_PRICING.aiAssistant;
    const assistantCap = CISCO_CAPACITY.aiAssistantVoice.minPerUnit;   // 1500
    const assistantUnits = Math.ceil(s.aiAssistantMin / assistantCap);
    const assistantState = pricingState.assistant;
    const assistantEff = effectiveUnit(assistantPrice.list, assistantState);
    const assistantHtml = costRowHtml(
      'Voice (streams every human call)', assistantUnits, assistantPrice.list, assistantEff,
      `${Math.round(s.humanCalls).toLocaleString()} human calls × ${s.humanAHTMin.toFixed(1)} min = ${s.aiAssistantMin.toFixed(0).toLocaleString()} min ÷ ${assistantCap.toLocaleString()} min/unit`,
      !assistantState.show
    );
    const assistantEl = $('agentCalcAssistantCostBody');
    if (assistantEl) assistantEl.innerHTML = assistantHtml;
    const assistantCard = $('agentCalcAssistantCostCard');
    if (assistantCard) {
      assistantCard.classList.toggle('is-visible', baselineTotals.presented > 0);
      assistantCard.classList.toggle('no-pricing', !assistantState.show);
    }
  }

  // Wire the pricing toolbar for one product ("agent" or "assistant").
  // Reads DOM into pricingState, updates the "MODE" pill highlight, and
  // triggers a recompute + persist on every input.
  function initPricingToolbar(product, listPrice, ids) {
    const state = pricingState[product];
    const showEl    = $(ids.show);
    const discountEl= $(ids.discount);
    const customEl  = $(ids.custom);
    const resetEl   = $(ids.reset);
    const listLabel = $(ids.listLabel);
    const radios    = document.querySelectorAll(`input[name="${ids.methodName}"]`);
    const options   = document.querySelectorAll(`[data-product="${product}"] .agent-calc-pricing-method-option`);

    if (listLabel) listLabel.textContent = `${money2(listPrice)} / unit / mo (list)`;

    // Seed inputs from stored state.
    if (showEl)     showEl.checked   = !!state.show;
    if (discountEl) discountEl.value = state.discountPct;
    if (customEl)   customEl.value   = state.customPrice;
    radios.forEach((r) => { r.checked = (r.value === state.mode); });
    options.forEach((o) => o.classList.toggle('is-active', o.dataset.method === state.mode));
    // Reflect the initial show-pricing state on the card immediately so
    // the price columns hide even before the first run.
    const cardEl = document.querySelector(`.agent-calc-cost-card[data-product="${product}"]`);
    if (cardEl) cardEl.classList.toggle('no-pricing', !state.show);

    function apply() {
      savePricingState();
      options.forEach((o) => o.classList.toggle('is-active', o.dataset.method === state.mode));
      if (cardEl) cardEl.classList.toggle('no-pricing', !state.show);
      recomputeScenarioCosts();
    }

    showEl?.addEventListener('change', () => { state.show = showEl.checked; apply(); });
    discountEl?.addEventListener('input', () => {
      let v = Number(discountEl.value);
      if (!Number.isFinite(v)) v = 0;
      v = Math.max(0, Math.min(100, v));
      state.discountPct = v;
      apply();
    });
    customEl?.addEventListener('input', () => {
      let v = Number(customEl.value);
      if (!Number.isFinite(v) || v < 0) v = 0;
      state.customPrice = v;
      apply();
    });
    radios.forEach((r) => r.addEventListener('change', () => {
      if (r.checked) { state.mode = r.value; apply(); }
    }));
    resetEl?.addEventListener('click', () => {
      state.mode = 'discount';
      state.discountPct = 0;
      state.customPrice = listPrice;
      if (discountEl) discountEl.value = 0;
      if (customEl)   customEl.value   = listPrice;
      radios.forEach((r) => { r.checked = (r.value === 'discount'); });
      apply();
    });
  }

  // Live vs Manual data-source toggle. Swaps which control grid is
  // visible above and hides the per-queue table when Manual is picked
  // (there are no per-queue rows in manual mode -- the totals ARE the
  // input).
  function applyDataMode(mode) {
    dataMode = mode === 'manual' ? 'manual' : 'live';
    try { localStorage.setItem(DATA_MODE_KEY, dataMode); } catch {}
    document.querySelectorAll('.agent-calc-mode-toggle__btn').forEach((b) => {
      const active = b.dataset.dataMode === dataMode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.agent-calc-control-grid[data-mode-block]').forEach((g) => {
      g.hidden = (g.dataset.modeBlock !== dataMode);
    });
    // Per-queue table has no meaning in manual mode (there aren't per-queue
    // rows to render -- the manual entry IS the aggregate).
    const perQueue = $('agentCalcPerQueueSection');
    if (perQueue) perQueue.hidden = (dataMode === 'manual');
  }
  function initDataModeToggle() {
    document.querySelectorAll('.agent-calc-mode-toggle__btn').forEach((b) => {
      b.addEventListener('click', () => applyDataMode(b.dataset.dataMode));
    });
    applyDataMode(dataMode);
  }

  // Manual entry form -- Presented / Handled / Abandoned / Avg Handle (min).
  // Calculate builds the same baselineTotals shape a live fetch would
  // produce, updates the metric cards, then triggers recomputeScenarioCosts
  // so the two cost cards recalculate off the entered numbers.
  function runManualCalc() {
    const presented   = Math.max(0, Math.round(Number($('agentCalcManualPresented')?.value) || 0));
    const handled     = Math.max(0, Math.round(Number($('agentCalcManualHandled')?.value) || 0));
    const abandonedIn = Math.round(Number($('agentCalcManualAbandoned')?.value));
    const abandoned   = Number.isFinite(abandonedIn) ? Math.max(0, abandonedIn) : Math.max(0, presented - handled);
    const avgMin      = Math.max(0, Number($('agentCalcManualAvgHandleMin')?.value) || 0);
    // Total handle-time in seconds = Handled × Avg Handle Time (per call).
    // Abandoned calls don't accumulate talk time so they're excluded here,
    // matching what live fetches store in totals.handleTimeSec.
    const handleTimeSec = handled * avgMin * 60;

    baselineTotals = { presented, handled, abandoned, handleTimeSec };
    // Termination-type breakdown doesn't apply to a single blob of totals,
    // but the metric-cards code branches on it; treat manual as if the
    // Handled/Abandoned split is trustworthy.
    terminationTypeSupported = true;

    $('metric-presented').textContent   = presented.toLocaleString();
    $('metric-handled').textContent     = handled.toLocaleString();
    $('metric-abandoned').textContent   = abandoned.toLocaleString();
    const avgHandleSec = handled > 0 ? handleTimeSec / handled : 0;
    $('metric-avgHandle').textContent   = fmtHMS(avgHandleSec);
    $('metric-totalHours').textContent  = Math.round(handleTimeSec / 3600).toLocaleString();
    $('metric-totalMinutes').textContent= Math.round(handleTimeSec / 60).toLocaleString();

    // Seed scenario inputs from the manual avg-handle every time the user
    // hits Calculate: the input describes how long the bot spends on each
    // call, so it should start "same as human" and let the user adjust
    // DOWN in the Scenario card if the bot is actually faster (e.g. AHT
    // 5 min but bot 2 min). Doing this only-on-Calculate (not live) means
    // adjustments the user makes to the scenario card between Calculates
    // stick until the next Calculate press.
    const avgStr = avgMin.toFixed(1);
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    set('scHumanAHTMin',     avgStr); // Detailed: Human AHT after transfer
    set('scQuickBotMin',     avgStr); // Quick: Avg bot duration per call
    set('scContainedBotMin', avgStr); // Detailed: Avg bot time -- contained
    set('scTransferBotMin',  avgStr); // Detailed: Avg bot time -- transferred
    recomputeScenarioCosts();
  }
  function initManualForm() {
    $('agentCalcManualCalcBtn')?.addEventListener('click', runManualCalc);
    // Auto-fill Abandoned when Presented or Handled change, unless the
    // user has typed a specific abandoned value.
    let userTouchedAbandoned = false;
    $('agentCalcManualAbandoned')?.addEventListener('input', () => { userTouchedAbandoned = true; });
    ['agentCalcManualPresented', 'agentCalcManualHandled'].forEach((id) => {
      $(id)?.addEventListener('input', () => {
        if (userTouchedAbandoned) return;
        const p = Number($('agentCalcManualPresented')?.value) || 0;
        const h = Number($('agentCalcManualHandled')?.value) || 0;
        const ab = $('agentCalcManualAbandoned');
        if (ab) ab.value = Math.max(0, p - h);
      });
    });
  }

  // Volume Base pill (Presented vs Handled). One pill in the Live grid
  // (slot 4), one duplicate in the Manual grid (slot 5) so the user
  // never has to switch modes just to change the volume base. Both are
  // wired to the same `volumeBase` state; picking on either keeps them
  // in sync via applyVolumeBase() below.
  const VOLUME_BASE_TARGETS = [
    { dropdownId: 'volumeBaseDropdown',       toggleId: 'volumeBaseToggle',       labelId: 'volumeBaseLabel' },
    { dropdownId: 'volumeBaseManualDropdown', toggleId: 'volumeBaseManualToggle', labelId: 'volumeBaseManualLabel' }
  ];
  function applyVolumeBase(base) {
    volumeBase = base === 'handled' ? 'handled' : 'presented';
    try { localStorage.setItem(VOLUME_BASE_KEY, volumeBase); } catch {}
    VOLUME_BASE_TARGETS.forEach(({ dropdownId, labelId }) => {
      const dropdown = $(dropdownId);
      if (!dropdown) return;
      const items = Array.from(dropdown.querySelectorAll('.filter-dropdown__item--pick'));
      const active = items.find((it) => it.dataset.volumeBase === volumeBase);
      const label = $(labelId);
      if (active && label) label.textContent = active.querySelector('.filter-dropdown__item-label').textContent;
      items.forEach((it) => it.classList.toggle('is-active', it.dataset.volumeBase === volumeBase));
    });
    recomputeScenarioCosts();
  }
  function initVolumeBaseDropdown() {
    VOLUME_BASE_TARGETS.forEach(({ dropdownId, toggleId }) => {
      const dropdown = $(dropdownId);
      if (!dropdown) return;
      const toggle = $(toggleId);
      const panel = dropdown.querySelector('.filter-dropdown__panel');
      const items = Array.from(dropdown.querySelectorAll('.filter-dropdown__item--pick'));

      items.forEach((it) => {
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          applyVolumeBase(it.dataset.volumeBase);
          dropdown.classList.remove('open');
          toggle?.setAttribute('aria-expanded', 'false');
        });
      });
      toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllControlDropdowns(dropdown);
        const open = dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      panel?.addEventListener('click', (e) => e.stopPropagation());
    });
    applyVolumeBase(volumeBase);
  }

  function initPricingToolbars() {
    loadPricingState();
    initPricingToolbar('agent', CISCO_PRICING.aiAgent.list, {
      show: 'agentCostShowPricing',
      discount: 'agentCostDiscountPct',
      custom: 'agentCostCustomPrice',
      reset: 'agentCostResetToList',
      listLabel: 'agentCostListLabel',
      methodName: 'agentCostMethod'
    });
    initPricingToolbar('assistant', CISCO_PRICING.aiAssistant.list, {
      show: 'assistantCostShowPricing',
      discount: 'assistantCostDiscountPct',
      custom: 'assistantCostCustomPrice',
      reset: 'assistantCostResetToList',
      listLabel: 'assistantCostListLabel',
      methodName: 'assistantCostMethod'
    });
  }

  function bindScenarioInputs() {
    const inputs = ['scQuickBotMin', 'scPctEnterAI', 'scPctContained', 'scContainedBotMin', 'scTransferBotMin', 'scHumanAHTMin'];
    inputs.forEach((id) => $(id)?.addEventListener('input', recomputeScenarioCosts));
    document.querySelectorAll('input[name="scenarioMode"]').forEach((el) => {
      el.addEventListener('change', () => {
        const mode = document.querySelector('input[name="scenarioMode"]:checked')?.value || 'detailed';
        document.querySelectorAll('.agent-calc-scenario-mode').forEach((m) => m.classList.toggle('is-active', m.dataset.mode === mode));
        // Scope to the scenario-inputs blocks -- the Live/Manual control
        // grids also use data-mode-block for their own toggling, and an
        // unscoped selector was hiding them on every scenario switch.
        document.querySelectorAll('.agent-calc-scenario-inputs[data-mode-block]').forEach((b) => { b.hidden = (b.dataset.modeBlock !== mode); });
        recomputeScenarioCosts();
      });
    });
  }

  // Handled Includes dropdown — 3-option filter pill in the step 3 cell.
  function initHandledIncludesDropdown() {
    const dropdown = $('handledIncludesDropdown');
    if (!dropdown) return;
    const toggle = $('handledIncludesToggle');
    const panel = dropdown.querySelector('.filter-dropdown__panel');
    const label = $('handledIncludesLabel');
    const badge = dropdown.querySelector('.filter-dropdown__badge');

    function updateLabel() {
      // Normal is always in; sudden/short are togglable.
      const sudden = $('agentCalcInclSuddenDisconnect')?.checked;
      const short = $('agentCalcInclShortCall')?.checked;
      const optional = (sudden ? 1 : 0) + (short ? 1 : 0);
      const total = 1 + optional;
      if (label) label.textContent = total === 3 ? 'All 3' : `${total} of 3`;
      if (badge) { badge.textContent = String(total); badge.hidden = total === 0; }
    }
    updateLabel();

    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllControlDropdowns(dropdown);
      const open = dropdown.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel?.addEventListener('click', (e) => e.stopPropagation());
    ['agentCalcInclSuddenDisconnect', 'agentCalcInclShortCall'].forEach((id) => {
      $(id)?.addEventListener('change', () => { updateLabel(); recomputeScenarioCosts(); });
    });
  }

  function setStatus(text) { const el = $('agentCalcStatus'); if (el) el.textContent = text; }

  function setProgress(text, active) {
    const wrap = $('agentCalcProgress');
    const label = $('agentCalcProgressLabel');
    if (label) label.textContent = text;
    if (wrap) wrap.classList.toggle('is-active', !!active);
  }

  function showOverlay(label, detail) {
    const el = $('agentCalcOverlay');
    if (!el) return;
    el.classList.add('is-visible');
    setOverlay(label, detail, 0, 1, 0);
  }

  function hideOverlay() {
    const el = $('agentCalcOverlay');
    if (el) el.classList.remove('is-visible');
  }

  function setOverlay(label, detail, weeksDone, weeksTotal, tasksSoFar) {
    const l = $('agentCalcOverlayLabel');
    const d = $('agentCalcOverlayDetail');
    const bar = $('agentCalcOverlayBar');
    const counts = $('agentCalcOverlayCounts');
    if (l && label != null) l.textContent = label;
    if (d && detail != null) d.textContent = detail;
    if (bar) {
      const pct = weeksTotal > 0 ? Math.min(100, (weeksDone / weeksTotal) * 100) : 0;
      bar.style.width = `${pct}%`;
    }
    if (counts) counts.textContent = `${weeksDone} / ${weeksTotal} week${weeksTotal === 1 ? '' : 's'} · ${tasksSoFar.toLocaleString()} tasks`;
  }

  // ---- Analyzer-style date presets ----
  function startOfDay(d) { const n = new Date(d); n.setHours(0, 0, 0, 0); return n; }
  function endOfDay(d) { const n = new Date(d); n.setHours(23, 59, 59, 999); return n; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  // Cisco Analyzer's default Start Day of the Week for this org is Monday, so
  // "Last Week" runs Mon 00:00 through the following Sun 23:59. Match that or
  // the offered/handled counts drift by a day at each edge of the range.
  function startOfWeek(d) {
    const n = startOfDay(d);
    const dow = n.getDay(); // 0=Sun ... 6=Sat
    const daysBack = dow === 0 ? 6 : dow - 1;
    n.setDate(n.getDate() - daysBack);
    return n;
  }
  function endOfWeek(d) { return endOfDay(addDays(startOfWeek(d), 6)); }
  function startOfMonth(d) { const n = startOfDay(d); n.setDate(1); return n; }
  function endOfMonth(d) { const n = startOfMonth(d); n.setMonth(n.getMonth() + 1); n.setDate(0); return endOfDay(n); }
  function startOfYear(d) { const n = startOfDay(d); n.setMonth(0, 1); return n; }

  function windowForPreset(preset) {
    const now = new Date();
    switch (preset) {
      case 'today': return { fromMs: startOfDay(now).getTime(), toMs: endOfDay(now).getTime() };
      case 'yesterday': { const y = addDays(now, -1); return { fromMs: startOfDay(y).getTime(), toMs: endOfDay(y).getTime() }; }
      case 'this-week': return { fromMs: startOfWeek(now).getTime(), toMs: endOfDay(now).getTime() };
      case 'last-week': { const lw = addDays(startOfWeek(now), -7); return { fromMs: lw.getTime(), toMs: endOfWeek(lw).getTime() }; }
      case 'last-7': return { fromMs: startOfDay(addDays(now, -6)).getTime(), toMs: endOfDay(now).getTime() };
      case 'this-month': return { fromMs: startOfMonth(now).getTime(), toMs: endOfDay(now).getTime() };
      case 'last-month': { const lm = startOfMonth(addDays(startOfMonth(now), -1)); return { fromMs: lm.getTime(), toMs: endOfMonth(lm).getTime() }; }
      case 'this-year': return { fromMs: startOfYear(now).getTime(), toMs: endOfDay(now).getTime() };
      case 'custom': {
        const fromEl = $('agentCalcFrom');
        const toEl = $('agentCalcTo');
        if (!fromEl?.value || !toEl?.value) return null;
        const f = new Date(fromEl.value); const t = new Date(toEl.value);
        if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null;
        const fromMs = startOfDay(f).getTime();
        const toMs = endOfDay(t).getTime();
        if (toMs <= fromMs) return null;
        return { fromMs, toMs };
      }
      default: return null;
    }
  }

  // The aggregate `task` root can only do `count(*)` — the WxCC schema has no
  // distinct-count aggregation type. To match Cisco Analyzer's Count of
  // Contact Session ID (which IS distinct) we do a cheap secondary fetch of
  // just sessionId + terminationType per task and dedupe in JS. Response is
  // tiny (~40 bytes per task); a queue with 300 tasks in a year finishes in
  // one page.
  function getSelectedHandledTypes() {
    const types = ['normal']; // always
    if ($('agentCalcInclSuddenDisconnect')?.checked) types.push('sudden_disconnect');
    if ($('agentCalcInclShortCall')?.checked) types.push('short_call');
    return types;
  }
  async function fetchDistinctSessionCounts(auth, fromMs, toMs, queueId) {
    const handledSet = new Set(getSelectedHandledTypes());
    const sessions = new Set();
    const handledSessions = new Set();
    let cursor = '0';
    for (let page = 0; page < 500; page += 1) {
      const query = `{
  taskDetails(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    pagination: { cursor: "${cursor}" }
    filter: { and: [
      { channelType: { equals: telephony } }
      ${queueFilterClause(queueId)}
    ] }
  ) {
    tasks { contactSessionId terminationType }
    pageInfo { hasNextPage endCursor }
  }
}`;
      const result = await fetchGraphQL(query, auth);
      if (result?.error) {
        console.warn('[agent-calculator] distinct-count fetch failed, keeping aggregation counts:', result.error);
        return null;
      }
      const root = result?.data?.taskDetails;
      const tasks = Array.isArray(root?.tasks) ? root.tasks : [];
      tasks.forEach((t) => {
        const sid = t?.contactSessionId;
        if (!sid) return;
        sessions.add(sid);
        if (handledSet.has(t?.terminationType)) handledSessions.add(sid);
      });
      const nextCursor = root?.pageInfo?.endCursor;
      if (!root?.pageInfo?.hasNextPage || !nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }
    return { presented: sessions.size, handled: handledSessions.size };
  }

  async function runAnalysis() {
    const auth = getAuthState();
    if (!auth) { setStatus('Not signed in — go to Home first to authenticate.'); return; }
    const selectedQueues = queueCache
      .map((q) => ({ id: String(q?.id || ''), name: q?.name || q?.displayName || 'Unnamed queue' }))
      .filter((q) => q.id && (queueAllSelected || queueSelections.has(q.id)));
    if (selectedQueues.length === 0) {
      setStatus('Pick at least one queue (or Select All) before running.');
      return;
    }
    const window = windowForPreset(activePreset);
    if (!window) { setStatus('Pick a valid date range.'); return; }

    // Reset every schema-probe flag on each Run so the previous run's failed
    // cascade never leaves us stuck on an idx past a shape that would have
    // worked. First queue eats the probe cost; the successful shape sticks
    // for the rest of the run.
    queueFilterShapeIdx = 0;
    countFieldIdx = 0;
    countTypeIdx = 0;
    terminationTypeSupported = true;
    maxAggSupported = true;

    const runBtn = $('agentCalcRunBtn');
    if (runBtn) runBtn.disabled = true;

    const rangeLabel = `${new Date(window.fromMs).toLocaleDateString()} → ${new Date(window.toMs).toLocaleDateString()}`;
    const intervalLabelText = rangeLabel;
    setStatus(`Fetching ${selectedQueues.length} queue${selectedQueues.length === 1 ? '' : 's'} for ${rangeLabel}…`);
    showOverlay('Loading Webex Contact Center data', `Range: ${rangeLabel} · ${selectedQueues.length} queues`);

    let completed = 0;
    try {
      const results = await mapPool(selectedQueues, MAX_CONCURRENT_FETCHES, async (queue) => {
        // Fire the aggregation and the distinct-count dedup fetch in parallel
        // per queue. Aggregation is one request; distinct-count is 1-N tiny
        // paginated requests depending on task volume.
        const [agg, distinct] = await Promise.all([
          fetchQueueWeekAggregate(auth, window.fromMs, window.toMs, queue.id),
          fetchDistinctSessionCounts(auth, window.fromMs, window.toMs, queue.id)
        ]);
        completed += 1;
        setOverlay(null, `Finished ${queue.name}`, completed, selectedQueues.length, 0);
        return { queue, agg, distinct };
      });

      setOverlay('Aggregating', 'Building the report…', selectedQueues.length, selectedQueues.length, 0);
      await new Promise((r) => setTimeout(r, 20));
      const rows = results
        .map(({ queue, agg, distinct }) => {
          const row = buildRowFromAggregate(queue.name, intervalLabelText, agg);
          // Override with distinct-session counts when the dedup fetch worked.
          if (distinct) {
            row.presented = distinct.presented;
            row.handled = distinct.handled;
            row.abandoned = Math.max(0, distinct.presented - distinct.handled);
            row.pctHandled = distinct.presented > 0 ? distinct.handled / distinct.presented : null;
          }
          return row;
        })
        .filter((r) => r.presented > 0);
      updateSummary(rows);
      renderTable(rows);
      const flags = [];
      if (!terminationTypeSupported) flags.push('handled: unavailable');
      if (!maxAggSupported) flags.push('max: unavailable');
      const dedupCount = results.filter((r) => r.distinct).length;
      flags.unshift(`dedup: ${dedupCount}/${results.length} queues`);
      flags.unshift(`handled = ${getSelectedHandledTypes().join(' | ')}`);
      setStatus(`Done — ${selectedQueues.length} queue${selectedQueues.length === 1 ? '' : 's'}, ${rows.length} row${rows.length === 1 ? '' : 's'} · queue: ${queueFilterName()}${flags.length ? ' · ' + flags.join(' · ') : ''}.`);
    } catch (err) {
      console.error('[agent-calculator] run failed', err);
      setStatus(`Failed to load data: ${err?.message || err}`);
    } finally {
      hideOverlay();
      setProgress('', false);
      if (runBtn) runBtn.disabled = false;
    }
  }

  function bindRangeSelect() {
    const dropdown = $('agentCalcRangeDropdown');
    if (!dropdown) return;
    const toggle = $('agentCalcRangeToggle');
    const label = $('agentCalcRangeLabel');
    const panel = dropdown.querySelector('.filter-dropdown__panel');
    const items = Array.from(dropdown.querySelectorAll('.filter-dropdown__item--pick'));
    const customRange = $('agentCalcCustomRange');

    function applyPreset(preset) {
      activePreset = preset;
      const active = items.find((it) => it.dataset.preset === preset);
      if (active && label) label.textContent = active.querySelector('.filter-dropdown__item-label').textContent;
      items.forEach((it) => it.classList.toggle('is-active', it.dataset.preset === preset));
      if (customRange) customRange.classList.toggle('is-visible', preset === 'custom');
    }

    items.forEach((it) => {
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        applyPreset(it.dataset.preset);
        dropdown.classList.remove('open');
        toggle?.setAttribute('aria-expanded', 'false');
      });
    });

    toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllControlDropdowns(dropdown);
      const open = dropdown.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel?.addEventListener('click', (e) => e.stopPropagation());

    applyPreset(activePreset);
  }

  function prefillCustomRange() {
    const now = new Date();
    const from = addDays(now, -30);
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fromEl = $('agentCalcFrom');
    const toEl = $('agentCalcTo');
    if (fromEl) fromEl.value = toISO(from);
    if (toEl) toEl.value = toISO(now);
  }

  async function bootstrap() {
    bindRangeSelect();
    prefillCustomRange();
    initQueueDropdown();
    initHandledIncludesDropdown();
    initVolumeBaseDropdown();
    initDataModeToggle();
    initManualForm();
    bindScenarioInputs();
    initPricingToolbars();
    // Single outside-click closer for every control-row dropdown. Toggle
    // and panel handlers call e.stopPropagation(), so a click here means
    // the user clicked outside all three dropdowns -- close whatever's open.
    document.addEventListener('click', () => closeAllControlDropdowns(null));
    $('agentCalcRunBtn')?.addEventListener('click', runAnalysis);
    $('agentCalcExportPdfBtn')?.addEventListener('click', () => window.print());
    const auth = getAuthState();
    if (!auth) { setStatus('Not signed in — go to Home first to authenticate.'); return; }
    setStatus('Loading queues…');
    await fetchQueueList(auth);
    renderQueueOptions();
    if (queueCache.length === 0) {
      setStatus('No queues found in this org. Sign in on Home first if you were redirected here.');
      return;
    }
    setStatus('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
