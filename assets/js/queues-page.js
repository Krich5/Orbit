(function () {
  const ENDPOINT = (orgId) =>
    `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/v3/contact-service-queue?page=0&pageSize=200`;

  const cacheKeyBearer = 'authBearer';
  const cacheKeyOrg    = 'authOrg';

  // ── Filter state ──
  let nameSelections       = new Set();
  let directionSelections  = new Set();
  let channelSelections    = new Set();
  let routingSelections    = new Set();
  let assignmentSelections = new Set();
  let nameAllSelected       = true;
  let directionAllSelected  = true;
  let channelAllSelected    = true;
  let routingAllSelected    = true;
  let assignmentAllSelected = true;
  let filtersLoaded = false;

  // ── Sort state ──
  let sortKey = 'name';
  let sortDir = 1;

  // ── Data ──
  let allQueues = [];
  let globalSearchTerm = '';
  let dependencyScanActive = false;
  const dependencyCache = new Map();

  // ── DOM refs ──
  let queueTableBody, queueCountPill, scanAllBtn, exportAllBtn, statusText, searchInput;

  function initDomRefs() {
    queueTableBody = document.getElementById('queueTableBody');
    queueCountPill = document.getElementById('queueCountPill');
    scanAllBtn     = document.getElementById('scanAllBtn');
    exportAllBtn   = document.getElementById('exportAllBtn');
    statusText     = document.getElementById('statusText');
    searchInput    = document.getElementById('searchInput');
  }

  // ── Helpers ──
  function getOrgIdValue() {
    const cached = localStorage.getItem('authOrgId') || '';
    if (cached) {
      if (/^Y2lz/i.test(cached)) {
        try {
          const padded = cached.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cached.length / 4) * 4, '=');
          const decoded = atob(padded);
          const parts = decoded.split('/');
          const result = parts[parts.length - 1] || decoded;
          localStorage.setItem('authOrgId', result);
          return result;
        } catch { return cached; }
      }
      const idx = cached.toLowerCase().indexOf('organization/');
      if (idx !== -1) {
        const c = cached.slice(idx + 'organization/'.length);
        if (c) { localStorage.setItem('authOrgId', c); return c; }
      }
      return cached;
    }
    const raw = localStorage.getItem(cacheKeyOrg) || '';
    if (!raw) return '';
    if (/^Y2lz/i.test(raw)) {
      try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const decoded = atob(padded);
        return decoded.split('/').pop() || decoded;
      } catch { return raw; }
    }
    const idx = raw.toLowerCase().indexOf('organization/');
    if (idx !== -1) return raw.slice(idx + 'organization/'.length) || raw;
    return raw;
  }

  function formatEnum(val) {
    if (!val) return '';
    return val.toString().split('_').filter(Boolean)
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  }

  function copyButton(val, title, extraClass = '') {
    if (!val) return '';
    return `<button class="copyInline ${extraClass}" title="${title}" data-copy-value="${String(val).replace(/"/g, '&quot;')}">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>`;
  }

  // ── Checkbox filter list (same pattern as dashboard) ──
  function renderCheckboxList(listEl, searchEl, items, selections, options) {
    if (!listEl) return;
    const { onChange, allSelected = false, setAllSelected = () => {} } = options || {};
    const allValues  = items.map((i) => i.value);
    const validSet   = new Set(allValues);
    [...selections].forEach((v) => { if (!validSet.has(v)) selections.delete(v); });
    if (allSelected) { selections.clear(); allValues.forEach((v) => selections.add(v)); }
    const term           = (searchEl?.value || '').toLowerCase();
    const filtered       = term ? items.filter((i) => i.label.toLowerCase().includes(term)) : items;
    const filteredValues = filtered.map((i) => i.value);
    const allVisibleSel  = filteredValues.length > 0 && filteredValues.every((v) => selections.has(v));
    listEl.innerHTML =
      `<label class="filter-dropdown__item filter-dropdown__item--select-all">
        <input type="checkbox" data-select-all="true"${allVisibleSel ? ' checked' : ''}>
        <span class="filter-dropdown__item-label">Select all</span>
      </label>` +
      filtered.map((item) =>
        `<label class="filter-dropdown__item">
          <input type="checkbox" value="${item.value}"${selections.has(item.value) ? ' checked' : ''}>
          <span class="filter-dropdown__item-label">${item.label}</span>
        </label>`
      ).join('');
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.dataset.selectAll === 'true') {
          if (cb.checked) {
            if (term) {
              filteredValues.forEach((v) => selections.add(v));
              setAllSelected(selections.size === allValues.length && allValues.length > 0);
            } else {
              selections.clear(); allValues.forEach((v) => selections.add(v)); setAllSelected(true);
            }
          } else { selections.clear(); setAllSelected(false); }
        } else {
          setAllSelected(false);
          if (cb.checked) selections.add(cb.value); else selections.delete(cb.value);
          if (selections.size === allValues.length && allValues.length > 0) setAllSelected(true);
        }
        onChange();
      });
    });
  }

  function uniqueItems(key) {
    const seen = new Set();
    return allQueues
      .filter((q) => q[key])
      .map((q) => ({ value: q[key], label: formatEnum(q[key]) }))
      .filter((item) => { if (seen.has(item.value)) return false; seen.add(item.value); return true; })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function renderFilterOptions() {
    renderCheckboxList(
      document.getElementById('nameList'), document.getElementById('nameSearch'),
      allQueues.map((q) => ({ value: q.id, label: q.name || 'Unnamed' })).sort((a,b) => a.label.localeCompare(b.label)),
      nameSelections,
      { allSelected: nameAllSelected, setAllSelected: (v) => { nameAllSelected = v; }, onChange: renderTable }
    );
    renderCheckboxList(
      document.getElementById('directionList'), document.getElementById('directionSearch'),
      uniqueItems('queueType'), directionSelections,
      { allSelected: directionAllSelected, setAllSelected: (v) => { directionAllSelected = v; }, onChange: renderTable }
    );
    renderCheckboxList(
      document.getElementById('channelList'), document.getElementById('channelSearch'),
      uniqueItems('channelType'), channelSelections,
      { allSelected: channelAllSelected, setAllSelected: (v) => { channelAllSelected = v; }, onChange: renderTable }
    );
    renderCheckboxList(
      document.getElementById('routingList'), document.getElementById('routingSearch'),
      uniqueItems('routingType'), routingSelections,
      { allSelected: routingAllSelected, setAllSelected: (v) => { routingAllSelected = v; }, onChange: renderTable }
    );
    renderCheckboxList(
      document.getElementById('assignmentList'), document.getElementById('assignmentSearch'),
      uniqueItems('queueRoutingType'), assignmentSelections,
      { allSelected: assignmentAllSelected, setAllSelected: (v) => { assignmentAllSelected = v; }, onChange: renderTable }
    );
  }

  function initFilterSelections() {
    const ids = allQueues.map((q) => q.id);
    nameSelections.clear(); ids.forEach((id) => nameSelections.add(id)); nameAllSelected = true;
    directionSelections.clear();  uniqueItems('queueType').forEach((i) => directionSelections.add(i.value));  directionAllSelected  = true;
    channelSelections.clear();    uniqueItems('channelType').forEach((i) => channelSelections.add(i.value));  channelAllSelected    = true;
    routingSelections.clear();    uniqueItems('routingType').forEach((i) => routingSelections.add(i.value));  routingAllSelected    = true;
    assignmentSelections.clear(); uniqueItems('queueRoutingType').forEach((i) => assignmentSelections.add(i.value)); assignmentAllSelected = true;
    renderFilterOptions();
  }

  // ── Filter + sort ──
  function applyFiltersAndSort() {
    let rows = allQueues.filter((q) => {
      if (!nameAllSelected       && !nameSelections.has(q.id))            return false;
      if (!directionAllSelected  && !directionSelections.has(q.queueType))  return false;
      if (!channelAllSelected    && !channelSelections.has(q.channelType))   return false;
      if (!routingAllSelected    && !routingSelections.has(q.routingType))   return false;
      if (!assignmentAllSelected && !assignmentSelections.has(q.queueRoutingType)) return false;
      if (globalSearchTerm) {
        const blob = `${q.name || ''} ${q.description || ''} ${q.id || ''}`.toLowerCase();
        if (!blob.includes(globalSearchTerm)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const av = String(a[sortKey] || '').toLowerCase();
      const bv = String(b[sortKey] || '').toLowerCase();
      if (av < bv) return -sortDir;
      if (av > bv) return  sortDir;
      return 0;
    });
    return rows;
  }

  // ── Render table body ──
  function renderTable() {
    if (!queueTableBody) return;
    const rows = applyFiltersAndSort();

    if (queueCountPill) queueCountPill.textContent = `${allQueues.length} queues`;
    if (scanAllBtn) {
      scanAllBtn.disabled = !allQueues.length || dependencyScanActive;
      scanAllBtn.style.display = allQueues.length ? '' : 'none';
    }
    if (exportAllBtn) exportAllBtn.disabled = !allQueues.length;

    if (!rows.length) {
      queueTableBody.innerHTML = `<tr><td colspan="7" class="realtime-status">No queues match filters.</td></tr>`;
      return;
    }
    queueTableBody.innerHTML = rows.map((q) => `
      <tr>
        <td>
          <div class="queue-name-cell">
            <span class="copyText" ${q.name ? `data-copy-text="${String(q.name).replace(/"/g, '&quot;')}" title="Click to copy name"` : ''}>${q.name || 'Unnamed queue'}</span>
            ${copyButton(q.name || '', 'Copy name')}
            <div class="queueIdRow">
              <span class="queueIdSub${q.id ? ' copyText' : ''}" ${q.id ? `data-copy-text="${String(q.id).replace(/"/g, '&quot;')}" title="Click to copy ID"` : ''}>${q.id || '—'}</span>
              ${copyButton(q.id || '', 'Copy ID', 'copyInline--mini')}
            </div>
          </div>
        </td>
        <td>${q.description || '<span class="muted">—</span>'}</td>
        <td>${renderDependencyCell(q)}</td>
        <td>${q.queueType ? `<span class="state-badge state-badge--${q.queueType.toLowerCase()}">${formatEnum(q.queueType)}</span>` : '—'}</td>
        <td>${q.channelType ? `<span class="state-badge state-badge--${q.channelType.toLowerCase()}">${formatEnum(q.channelType)}</span>` : '—'}</td>
        <td>${formatEnum(q.routingType) || '—'}</td>
        <td>${formatEnum(q.queueRoutingType) || '—'}</td>
      </tr>`).join('');

    bindCopyValueButtons();
    bindCopyText();
    updateSortHeaders();
  }

  function updateSortHeaders() {
    document.querySelectorAll('#queueTable thead th[data-sort]').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === sortKey) th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    });
  }

  // ── Dependency cell ──
  function renderDependencyCell(q) {
    const queueId   = q.id   || '';
    const queueName = (q.name || '').replace(/"/g, '&quot;');
    if (!queueId) return '<span class="muted">—</span>';
    const cached = dependencyCache.get(queueId);
    if (cached?.status === 'scanning') return '<span class="muted">Scanning…</span>';
    if (cached?.status === 'error')    return `<button class="depBtn" data-queue-id="${queueId}" data-queue-name="${queueName}">Retry</button>`;
    if (cached?.status === 'ok') {
      const total = cached?.data?.meta?.totalRecords || 0;
      return `<span class="queuePill">${total ? `${total} refs` : 'No refs'}</span>
              <button class="depBtn" data-queue-id="${queueId}" data-queue-name="${queueName}">View</button>`;
    }
    return `<button class="depBtn" data-queue-id="${queueId}" data-queue-name="${queueName}">Scan</button>`;
  }

  // ── Copy bindings ──
  function bindCopyValueButtons() {
    document.querySelectorAll('[data-copy-value]').forEach((btn) => {
      if (btn._copyBound) return;
      btn._copyBound = true;
      btn.addEventListener('click', async () => {
        const val = btn.getAttribute('data-copy-value') || '';
        if (!val) return;
        const original = btn.innerHTML;
        try {
          await navigator.clipboard.writeText(val);
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>';
          setTimeout(() => { btn.innerHTML = original; }, 900);
        } catch (err) { console.error('Copy failed', err); }
      });
    });
  }

  function bindCopyText() {
    document.querySelectorAll('[data-copy-text]').forEach((el) => {
      if (el._copyTextBound) return;
      el._copyTextBound = true;
      el.addEventListener('click', async () => {
        const val = el.getAttribute('data-copy-text') || '';
        if (!val) return;
        const orig = el._copyOriginalTitle ?? el.title;
        el._copyOriginalTitle = orig;
        try {
          await navigator.clipboard.writeText(val);
          el.classList.add('copied'); el.title = 'Copied';
          const existing = el.nextElementSibling?.classList?.contains('copyBadge') ? el.nextElementSibling : null;
          if (existing) existing.remove();
          const badge = document.createElement('span');
          badge.className = 'copyBadge'; badge.textContent = 'Copied!';
          el.insertAdjacentElement('afterend', badge);
          setTimeout(() => { el.classList.remove('copied'); el.title = orig || ''; badge.remove(); }, 900);
        } catch (err) { console.error('Copy failed', err); }
      });
    });
  }

  // ── Filter panel open/close (portal pattern) ──
  function bindFilterEvents() {
    let activePanelState = null;
    const DROPDOWNS = ['nameDropdown', 'directionDropdown', 'channelDropdown', 'routingDropdown', 'assignmentDropdown'];

    function positionPanel(toggle, panel) {
      const rect = toggle.getBoundingClientRect();
      panel.style.top  = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }
    function openPanel(wrapper, toggle, panel) {
      document.body.appendChild(panel);
      panel.style.position = 'fixed';
      panel.style.display  = 'flex';
      panel.style.zIndex   = '9999';
      positionPanel(toggle, panel);
      activePanelState = { wrapper, toggle, panel };
      panel.querySelector('input')?.focus();
    }
    function closePanel(wrapper, panel) {
      if (panel.parentElement === document.body) wrapper.appendChild(panel);
      panel.style.position = '';
      panel.style.top      = '';
      panel.style.left     = '';
      panel.style.display  = '';
      panel.style.zIndex   = '';
      if (activePanelState?.panel === panel) activePanelState = null;
    }
    function closeAll(exceptId) {
      DROPDOWNS.forEach((id) => {
        if (id === exceptId) return;
        const wrapper = document.getElementById(id);
        if (!wrapper || !wrapper.classList.contains('open')) return;
        wrapper.classList.remove('open');
        wrapper.querySelector('.filter-icon-btn')?.setAttribute('aria-expanded', 'false');
        const panel = wrapper.querySelector('.filter-dropdown__panel');
        if (panel) closePanel(wrapper, panel);
      });
    }

    DROPDOWNS.forEach((id) => {
      const wrapper = document.getElementById(id);
      if (!wrapper) return;
      const toggle = wrapper.querySelector('.filter-icon-btn');
      const panel  = wrapper.querySelector('.filter-dropdown__panel');
      toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        closeAll(id);
        if (isOpen && panel) openPanel(wrapper, toggle, panel);
        else if (!isOpen && panel) closePanel(wrapper, panel);
      });
    });

    // re-render list on search input
    document.getElementById('nameSearch')?.addEventListener('input', () => renderFilterOptions());
    document.getElementById('directionSearch')?.addEventListener('input', () => renderFilterOptions());
    document.getElementById('channelSearch')?.addEventListener('input', () => renderFilterOptions());
    document.getElementById('routingSearch')?.addEventListener('input', () => renderFilterOptions());
    document.getElementById('assignmentSearch')?.addEventListener('input', () => renderFilterOptions());

    // close on outside click
    document.addEventListener('click', (e) => {
      if (e.target.closest('.filter-icon-btn') || e.target.closest('.filter-dropdown__panel')) return;
      DROPDOWNS.forEach((id) => {
        const wrapper = document.getElementById(id);
        if (!wrapper || !wrapper.classList.contains('open')) return;
        wrapper.classList.remove('open');
        wrapper.querySelector('.filter-icon-btn')?.setAttribute('aria-expanded', 'false');
        const panel = wrapper.querySelector('.filter-dropdown__panel');
        if (panel) closePanel(wrapper, panel);
      });
    });

    // reposition on scroll/resize
    function syncPosition() {
      if (!activePanelState) return;
      positionPanel(activePanelState.toggle, activePanelState.panel);
    }
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);

    // sortable column headers
    document.getElementById('queueTable')?.addEventListener('click', (e) => {
      if (e.target.closest('.filter-icon-btn') || e.target.closest('.filter-dropdown__panel')) return;
      const trigger = e.target.closest('[data-sort-trigger]');
      const th = trigger?.closest('th[data-sort]') || e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
      renderTable();
    });
  }

  // ── Dep modal ──
  function ensureDepModal() {
    let modal = document.querySelector('.depModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'depModal';
    modal.innerHTML = `
      <div class="depCard" role="dialog" aria-modal="true">
        <div class="depHeader">
          <div>
            <h3 class="depTitle">Queue Dependencies</h3>
            <div class="depSub" id="depQueueName"></div>
          </div>
          <button class="depClose" type="button" aria-label="Close">×</button>
        </div>
        <div class="depPills" id="depEntities"></div>
        <div id="depBody"></div>
        <div class="depFooter" id="depFooter"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.depClose').addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
    return modal;
  }

  async function fetchDependencies(queueId) {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId  = getOrgIdValue();
    if (!bearer || !orgId) throw new Error('Missing auth');
    const url = `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/contact-service-queue/${encodeURIComponent(queueId)}/incoming-references`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message?.[0]?.description || `HTTP ${res.status}`);
    return data;
  }

  async function analyzeQueueDependencies(queueId, options = {}) {
    if (!queueId) return;
    dependencyCache.set(queueId, { status: 'scanning' });
    if (!options.silent) renderTable();
    try {
      dependencyCache.set(queueId, { status: 'ok', data: await fetchDependencies(queueId) });
    } catch (err) {
      dependencyCache.set(queueId, { status: 'error', error: err.message || String(err) });
    }
  }

  async function deleteQueue(queueId) {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId  = getOrgIdValue();
    if (!bearer || !orgId) throw new Error('Missing auth');
    const res = await fetch(
      `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/contact-service-queue/${encodeURIComponent(queueId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${bearer}` } }
    );
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  }

  // ── API ──
  async function fetchQueues() {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId  = getOrgIdValue();
    if (!bearer || !orgId) {
      if (queueTableBody) queueTableBody.innerHTML = `<tr><td colspan="7" class="realtime-status">Not authenticated.</td></tr>`;
      return;
    }
    if (queueTableBody) queueTableBody.innerHTML = `<tr><td colspan="7" class="realtime-status">Loading queues…</td></tr>`;
    try {
      const res    = await fetch(ENDPOINT(orgId), { headers: { Authorization: `Bearer ${bearer}` } });
      const parsed = await res.json();
      allQueues = Array.isArray(parsed?.data || parsed?.items || parsed?.queues || parsed)
        ? (parsed?.data || parsed?.items || parsed?.queues || parsed).filter(Boolean)
        : [];
      if (!res.ok) {
        if (queueTableBody) queueTableBody.innerHTML = `<tr><td colspan="7" class="realtime-status">Error (${res.status}) loading queues.</td></tr>`;
        return;
      }
      if (!filtersLoaded) { initFilterSelections(); filtersLoaded = true; }
      else                { renderFilterOptions(); }
      renderTable();
    } catch {
      if (queueTableBody) queueTableBody.innerHTML = `<tr><td colspan="7" class="realtime-status">Network error loading queues.</td></tr>`;
    }
  }

  async function scanAllDependencies() {
    if (dependencyScanActive || !allQueues.length) return;
    dependencyScanActive = true;
    if (scanAllBtn) { scanAllBtn.disabled = true; scanAllBtn.textContent = `Scanning ${allQueues.length}…`; }
    let completed = 0;
    for (const q of allQueues) {
      await analyzeQueueDependencies(q.id, { silent: true });
      completed++;
      if (statusText) statusText.textContent = `Scanning dependencies ${completed} of ${allQueues.length}…`;
    }
    dependencyScanActive = false;
    if (scanAllBtn) { scanAllBtn.disabled = false; scanAllBtn.textContent = 'Scan All Dependencies'; }
    if (statusText) statusText.textContent = 'Dependency scan complete.';
    renderTable();
  }

  function exportQueuesCSV() {
    const rows = applyFiltersAndSort();
    if (!rows.length) return;
    const headers = ['Name', 'ID', 'Description', 'Direction', 'Channel', 'Routing', 'Assignment'];
    const csv = [
      headers.join(','),
      ...rows.map((q) => [
        q.name || '', q.id || '', q.description || '',
        formatEnum(q.queueType) || '', formatEnum(q.channelType) || '',
        formatEnum(q.routingType) || '', formatEnum(q.queueRoutingType) || ''
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `wxcc-queues-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }


  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    initDomRefs();
    bindFilterEvents();

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        globalSearchTerm = (e.target.value || '').toLowerCase().trim();
        renderTable();
      });
    }

    if (queueTableBody) {
      queueTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.depBtn');
        if (!btn) return;
        const queueId   = btn.dataset.queueId;
        const queueName = btn.dataset.queueName || 'Queue';
        if (!queueId) return;
        const modal    = ensureDepModal();
        const body     = modal.querySelector('#depBody');
        const footer   = modal.querySelector('#depFooter');
        const entities = modal.querySelector('#depEntities');
        modal.querySelector('#depQueueName').textContent = queueName;
        body.innerHTML = '<div class="depStatus">Loading dependencies…</div>';
        footer.innerHTML = ''; entities.innerHTML = '';
        modal.classList.add('open');
        try {
          const cached = dependencyCache.get(queueId);
          const data   = cached?.status === 'ok' ? cached.data : await fetchDependencies(queueId);
          if (cached?.status !== 'ok') dependencyCache.set(queueId, { status: 'ok', data });
          const refs = data?.meta?.referencedEntities || [];
          const rows = Array.isArray(data?.data) ? data.data : [];
          entities.innerHTML = refs.length
            ? refs.map((r) => `<span class="depPill">${r}</span>`).join('')
            : '<span class="depPill">No references</span>';
          if (!rows.length) {
            body.innerHTML = '<div class="depStatus">No references found for this queue.</div>';
            const delBtn = document.createElement('button');
            delBtn.className = 'depDelete'; delBtn.type = 'button'; delBtn.textContent = 'Delete Queue';
            delBtn.addEventListener('click', async () => {
              delBtn.disabled = true; delBtn.textContent = 'Deleting…';
              try {
                await deleteQueue(queueId);
                modal.classList.remove('open');
                fetchQueues();
              } catch (err) {
                delBtn.disabled = false; delBtn.textContent = 'Delete Queue';
                body.innerHTML = `<div class="depStatus">Delete failed: ${err.message || err}</div>`;
              }
            });
            footer.appendChild(delBtn);
            return;
          }
          body.innerHTML = `
            <table class="depTable">
              <thead><tr><th>Entity name</th><th>ID</th></tr></thead>
              <tbody>${rows.map((r) => `<tr><td>${r.name || '—'}</td><td>${r.id || '—'}</td></tr>`).join('')}</tbody>
            </table>`;
        } catch (err) {
          body.innerHTML = `<div class="depStatus">Failed to load: ${err.message || err}</div>`;
        }
      });
    }

    if (scanAllBtn)   scanAllBtn.addEventListener('click', scanAllDependencies);
    if (exportAllBtn) exportAllBtn.addEventListener('click', exportQueuesCSV);

    fetchQueues();
  });
})();
