(function () {
  const KEYS = { bearer: 'authBearer', org: 'authOrg', orgName: 'authOrgName', user: 'authUserName' };
  const API = {
    login: 'https://6a5fc4c6b1933e9d25fca800.mockapi.io/Login'
  };
  const state = { logins: [] };
  const filters = { logins: false };

  function ensureAuthenticated() {
    if (!localStorage.getItem(KEYS.bearer)) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function repairMalformedApiJson(text) {
    return String(text).replace(
      /"consoleLogs":"(\[[\s\S]*?\])","createdAt"/g,
      '"consoleLogs":$1,"createdAt"'
    );
  }

  function parseApiJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      const repaired = repairMalformedApiJson(text);
      if (repaired !== text) return JSON.parse(repaired);
      throw error;
    }
  }

  function normalizeLoginRecord(record) {
    const tokenTypeRaw = String(record.tokenType || '').trim();
    const tokenTypeLower = tokenTypeRaw.toLowerCase();
    const tokenKind = tokenTypeLower.includes('partner') ? 'Partner' : tokenTypeLower.includes('customer') ? 'Customer' : '';
    const loginTime = record.loginTime || record.logintime || '';
    const loginUserName = record.loginUserName || record.sessionUserName || '';
    const loginUserEmail = record.sessionUserEmail || '';
    const loginOrgName = record.loginOrgName || record.orgName || '';
    const switchedOrg = record.switchedOrg || '';
    const tokenUser = record.tokenUser || '';
    const tokenOrg = record.tokenOrg || '';
    return {
      ...record,
      loginTime,
      loginUserName,
      loginUserEmail,
      loginOrgName,
      switchedOrg,
      tokenTypeRaw,
      tokenKind,
      tokenUser,
      tokenOrg
    };
  }

  function loginSortValue(record) {
    const value = Date.parse(record.loginTime || '');
    return Number.isNaN(value) ? -Infinity : value;
  }

  async function apiPut(id, body) {
    const res = await fetch(`${API.login}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`PUT failed: ${res.status}`);
    return res.json();
  }

  async function apiDelete(id) {
    const res = await fetch(`${API.login}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
  }

  function renderLogins() {
    const tbody = document.getElementById('tbodyLogins');
    const countEl = document.getElementById('countLogins');
    const metaEl = document.getElementById('loginMeta');
    const data = state.logins;
    const visible = filters.logins ? data.filter((r) => r.status !== 'closed') : data;
    const closedCount = data.filter((r) => r.status === 'closed').length;

    if (countEl) countEl.textContent = data.length;
    metaEl.textContent = `${data.length} login${data.length !== 1 ? 's' : ''} recorded${closedCount ? ` · ${closedCount} closed` : ''}`;

    if (!visible.length) {
      const msg = data.length ? 'All records are closed. Toggle the filter to show them.' : 'No login records yet.';
      tbody.innerHTML = `<tr class="state-row"><td colspan="7">${msg}</td></tr>`;
      return;
    }

    tbody.innerHTML = visible.map((r, i) => {
      const isClosed = r.status === 'closed';
      const signedInAs = r.loginUserName
        ? `<span style="font-weight:600;">${esc(r.loginUserName)}</span>${r.loginUserEmail ? `<br><span style="color:var(--muted);font-size:.8rem;">${esc(r.loginUserEmail)}</span>` : ''}`
        : '<span style="color:var(--muted);">—</span>';
      const tokenBadge = r.tokenKind === 'Partner'
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;background:rgba(234,179,8,.15);color:#b45309;border:1px solid rgba(234,179,8,.35);">Partner</span>'
        : r.tokenKind === 'Customer'
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700;background:rgba(16,185,129,.1);color:#047857;border:1px solid rgba(16,185,129,.3);">Customer</span>'
          : '<span style="color:var(--muted);">—</span>';
      const tokenMeta = r.tokenUser
        ? `${esc(r.tokenUser)}${r.tokenOrg ? ` · ${esc(r.tokenOrg)}` : ''}`
        : r.tokenTypeRaw && !['partner', 'customer'].includes(r.tokenTypeRaw.toLowerCase())
          ? esc(r.tokenTypeRaw)
          : '';
      const tokenCell = tokenMeta ? `${tokenBadge}<br><span style="color:var(--muted);font-size:.8rem;">${tokenMeta}</span>` : tokenBadge;
      const orgCell = r.switchedOrg
        ? `<span style="font-weight:600;">${esc(r.switchedOrg)}</span><br><span style="color:var(--muted);font-size:.75rem;">↑ switched org</span>`
        : `<span style="color:var(--muted);">${esc(r.loginOrgName || '—')}</span>`;

      return `<tr class="${isClosed ? 'is-closed' : ''}" id="row-login-${r.id}">
        <td style="color:var(--muted);font-size:.8rem;">${visible.length - i}</td>
        <td class="name-cell">${signedInAs}</td>
        <td>${tokenCell}</td>
        <td>${orgCell}</td>
        <td class="time-cell">${formatTime(r.loginTime)}</td>
        <td><button class="status-btn ${isClosed ? 'closed' : 'open'}" data-action="toggle-status" data-id="${r.id}" data-new-status="${isClosed ? 'open' : 'closed'}">${isClosed ? 'Closed' : 'Open'}</button></td>
        <td><div class="act-cell"><button class="del-btn" data-action="delete-record" data-id="${r.id}">✕ Delete</button></div></td>
      </tr>`;
    }).join('');
  }

  async function loadLogins() {
    const tbody = document.getElementById('tbodyLogins');
    tbody.innerHTML = '<tr class="state-row"><td colspan="7">Loading...</td></tr>';
    try {
      const res = await fetch(API.login);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.logins = parseApiJson(await res.text()).map(normalizeLoginRecord).sort((a, b) => loginSortValue(b) - loginSortValue(a) || Number(b.id || 0) - Number(a.id || 0));
      renderLogins();
    } catch (err) {
      document.getElementById('loginMeta').textContent = 'Failed to load';
      tbody.innerHTML = `<tr class="state-row"><td colspan="7" style="color:#ef4444;">Error: ${esc(err.message)}</td></tr>`;
    }
  }

  function setupFilters() {
    const btn = document.getElementById('filterLogins');
    if (!btn) return;
    btn.addEventListener('click', () => {
      filters.logins = !filters.logins;
      btn.textContent = filters.logins ? 'Show Closed' : 'Hide Closed';
      btn.classList.toggle('filter-active', filters.logins);
      renderLogins();
    });
  }

  function setupRefresh() {
    document.querySelectorAll('[data-refresh="logins"]').forEach((btn) => {
      btn.addEventListener('click', () => loadLogins());
    });
  }

  async function toggleStatus(button) {
    const { id, newStatus } = button.dataset;
    button.disabled = true;
    try {
      await apiPut(id, { status: newStatus });
      const record = state.logins.find((r) => String(r.id) === String(id));
      if (record) record.status = newStatus;
      renderLogins();
    } catch (err) {
      alert(`Could not update status: ${err.message}`);
      button.disabled = false;
    }
  }

  async function deleteRecord(button) {
    const { id } = button.dataset;
    const record = state.logins.find((r) => String(r.id) === String(id));
    const label = record?.loginUserName || `#${id}`;
    if (!confirm(`Delete "${label}"?\n\nThis cannot be undone.`)) return;
    button.disabled = true;
    try {
      await apiDelete(id);
      state.logins = state.logins.filter((r) => String(r.id) !== String(id));
      renderLogins();
    } catch (err) {
      alert(`Could not delete: ${err.message}`);
      button.disabled = false;
    }
  }

  function setupDelegatedActions() {
    document.addEventListener('click', (event) => {
      const statusButton = event.target.closest('[data-action="toggle-status"]');
      if (statusButton) {
        toggleStatus(statusButton);
        return;
      }

      const deleteButton = event.target.closest('[data-action="delete-record"]');
      if (deleteButton) {
        deleteRecord(deleteButton);
      }
    });
  }

  function init() {
    if (!ensureAuthenticated()) return;
    setupFilters();
    setupRefresh();
    setupDelegatedActions();
    loadLogins();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
