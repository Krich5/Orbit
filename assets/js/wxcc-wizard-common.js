/* Shared boilerplate for WxCC pages that call the Cisco Contact Center APIs directly
   from the browser (org resolution, bearer token, fetch helpers, a generic bulk-row
   grid engine, and a per-row ○/⟳/✓/✗ progress checklist). Extracted for Bulk Import
   so a 6th page doesn't copy-paste the same block the 5 wizard step files already
   duplicate — those existing files are left untouched. */
(function (global) {
  'use strict';

  function decodeOrgId(raw) {
    if (!raw) return '';
    if (/^[0-9a-fA-F-]{30,}$/.test(raw)) return raw;
    if (/^Y2lz/i.test(raw)) {
      try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const decoded = atob(padded);
        const parts = decoded.split('/');
        return parts[parts.length - 1] || decoded;
      } catch {
        return raw;
      }
    }
    const orgPathIdx = raw.toLowerCase().indexOf('organization/');
    if (orgPathIdx !== -1) {
      const candidate = raw.slice(orgPathIdx + 'organization/'.length);
      return candidate || raw;
    }
    return raw;
  }

  function resolveOrgId() {
    const storedId = (localStorage.getItem('authOrgId') || '').trim();
    if (storedId) return decodeOrgId(storedId) || storedId;
    const raw = (localStorage.getItem('authOrg') || '').trim();
    if (raw) return decodeOrgId(raw) || raw;
    return '';
  }

  const ORG_ID = resolveOrgId();
  const BASE_URL = `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(ORG_ID)}`;
  const WEBEX_BASE = 'https://webexapis.com';
  const authToken = (localStorage.getItem('authBearer') || '').trim();
  const fetchHeaders = Object.assign(
    { Accept: 'application/json' },
    authToken ? { Authorization: `Bearer ${authToken}` } : {}
  );

  async function fetchList(url) {
    try {
      const response = await fetch(url, { headers: fetchHeaders });
      if (!response.ok) throw new Error('Fetch failed');
      const json = await response.json();
      if (Array.isArray(json)) return json;
      return Array.isArray(json?.data) ? json.data : (Array.isArray(json?.items) ? json.items : []);
    } catch {
      return [];
    }
  }

  async function apiPost(path, payload) {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = body?.error?.message?.[0]?.description
        || body?.error?.reason
        || body?.message
        || r.statusText
        || `HTTP ${r.status}`;
      throw new Error(detail);
    }
    return body;
  }

  // JSON.stringify handles every control character (newlines, tabs, etc.) per the
  // JSON spec, not just backslash/quote — used when splicing free text into an
  // already-serialized JSON string (see the flow-template payload builder).
  function escapeTts(str) {
    return JSON.stringify(str || '').slice(1, -1);
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Draft persistence ─────────────────────────────────────────── */
  function loadDraft(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveDraft(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/unavailable — draft just won't persist */ }
  }

  /* ── Generic bulk-row grid ("sheet") engine ───────────────────────
     Modeled on pages/wxc/workspaces.html's editable table: cols-driven
     render, add/delete row, Excel-style multi-cell paste, and CSV
     upload/template download via PapaParse. */
  /* Pasted/CSV text for a select-backed column (e.g. Music On Hold, Skill
     Name) must resolve to one of that column's REAL current option values —
     never fall back to storing the raw pasted text. Otherwise a name that
     doesn't match anything (stale sheet, typo, wrong org) looks "filled in"
     to the required-field check but is actually meaningless to the API,
     which can silently accept/ignore it instead of rejecting the row. */
  function resolveCellValue(col, rawValue, row) {
    if (col.type !== 'select') return rawValue;
    const value = (rawValue == null ? '' : String(rawValue)).trim();
    if (!value) return '';
    const options = typeof col.options === 'function' ? col.options(row) : (col.options || []);
    const exact = options.find((o) => String(o.value) === value);
    if (exact) return exact.value;
    const byLabel = options.find((o) => (o.label || '').trim().toLowerCase() === value.toLowerCase());
    return byLabel ? byLabel.value : '';
  }

  /* Custom autocomplete dropdown for text inputs backed by a <datalist>
     (col.datalist) — replaces the native list="" popup, which browsers
     render unstyled and can position anywhere on screen rather than
     directly under the input. A single shared box is reused across every
     sheet/row so only one is ever open at a time. */
  let suggestBox = null;
  function ensureSuggestBox() {
    if (suggestBox) return suggestBox;
    suggestBox = document.createElement('div');
    suggestBox.className = 'cg-suggest-box hidden';
    document.body.appendChild(suggestBox);
    return suggestBox;
  }
  function hideSuggestBox() {
    if (suggestBox) suggestBox.classList.add('hidden');
  }
  // Scroll events on a nested scroll container (e.g. the sheet's own
  // overflow:auto wrapper) don't bubble, but the capturing phase still
  // sees them — close rather than try to track position while scrolling.
  // Exception: the suggest box's own list scrolling within itself should
  // not self-close it.
  window.addEventListener('scroll', (e) => {
    if (suggestBox && e.target instanceof Node && suggestBox.contains(e.target)) return;
    hideSuggestBox();
  }, true);
  function wireSuggestInput(input, datalistId) {
    function showSuggestions() {
      const datalistEl = document.getElementById(datalistId);
      if (!datalistEl) return;
      const query = input.value.trim().toLowerCase();
      const options = Array.from(datalistEl.querySelectorAll('option')).map((o) => o.value).filter(Boolean);
      const matches = (query ? options.filter((o) => o.toLowerCase().includes(query)) : options).slice(0, 50);
      if (!matches.length) { hideSuggestBox(); return; }
      const box = ensureSuggestBox();
      box.innerHTML = matches.map((m) => `<div class="cg-suggest-item">${escHtml(m)}</div>`).join('');
      const rect = input.getBoundingClientRect();
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.bottom + 2}px`;
      box.style.width = `${Math.max(rect.width, 160)}px`;
      box.classList.remove('hidden');
      box.querySelectorAll('.cg-suggest-item').forEach((item, i) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = matches[i];
          input.dispatchEvent(new Event('input', { bubbles: true }));
          hideSuggestBox();
        });
      });
    }
    input.addEventListener('focus', showSuggestions);
    input.addEventListener('input', showSuggestions);
    input.addEventListener('blur', () => setTimeout(hideSuggestBox, 100));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSuggestBox(); });
  }

  /* Compact searchable dropdown — replaces native <select> popups, which on
     a long list (e.g. 40+ tenant flows) render unstyled, unsorted, and full
     height. A single shared floating panel (search input + a max ~8-row
     scrollable list) is reused across every enhanced select on the page. */
  let searchSelectPanel = null;
  function ensureSearchSelectPanel() {
    if (searchSelectPanel) return searchSelectPanel;
    const panel = document.createElement('div');
    panel.className = 'cg-search-select-panel hidden';
    panel.innerHTML = '<input type="text" class="cg-search-select-input" placeholder="Search…" autocomplete="off"><div class="cg-search-select-list"></div>';
    document.body.appendChild(panel);
    searchSelectPanel = panel;
    return panel;
  }
  function hideSearchSelectPanel() {
    if (searchSelectPanel) searchSelectPanel.classList.add('hidden');
  }
  // capture:true sees every scroll in the document, including the option
  // list scrolling within itself — only close for a scroll OUTSIDE the
  // panel (the page moving behind it), or the list can never be scrolled.
  window.addEventListener('scroll', (e) => {
    if (searchSelectPanel && e.target instanceof Node && searchSelectPanel.contains(e.target)) return;
    hideSearchSelectPanel();
  }, true);
  document.addEventListener('mousedown', (e) => {
    if (!searchSelectPanel || searchSelectPanel.classList.contains('hidden')) return;
    if (searchSelectPanel.contains(e.target)) return;
    if (searchSelectPanel.__trigger && searchSelectPanel.__trigger.contains(e.target)) return;
    hideSearchSelectPanel();
  });

  function openSearchSelect(triggerEl, options, currentValue, onPick) {
    const panel = ensureSearchSelectPanel();
    panel.__trigger = triggerEl;
    const input = panel.querySelector('.cg-search-select-input');
    const list = panel.querySelector('.cg-search-select-list');
    const sorted = options.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    function renderList(query) {
      const q = query.trim().toLowerCase();
      const matches = (q ? sorted.filter((o) => (o.label || '').toLowerCase().includes(q)) : sorted).slice(0, 200);
      list.innerHTML = matches.length
        ? matches.map((o) => `<div class="cg-search-select-option${String(o.value) === String(currentValue) && o.value !== '' ? ' active' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label || '(blank)')}</div>`).join('')
        : '<div class="cg-search-select-nomatch">No matches</div>';
      list.querySelectorAll('.cg-search-select-option').forEach((item) => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onPick(item.getAttribute('data-value'));
          hideSearchSelectPanel();
        });
      });
    }
    input.value = '';
    renderList('');
    input.oninput = () => renderList(input.value);
    input.onkeydown = (e) => { if (e.key === 'Escape') hideSearchSelectPanel(); };
    const rect = triggerEl.getBoundingClientRect();
    panel.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.width = `${Math.max(rect.width, 220)}px`;
    panel.classList.remove('hidden');
    setTimeout(() => input.focus(), 0);
  }

  /* Wraps a real <select> with a visible searchable trigger, leaving the
     <select> itself in the DOM (hidden) so every existing .value read,
     .value= write, and 'change' listener elsewhere keeps working untouched
     — the trigger just proxies user clicks into the same element. Returns
     a refresh() to resync the trigger's label after code elsewhere sets
     select.value or repopulates select.innerHTML without a 'change' event. */
  function enhanceSelect(select) {
    if (select.__searchSelectRefresh) return select.__searchSelectRefresh;
    select.style.display = 'none';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cg-search-select-trigger';
    select.insertAdjacentElement('afterend', trigger);
    function refresh() {
      const opt = select.selectedOptions && select.selectedOptions[0];
      const label = opt ? opt.textContent : '';
      trigger.textContent = label;
      trigger.classList.toggle('cg-search-select-empty', !label);
      trigger.disabled = select.disabled;
    }
    trigger.addEventListener('click', () => {
      // The grid engine auto-prepends a blank <option value=""></option> to every
      // select column so a row can start unset — worth keeping in the underlying
      // <select> for that, but listing it as a selectable "(blank)" row just
      // confuses a search panel that's otherwise all real choices.
      const options = Array.from(select.options)
        .filter((o) => o.value !== '' || o.textContent.trim() !== '')
        .map((o) => ({ value: o.value, label: o.textContent }));
      openSearchSelect(trigger, options, select.value, (value) => {
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
      });
    });
    refresh();
    select.__searchSelectRefresh = refresh;
    return refresh;
  }

  function createSheet(opts) {
    const { tableEl, cols, draftKey, rowLabel } = opts;
    let rows = loadDraft(draftKey, null) || [createEmptyRow()];

    function createEmptyRow() {
      const row = {};
      cols.forEach((col) => { row[col.key] = col.default !== undefined ? col.default : ''; });
      row.__status = 'pending';
      row.__detail = '';
      return row;
    }

    function persist() { saveDraft(draftKey, rows); }

    function colOptions(col, row) {
      const list = typeof col.options === 'function' ? col.options(row) : (col.options || []);
      return list;
    }

    /* Columns can hide entirely (header + cells) via col.visible() — e.g.
       Queues' skill fields only matter for one Queue Type mode. Row data
       keeps every key regardless; only rendering (and paste's positional
       column mapping, see handlePaste) is filtered. */
    function visibleCols() {
      return cols.filter((c) => !c.visible || c.visible());
    }

    function render() {
      const vcols = visibleCols();
      const thead = `<thead><tr>${vcols.map((c) => `<th>${escHtml(c.label)}${
        c.type !== 'button' && rows.length > 1
          ? ` <button type="button" class="cg-fill-down" data-fill="${c.key}" title="Fill row 1's value down to every row below">↓</button>`
          : ''
      }</th>`).join('')}<th></th></tr></thead>`;
      const tbody = `<tbody>${rows.map((row, ri) => `<tr class="cg-row cg-row-${row.__status || 'pending'}"${row.__detail ? ` title="${escHtml(row.__detail)}"` : ''}>
        ${vcols.map((col) => {
          const val = row[col.key] ?? '';
          if (col.type === 'select') {
            const options = colOptions(col, row);
            const opts = ['<option value=""></option>'].concat(
              options.map((o) => `<option value="${escHtml(o.value)}"${String(val) === String(o.value) ? ' selected' : ''}>${escHtml(o.label)}</option>`)
            ).join('');
            return `<td><select data-ri="${ri}" data-key="${col.key}">${opts}</select></td>`;
          }
          if (col.type === 'checkbox') {
            return `<td style="text-align:center;"><input type="checkbox" data-ri="${ri}" data-key="${col.key}" ${val ? 'checked' : ''}></td>`;
          }
          if (col.type === 'number') {
            return `<td><input type="number" data-ri="${ri}" data-key="${col.key}" value="${escHtml(val)}"></td>`;
          }
          if (col.type === 'button') {
            const n = col.count ? col.count(row) : 0;
            return `<td><button type="button" class="btn sm cg-cell-btn" data-ri="${ri}" data-key="${col.key}">${escHtml(col.label)}${n ? ` (${n})` : ''}</button></td>`;
          }
          const suggestAttr = col.datalist ? ` data-suggest="${escHtml(col.datalist)}"` : '';
          return `<td><input data-ri="${ri}" data-key="${col.key}" value="${escHtml(val)}"${suggestAttr} autocomplete="off"></td>`;
        }).join('')}
        <td style="white-space:nowrap;">
          <button class="btn secondary sm" type="button" data-del="${ri}">Delete</button>
          ${ri === rows.length - 1 ? '<button class="btn primary sm" type="button" data-add-row>+</button>' : ''}
        </td>
      </tr>`).join('')}</tbody>`;
      tableEl.innerHTML = thead + tbody;

      tableEl.querySelectorAll('input[data-ri]').forEach((input) => {
        const key = input.getAttribute('data-key');
        if (input.type === 'checkbox') {
          input.addEventListener('change', (e) => {
            const ri = Number(e.target.getAttribute('data-ri'));
            rows[ri][key] = e.target.checked;
            rows[ri].__status = 'pending';
            persist();
          });
          return;
        }
        input.addEventListener('input', (e) => {
          const ri = Number(e.target.getAttribute('data-ri'));
          rows[ri][key] = e.target.value;
          rows[ri].__status = 'pending';
          persist();
        });
        input.addEventListener('paste', (event) => handlePaste(event, Number(input.getAttribute('data-ri')), key));
        if (input.hasAttribute('data-suggest')) wireSuggestInput(input, input.getAttribute('data-suggest'));
      });

      tableEl.querySelectorAll('select[data-ri]').forEach((select) => {
        const ri = Number(select.getAttribute('data-ri'));
        const key = select.getAttribute('data-key');
        const col = cols.find((c) => c.key === key);
        select.addEventListener('change', (e) => {
          rows[ri][key] = e.target.value;
          rows[ri].__status = 'pending';
          persist();
          // A column can react to its own value changing (e.g. clearing a
          // dependent column and kicking off an async options fetch for it).
          if (col?.onChange) col.onChange(rows[ri], e.target.value);
          // Re-render in case another column's visible()/options() depends on this value.
          if (cols.some((c) => c.visible) || col?.onChange) { render(); return; }
        });
        enhanceSelect(select);
      });

      tableEl.querySelectorAll('button[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ri = Number(btn.getAttribute('data-del'));
          rows.splice(ri, 1);
          if (!rows.length) rows.push(createEmptyRow());
          persist();
          render();
        });
      });
      tableEl.querySelectorAll('button[data-add-row]').forEach((btn) => btn.addEventListener('click', addRow));
      tableEl.querySelectorAll('button[data-fill]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.getAttribute('data-fill');
          const value = rows[0][key];
          for (let i = 1; i < rows.length; i++) {
            rows[i][key] = value;
            rows[i].__status = 'pending';
          }
          persist();
          render();
        });
      });
      if (opts.onCellButton) {
        tableEl.querySelectorAll('button.cg-cell-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const ri = Number(btn.getAttribute('data-ri'));
            const key = btn.getAttribute('data-key');
            opts.onCellButton(rows[ri], key, () => { persist(); render(); });
          });
        });
      }
    }

    async function handlePaste(event, startRi, startKey) {
      const text = event.clipboardData?.getData('text');
      if (!text || (!text.includes('\t') && !text.includes('\n'))) return;
      event.preventDefault();
      // Positional (no-header) mapping must walk only the columns actually
      // visible in the grid right now — a hidden column (col.visible() ===
      // false) doesn't occupy a slot the user could have pasted into.
      const vcols = visibleCols();
      const startColIndex = vcols.findIndex((c) => c.key === startKey);
      const delimiter = text.includes('\t') ? '\t' : ',';
      const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
      const cells = lines.map((line) => line.split(new RegExp(delimiter)).map((v) => v.trim()));
      const header = cells[0];
      const headerMatches = header.every((v) => vcols.some((c) => c.label === v || c.key === v));
      const dataRows = headerMatches ? cells.slice(1) : cells;
      const mapping = headerMatches
        ? header.map((v) => vcols.findIndex((c) => c.label === v || c.key === v))
        : null;
      // Sequential (not Promise.all) on purpose: a later cell in the same row
      // — e.g. a Caller ID Number resolved against whichever Location was
      // just pasted into the cell before it — needs that earlier cell's
      // value already committed to the row before it resolves.
      for (let rowOffset = 0; rowOffset < dataRows.length; rowOffset++) {
        const cellRow = dataRows[rowOffset];
        const targetIndex = startRi + rowOffset;
        if (!rows[targetIndex]) rows[targetIndex] = createEmptyRow();
        const unmatched = [];
        for (let cellIndex = 0; cellIndex < cellRow.length; cellIndex++) {
          const colIndex = mapping ? mapping[cellIndex] : startColIndex + cellIndex;
          if (colIndex < 0 || colIndex >= vcols.length) continue;
          const col = vcols[colIndex];
          const value = cellRow[cellIndex];
          if (col.type === 'checkbox') {
            rows[targetIndex][col.key] = /^(y|yes|true|1|on)$/i.test(value);
          } else if (col.resolvePaste) {
            const resolved = await col.resolvePaste(value, rows[targetIndex]);
            rows[targetIndex][col.key] = resolved.value;
            if (value && !resolved.matched) unmatched.push(`${col.label} "${value}"`);
          } else {
            rows[targetIndex][col.key] = resolveCellValue(col, value, rows[targetIndex]);
          }
        }
        rows[targetIndex].__status = unmatched.length ? 'error' : 'pending';
        rows[targetIndex].__detail = unmatched.length ? `No match for ${unmatched.join(', ')}` : '';
      }
      persist();
      render();
    }

    function addRow() {
      rows.push(createEmptyRow());
      persist();
      render();
    }

    function isRowEmpty(row) {
      return cols.every((c) => {
        const v = row[c.key];
        return v === '' || v === null || v === undefined || v === false;
      });
    }

    function getRunnableRows() {
      return rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !isRowEmpty(row) && row.__status !== 'done');
    }

    return {
      render,
      addRow,
      cols,
      getRows: () => rows,
      persist,
      getRunnableRows,
      isRowEmpty,
      setRowStatus(index, status, detail) {
        if (!rows[index]) return;
        rows[index].__status = status;
        rows[index].__detail = detail || '';
        persist();
        const rowEl = tableEl.querySelectorAll('tbody tr')[index];
        if (rowEl) rowEl.className = `cg-row cg-row-${status}`;
      },
      clearAll() {
        rows = [createEmptyRow()];
        persist();
        render();
      },
      rowLabel: rowLabel || ((row, i) => `Row ${i + 1}`)
    };
  }

  /* ── CSV helpers (PapaParse — the site-wide convention for CSV import,
     used by workspaces.html/devices.html/virtuallines.html/locations.html) ── */
  function downloadCsvTemplate(cols, filename) {
    const header = cols.map((c) => c.label).join(',');
    const blob = new Blob([header + '\n'], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function uploadCsv(file, cols, onRows) {
    if (typeof Papa === 'undefined') {
      onRows([]);
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const incoming = [];
        for (const item of result.data) {
          const row = {};
          const unmatched = [];
          // Sequential per-column, not Promise.all — a later column (e.g.
          // Caller ID Number) can depend on an earlier one (Caller ID
          // Location) already being resolved onto `row`.
          for (const c of cols) {
            const raw = item[c.label] ?? item[c.key] ?? '';
            if (c.type === 'checkbox') {
              row[c.key] = /^(y|yes|true|1|on)$/i.test(String(raw));
            } else if (c.resolvePaste) {
              const resolved = await c.resolvePaste(raw, row);
              row[c.key] = resolved.value;
              if (raw && !resolved.matched) unmatched.push(`${c.label} "${raw}"`);
            } else {
              row[c.key] = resolveCellValue(c, raw, row);
            }
          }
          row.__status = unmatched.length ? 'error' : 'pending';
          row.__detail = unmatched.length ? `No match for ${unmatched.join(', ')}` : '';
          incoming.push(row);
        }
        onRows(incoming);
      },
      error: () => onRows([])
    });
  }

  /* ── Per-row run engine: never abort on a single row's failure ───── */
  async function runRows(runnable, runOne, { delayMs = 0, onProgress, shouldStop } = {}) {
    const results = [];
    for (let i = 0; i < runnable.length; i++) {
      if (shouldStop && shouldStop()) break;
      const { row, index } = runnable[i];
      if (onProgress) onProgress(index, 'active', 'Working…');
      try {
        const detail = await runOne(row, index);
        if (onProgress) onProgress(index, 'done', detail || 'Done');
        results.push({ index, ok: true });
      } catch (err) {
        if (onProgress) onProgress(index, 'error', err.message || String(err));
        results.push({ index, ok: false, detail: err.message || String(err) });
      }
      if (delayMs && i < runnable.length - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return results;
  }

  function renderResultsBox(el, results, entityLabel) {
    const ok = results.filter((r) => r.ok).length;
    const err = results.filter((r) => !r.ok).length;
    const failLines = results.filter((r) => !r.ok).map((r) => `Row ${r.index + 1}: ${escHtml(r.detail)}`).join('<br>');
    el.innerHTML = `
      <div class="cg-results-title">
        <span class="cg-ok">${ok} ${entityLabel} created</span>
        ${err ? ` &nbsp;·&nbsp; <span class="cg-err">${err} failed</span>` : ''}
      </div>
      ${failLines ? `<div class="cg-results-detail">${failLines}</div>` : ''}
    `;
    el.classList.remove('hidden');
  }

  global.WxccWizardCommon = {
    ORG_ID, BASE_URL, WEBEX_BASE, authToken, fetchHeaders,
    fetchList, apiPost, escapeTts, escHtml,
    loadDraft, saveDraft,
    createSheet, downloadCsvTemplate, uploadCsv,
    runRows, renderResultsBox,
    enhanceSelect
  };
})(window);
