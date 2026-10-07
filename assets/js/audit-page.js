(function () {
  const KEYS = { bearer: 'authBearer', org: 'authOrg', orgName: 'authOrgName', user: 'authUserName' };
  const CATEGORIES = [
    { value: 'CONTACT_CENTER', label: 'Contact Center' },
    { value: 'LOCATIONS', label: 'Locations' },
    { value: 'WEBEX_CALLING', label: 'Webex Calling' }
  ];

  let allItems = [];

  function getToken() { return localStorage.getItem(KEYS.bearer) || ''; }

  function ensureAuthenticated() {
    if (!getToken()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function checkAdminAccess() {
    const token = getToken();
    if (!token) return false;
    try {
      const res = await fetch('https://webexapis.com/v1/licenses', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const allowed = res.ok;
      localStorage.setItem('adminAuditAllowed', allowed ? 'true' : 'false');
      return allowed;
    } catch {
      localStorage.setItem('adminAuditAllowed', 'false');
      return false;
    }
  }

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
    if (orgPathIdx !== -1) return raw.slice(orgPathIdx + 'organization/'.length) || raw;
    return raw;
  }

  function getOrgId() {
    const cached = localStorage.getItem('authOrgId') || '';
    const raw = localStorage.getItem(KEYS.org) || '';
    const decoded = decodeOrgId(raw);
    if (decoded && decoded !== cached) {
      localStorage.setItem('authOrgId', decoded);
      return decoded;
    }
    if (cached) return decodeOrgId(cached);
    return decoded;
  }

  function pad2(value) { return String(value).padStart(2, '0'); }

  function toLocalInputValue(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '-';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  }

  function setDefaultRange() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    document.getElementById('fromInput').value = toLocalInputValue(weekAgo);
    document.getElementById('toInput').value = toLocalInputValue(now);
  }

  function toIsoUtc(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  }

  function getSelectedCategories() {
    return Array.from(document.querySelectorAll('#categoryList input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function updateCategoryLabel() {
    const selected = getSelectedCategories();
    const categoryLabel = document.getElementById('categoryLabel');
    if (!selected.length) {
      categoryLabel.textContent = 'No categories selected';
      return;
    }
    if (selected.length === CATEGORIES.length) {
      categoryLabel.textContent = 'All categories';
      return;
    }
    categoryLabel.textContent = CATEGORIES.filter((cat) => selected.includes(cat.value)).map((cat) => cat.label).join(', ');
  }

  function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const label = document.createElement('label');
      label.className = 'dropdown-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = cat.value;
      input.checked = true;
      input.addEventListener('change', updateCategoryLabel);
      const span = document.createElement('span');
      span.textContent = cat.label;
      label.append(input, span);
      categoryList.appendChild(label);
    });
    updateCategoryLabel();
  }

  function renderTable(items) {
    const tableEl = document.getElementById('auditTable');
    tableEl.innerHTML = '';
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    ['Changed by', 'Type', 'Description', 'Action', 'Timestamp'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      row.appendChild(th);
    });
    head.appendChild(row);
    const body = document.createElement('tbody');
    items.forEach((item) => {
      const data = item.data || {};
      const tr = document.createElement('tr');
      [data.actorName, data.configOperationType, data.eventDescription, data.actionText, formatTimestamp(item.created)].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value || '-';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableEl.append(head, body);
  }

  function applySearch(items) {
    const term = (document.getElementById('searchInput').value || '').toLowerCase().trim();
    if (!term) return items;
    return items.filter((item) => (item?.data?.actorName || '').toLowerCase().includes(term));
  }

  function renderFiltered() {
    const filtered = applySearch(allItems);
    renderTable(filtered);
    document.getElementById('countHint').textContent = `${filtered.length} event${filtered.length === 1 ? '' : 's'}`;
    document.getElementById('emptyState').style.display = filtered.length ? 'none' : '';
  }

  function showActionModal(title, message, opts = {}) {
    const overlayId = 'actionModal';
    document.getElementById(overlayId)?.remove();
    const gradient = opts.variant === 'danger'
      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
      : 'linear-gradient(135deg, #159DD8, #159DD8)';
    const modal = document.createElement('div');
    modal.id = overlayId;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-icon" style="background:${gradient};">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2>${title}</h2>
        <p class="modal-text">${message}</p>
        <button class="btn primary" id="actionOkBtn">OK</button>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
    const closeModal = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    };
    modal.querySelector('#actionOkBtn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); }, { once: true });
  }

  async function loadAudit() {
    const fromRaw = document.getElementById('fromInput').value.trim();
    const toRaw = document.getElementById('toInput').value.trim();
    const categories = getSelectedCategories();
    const orgId = getOrgId();
    const loadBtn = document.getElementById('loadBtn');

    if (!fromRaw || !toRaw) return alert('Enter both from and to timestamps.');
    const fromIso = toIsoUtc(fromRaw);
    const toIso = toIsoUtc(toRaw);
    if (!fromIso || !toIso) return alert('Invalid date/time selection.');
    if (new Date(toRaw).getTime() <= new Date(fromRaw).getTime()) return alert('To must be after from.');
    if (!orgId) return alert('Missing org ID.');
    if (!categories.length) return alert('Select at least one category.');

    loadBtn.disabled = true;
    const params = new URLSearchParams({ from: fromIso, to: toIso, orgId });
    categories.forEach((cat) => params.append('eventCategories', cat));

    try {
      const response = await fetch(`https://webexapis.com/v1/adminAudit/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!response.ok) {
        const text = await response.text();
        const label = response.status === 403 ? 'Forbidden (missing admin audit scope?)' : `Request failed (${response.status})`;
        throw new Error(text ? `${label}: ${text}` : label);
      }
      const payload = await response.json();
      allItems = Array.isArray(payload.items) ? payload.items : [];
      allItems.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      renderFiltered();
      if (!allItems.length) showActionModal('No events', 'No audit events were returned for that time range.');
    } catch (err) {
      allItems = [];
      renderFiltered();
      document.getElementById('countHint').textContent = '0 events';
      document.getElementById('emptyState').style.display = '';
      alert(`Error: ${err.message}`);
    } finally {
      loadBtn.disabled = false;
    }
  }

  async function initAudit() {
    const allowed = await checkAdminAccess();
    if (!allowed) {
      document.getElementById('accessNotice').style.display = '';
      document.getElementById('auditFilters').style.display = 'none';
      document.getElementById('auditToolbar').style.display = 'none';
      document.getElementById('auditTableWrap').style.display = 'none';
      document.getElementById('auditEmptyRow').style.display = 'none';
      document.getElementById('loadBtn').disabled = true;
      return;
    }

    setDefaultRange();
    document.getElementById('loadBtn').addEventListener('click', loadAudit);
    document.getElementById('searchInput').addEventListener('input', renderFiltered);
    loadAudit();
  }

  function initCategoryMenu() {
    const categoryToggle = document.getElementById('categoryToggle');
    const categoryMenu = document.getElementById('categoryMenu');
    const closeCategoryMenu = () => {
      categoryMenu.classList.remove('open');
      categoryToggle.setAttribute('aria-expanded', 'false');
    };

    categoryToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = categoryMenu.classList.toggle('open');
      categoryToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      const inside = [categoryMenu, categoryToggle].filter(Boolean).some((el) => el.contains(event.target));
      if (!inside) closeCategoryMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCategoryMenu();
    });
  }

  function init() {
    if (!ensureAuthenticated()) return;
    renderCategories();
    initCategoryMenu();
    initAudit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
