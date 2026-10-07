(function () {
  const ORG_KEY = 'authOrg';
  const ORG_NAME_KEY = 'authOrgName';
  const TOKEN_KEY = 'authBearer';
  const EXPIRES_KEY = 'authExpiresAt';
  const LOGIN_API = 'https://6a5fc4c6b1933e9d25fca800.mockapi.io/Login';
  const PARTNER_TOKEN_SUFFIX = 'e65947a0-1520-4dbe-87c8-d1172caaf388';
  const LOGIN_RECORD_ID_KEY = 'apiToolsLoginRecordId';
  const INITIAL_LOGIN_USER_KEY = 'apiToolsInitialLoginUserName';
  const INITIAL_LOGIN_ORG_KEY = 'apiToolsInitialLoginOrgName';
  const INITIAL_LOGIN_TIME_KEY = 'apiToolsInitialLoginTime';
  const WELCOME_BANNER_KEY = 'opshubWelcomeBannerDismissed';
  const WELCOME_BANNER_EXPIRES = '2026-08-25T00:00:00Z';
  let loginRecordPromise = null;

  function isPartnerToken(token) {
    return (token || '').trim().endsWith(PARTNER_TOKEN_SUFFIX);
  }

  function getStoredLoginRecordId() {
    return sessionStorage.getItem(LOGIN_RECORD_ID_KEY) || '';
  }

  function getInitialLoginUserName() {
    return sessionStorage.getItem(INITIAL_LOGIN_USER_KEY) || '';
  }

  function getInitialLoginOrgName() {
    return sessionStorage.getItem(INITIAL_LOGIN_ORG_KEY) || '';
  }

  function captureInitialLoginContext() {
    const currentUser = (localStorage.getItem('authUserName') || '').trim();
    const currentOrg = (localStorage.getItem(ORG_NAME_KEY) || localStorage.getItem(ORG_KEY) || '').trim();
    if (currentUser && !getInitialLoginUserName()) {
      sessionStorage.setItem(INITIAL_LOGIN_USER_KEY, currentUser);
    }
    if (currentOrg && !getInitialLoginOrgName()) {
      sessionStorage.setItem(INITIAL_LOGIN_ORG_KEY, currentOrg);
    }
    if ((currentUser || currentOrg) && !sessionStorage.getItem(INITIAL_LOGIN_TIME_KEY)) {
      sessionStorage.setItem(INITIAL_LOGIN_TIME_KEY, new Date().toISOString());
    }
  }

  function getInitialLoginPayload() {
    captureInitialLoginContext();
    const loginUserName = getInitialLoginUserName();
    const loginOrgName = getInitialLoginOrgName();
    const loginTime = sessionStorage.getItem(INITIAL_LOGIN_TIME_KEY) || new Date().toISOString();
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    return {
      loginTime,
      logintime: loginTime,
      loginOrgName,
      orgName: loginOrgName,
      loginUserName,
      sessionUserName: loginUserName,
      sessionUserEmail: '',
      tokenType: token ? (isPartnerToken(token) ? 'Partner Login' : 'Customer Login') : '',
      switchedOrg: '',
      tokenUser: '',
      tokenOrg: ''
    };
  }

  function withLegacyLoginFields(patch) {
    const nextPatch = { ...patch };
    if ('loginTime' in nextPatch && !('logintime' in nextPatch)) nextPatch.logintime = nextPatch.loginTime;
    if ('loginOrgName' in nextPatch && !('orgName' in nextPatch)) nextPatch.orgName = nextPatch.loginOrgName;
    if ('loginUserName' in nextPatch && !('sessionUserName' in nextPatch)) nextPatch.sessionUserName = nextPatch.loginUserName;
    return nextPatch;
  }

  function ensureLoginRecord() {
    const existingId = getStoredLoginRecordId();
    if (existingId) return Promise.resolve(existingId);
    const payload = getInitialLoginPayload();
    if (!payload.loginUserName && !payload.loginOrgName) {
      return Promise.resolve('');
    }
    if (loginRecordPromise) return loginRecordPromise;
    loginRecordPromise = fetch(LOGIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Unable to create login record');
        return r.json();
      })
      .then((data) => {
        const id = data?.id ? String(data.id) : '';
        if (id) sessionStorage.setItem(LOGIN_RECORD_ID_KEY, id);
        return id;
      })
      .catch(() => '')
      .finally(() => {
        loginRecordPromise = null;
      });
    return loginRecordPromise;
  }

  function patchLoginRecord(patch) {
    return ensureLoginRecord().then((id) => {
      if (!id) return;
      return fetch(`${LOGIN_API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withLegacyLoginFields(patch)),
      }).catch(() => {});
    });
  }

  function logLoginOnce() {
    return ensureLoginRecord();
  }
  const AUTH_KEYS = [
    'authBearer',
    'authOrg',
    'authOrgName',
    'authOrgId',
    'authUserName',
    'authRefreshToken',
    'authExpiresAt',
    'authLoginMethod',
    'authScopes',
    'authAvatarUrl'
  ];
  const THEME_COLOR = '#0a224a';
  const MANIFEST_PATH = '/opshub/assets/manifest.webmanifest';
  const PWA_PROMPT_ID = 'apiInstallToast';
  const PREAUTH_CLASS = 'pre-auth';
  const LANDING_PATHS = ['/opshub/index.html', '/opshub/'];
  const OAUTH_SERVER_HOST = 'automation.cxsol.com';
  const DEFAULT_OAUTH_ROOT = '/oauth';
  const AUTH_LOGIN_SELECTORS = ['#authBtn', '.authLink', '#authWebex', '.authCard .btn.webex', '.btn-webex'];
  const AUTH_LOGOUT_SELECTORS = ['#signOutBtn'];
  const OAUTH_ROOT = (window.API_TOOLS_AUTH_ROOT || DEFAULT_OAUTH_ROOT).replace(/\/+$/, '');
  const OAUTH_LOGIN_URL = `${OAUTH_ROOT}/webex_login.php`;
  const OAUTH_LOGOUT_URL = `${OAUTH_ROOT}/webex_logout.php`;
  const USE_SERVER_AUTH = window.API_TOOLS_AUTH_FORCE === true || Boolean(window.API_TOOLS_AUTH_ROOT) || window.location.host.includes(OAUTH_SERVER_HOST);
  const CALLING_NAV_ITEMS = [
    { label: 'Workspaces', path: '/pages/wxc/workspaces.html' },
    { label: 'Locations', path: '/pages/wxc/locations.html' },
    { label: 'Numbers', path: '/pages/wxc/number.html' },
    { label: 'Usage & Activity', path: '/pages/wxc/usage.html' },
    { label: 'Virtual Lines', path: '/pages/wxc/virtuallines.html' },
    { label: 'Users', path: '/pages/wxc/user.html' },
    { label: 'Devices', path: '/pages/wxc/devices.html' },
    { label: 'Auto Attendant', path: '/pages/wxc/autoattendant.html' }
  ];
  const CONTACT_CENTER_NAV_ITEMS = [
    { label: 'Setup Wizard', path: '/pages/wxcc/wizard/S1_Teams.html' },
    { label: 'Bulk Import', path: '/pages/wxcc/bulkimport.html' },
    { label: 'Queues', path: '/pages/wxcc/queues.html' },
    { label: 'Contact Center Users', path: '/pages/wxcc/contactcenterusers.html' },
    { label: 'Skills', path: '/pages/wxcc/skills.html' },
    { label: 'Desktop Profiles', path: '/pages/wxcc/desktopprofiles.html' },
    { label: 'Channels', path: '/pages/wxcc/channels.html' },
    { label: 'Flows', path: '/pages/wxcc/flows.html' },
    { label: 'Functions', path: '/pages/wxcc/functions.html' },
    { label: 'Function Builder', path: '/pages/wxcc/functionbuilder.html' },
    { label: 'Address Book', path: '/pages/wxcc/addressbook.html' },
    { label: 'Search API', path: '/pages/wxcc/searchapi.html' },
    { label: 'Outbound Campaign Manager', path: '/pages/wxcc/ocm.html' },
    { label: 'Realtime Dashboard', path: '/pages/wxcc/realtime-dashboard.html' },
    { label: 'Historical Data', path: '/pages/wxcc/historical-data.html' },
    { label: 'Desktop Layout', path: '/pages/wxcc/desktoplayout.html' }
  ];
  const AI_AGENT_NAV_ITEMS = [
    { label: 'AI Bot Visualizer', path: '/pages/aiagent/visualizer.html' },
    { label: 'AI Call Transcript Summary', path: '/pages/aiagent/summary.html' },
    { label: 'AI Utilization', path: '/pages/aiagent/utilization.html' },
    { label: 'Autonomous Instructions Builder', path: '/pages/aiagent/autonomous.html' },
    { label: 'AI Agent Calculator', path: '/pages/aiagent/agent-calculator.html' }
  ];
  const MEETINGS_NAV_ITEMS = [
    { label: 'Meeting Transcriptions', path: '/pages/meetings/transcriptions.html' }
  ];
  // Webex Messages -- Space History Export used to live under Webex Calling
  // but it's really a Messages API feature (hits /rooms, /messages, /people),
  // so it got its own group AND its own folder (pages/wxmessages/).
  const MESSAGES_NAV_ITEMS = [
    { label: 'Space History Export', path: '/pages/wxmessages/spacehistory.html' }
  ];
  // Admin section sub-links (rendered inside the Account accordion which is
  // relabeled "Admin"). These are the customer-facing "as-built" exports the
  // implementer generates at the end of a project.
  const ADMIN_NAV_ITEMS = [
    { label: 'Create As-Built',      path: '/pages/asbuilt/full.html' }
  ];

  function getIndexHref() {
    return '/opshub/index.html';
  }

  function getSignedOutHref() {
    const url = new URL(getIndexHref(), window.location.href);
    url.searchParams.set('signedout', '1');
    return url.toString();
  }

  function getToolsRootPath() {
    const indexUrl = new URL(getIndexHref(), window.location.href);
    return indexUrl.pathname.replace(/\/index\.html$/i, '');
  }

  function buildToolsHref(path) {
    return `${getToolsRootPath()}${path}`;
  }

  window.CXASFloatingFilters = window.CXASFloatingFilters || {
    position(button, panel) {
      if (!button || !panel) return;
      const rect = button.getBoundingClientRect();
      const width = panel.offsetWidth || 260;
      const gutter = 8;
      const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.left = `${left}px`;
    },
    open({ button, panel, parent }) {
      if (!button || !panel) return null;
      if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
      }
      panel.style.position = 'fixed';
      panel.style.zIndex = '9999';
      panel.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
      this.position(button, panel);
      return { button, panel, parent: parent || null };
    },
    close(state) {
      if (!state?.panel) return;
      const { button, panel, parent } = state;
      if (parent && panel.parentElement === document.body) {
        parent.appendChild(panel);
      }
      panel.classList.remove('open');
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.zIndex = '';
      if (button) button.setAttribute('aria-expanded', 'false');
    }
  };

  function clearAuthStorage() {
    AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('adminAuditAllowed');
  }

  function grabElementFromEvent(target) {
    let element = target;
    while (element && element.nodeType !== 1) {
      element = element.parentElement;
    }
    return element;
  }

  function matchesSelector(element, selectors) {
    if (!element) return false;
    return selectors.some((selector) => element.closest(selector));
  }

  function redirectToServerAuth(url) {
    clearAuthStorage();
    window.location.href = url;
  }

  function handleAuthClick(event) {
    if (!USE_SERVER_AUTH) return;
    const element = grabElementFromEvent(event.target);
    if (!element) return;
    if (matchesSelector(element, AUTH_LOGIN_SELECTORS)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      redirectToServerAuth(OAUTH_LOGIN_URL);
      return;
    }
    if (matchesSelector(element, AUTH_LOGOUT_SELECTORS)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      redirectToServerAuth(OAUTH_LOGOUT_URL);
    }
  }

  function isCallbackPage() {
    const path = (window.location.pathname || '').toLowerCase();
    return path.includes('callback.html');
  }

  function isHomePage() {
    const path = (window.location.pathname || '').toLowerCase();
    return path.endsWith('/home.html');
  }

  async function validateSessionOnLoad() {
    if (isCallbackPage()) return;
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (!token) return;

    const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY) || '0', 10);
    if (expiresAt && Date.now() >= expiresAt) {
      clearAuthStorage();
      window.location.href = getSignedOutHref();
      return;
    }

    try {
      const res = await fetch('https://webexapis.com/v1/people/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) return;
      clearAuthStorage();
      window.location.href = getSignedOutHref();
    } catch {
      // Network errors should not force a sign-out.
    }
  }

  function normalizeBearer() {
    const raw = localStorage.getItem(TOKEN_KEY) || '';
    const cleaned = raw.replace(/^Bearer\s+/i, '').trim();
    if (cleaned && cleaned !== raw) {
      localStorage.setItem(TOKEN_KEY, cleaned);
    }
  }

  function normalizeOrgId() {
    const stored = localStorage.getItem('authOrgId') || '';
    if (stored) {
      const decoded = decodeOrgId(stored);
      if (decoded && decoded !== stored) {
        localStorage.setItem('authOrgId', decoded);
      }
      return;
    }
    const rawOrg = localStorage.getItem(ORG_KEY) || '';
    if (rawOrg) {
      const decoded = decodeOrgId(rawOrg);
      if (decoded) localStorage.setItem('authOrgId', decoded);
    }
  }

  function ensureManifestLink() {
    const head = document.head;
    if (!head || head.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = MANIFEST_PATH;
    head.appendChild(link);
  }

  function ensureThemeColorMeta() {
    const head = document.head;
    if (!head) return;
    if (head.querySelector('meta[name="theme-color"]')) return;
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = THEME_COLOR;
    head.appendChild(meta);
  }

  function isLandingPath() {
    const raw = window.location.pathname || '';
    const normalized = decodeURIComponent(raw).replace(/\/+$/, '');
    return LANDING_PATHS.some((path) => {
      const normalizedPath = path.replace(/\/+$/, '');
      return normalized.toLowerCase() === normalizedPath.toLowerCase();
    });
  }

  function markPreAuthNav() {
    const body = document.body;
    if (!body) return;
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (!token && isLandingPath()) {
      body.classList.add(PREAUTH_CLASS);
    } else {
      body.classList.remove(PREAUTH_CLASS);
    }
  }

  function ensureHeader() {
    if (document.querySelector('.tp-header')) return;
    const root = getToolsRootPath();
    const logoIcon = root + '/assets/images/OpsHub_transparent.png';
    const header = document.createElement('header');
    header.className = 'tp-header';
    header.innerHTML = `
      <div class="tp-header-inner">
        <div class="left">
          <a class="tp-logo" href="${root}/home.html" aria-label="OpsHub \u2014 Home">
            <img src="${logoIcon}" class="logo" alt="OpsHub" />
          </a>
        </div>
        <div class="right">
          <div class="tp-header-actions">
            <img class="tp-user-avatar" id="tpUserAvatar" alt="" aria-hidden="true">
            <div class="tp-user-info">
              <div class="tp-user-name" id="userName">Signed in</div>
              <div class="tp-user-org" id="userOrg"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);

    const banner = document.createElement('div');
    banner.id = 'wxStatusBanner';
    banner.className = 'wx-status-banner';
    banner.dataset.proxyUrl = root + '/pages/shared/header.php?action=webex-status';
    banner.innerHTML = `
      <div class="wx-status-inner">
        <div class="wx-status-label-area">
          <span class="wx-status-dot" id="wxStatusDot"></span>
          <a class="wx-status-title" href="https://status.webex.com" target="_blank" rel="noopener" aria-label="View Webex status page">Webex Status</a>
        </div>
        <div class="wx-status-ticker-outer" aria-live="polite" aria-atomic="false">
          <div class="wx-status-ticker" id="wxStatusTicker"></div>
        </div>
        <button class="wx-status-close" id="wxStatusClose" type="button" aria-label="Close Webex status banner">&#x2715;</button>
      </div>
    `;
    header.insertAdjacentElement('afterend', banner);
  }

  function ensureBgFx() {
    if (document.getElementById('bg-fx')) return;
    const bgFx = document.createElement('div');
    bgFx.id = 'bg-fx';
    document.body.insertBefore(bgFx, document.body.firstChild);
  }

  function initThemeToggle() {
    const body = document.body;
    if (!body) return;

    ensureBgFx();
    ensureHeader();
    ensureHeaderSticky();
    normalizeBearer();
    normalizeOrgId();

    body.classList.add('dark-mode');
    document.documentElement.classList.add('dark-mode');
    initHeaderIdentity();
    initUserAvatar();

    initSideRail();
    initDesktopHeaderMenus();
    initSharedSignOut();

    initAuditLink();
    initTokenEntryMenu();
    initOrgSwitcher();
    validateSessionOnLoad();
    initWebexStatusBanner();
    initWelcomeBanner();

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn && !signOutBtn.dataset.loginClearBound) {
      signOutBtn.dataset.loginClearBound = 'true';
      signOutBtn.addEventListener('click', () => {
        localStorage.removeItem('authLoginMethod');
      });
    }
  }

  function initWelcomeBanner() {
    if (!document.body.classList.contains('api-home')) return;
    if (Date.now() > new Date(WELCOME_BANNER_EXPIRES).getTime()) return;
    if (localStorage.getItem(WELCOME_BANNER_KEY) === 'true') return;
    if (!(localStorage.getItem(TOKEN_KEY) || '').trim()) return;

    const overlay = document.createElement('div');
    overlay.className = 'welcome-banner-overlay';
    overlay.innerHTML = `
      <div class="welcome-banner-card">
        <button class="welcome-banner-close" type="button" aria-label="Close">&#x2715;</button>
        <img src="assets/images/Welcome_image.png" alt="Welcome to OpsHub — formerly API Tools">
      </div>
    `;
    document.body.appendChild(overlay);

    function dismiss() {
      localStorage.setItem(WELCOME_BANNER_KEY, 'true');
      overlay.remove();
    }

    overlay.querySelector('.welcome-banner-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) dismiss();
    });
  }

  function initWebexStatusBanner() {
    const BANNER_KEY = 'webexStatusBanner';
    const banner = document.getElementById('wxStatusBanner');
    if (!banner) return;

    const proxyUrl = banner.dataset.proxyUrl;
    if (!proxyUrl) return;

    const closeBtn = document.getElementById('wxStatusClose');
    const toggleBtn = document.getElementById('tpStatusToggle');
    const ticker = document.getElementById('wxStatusTicker');

    let cachedItems = null;
    let selectedRegions = new Set();

    function escapeHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    function escapeAttr(str) {
      return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function updateToggleMarkup(enabled) {
      if (!toggleBtn) return;
      toggleBtn.classList.toggle('toggle-on', enabled);
      const state = enabled ? 'On' : 'Off';
      toggleBtn.innerHTML = `
        <span class="toggle-label">Webex Status</span>
        <span class="toggle-switch" aria-hidden="true"><span class="toggle-knob"></span></span>
        <span class="toggle-state">${state}</span>
      `;
      toggleBtn.setAttribute('aria-pressed', String(enabled));
    }

    function hideBanner() {
      banner.style.display = 'none';
      updateToggleMarkup(false);
    }

    function showBanner() {
      banner.style.display = 'block';
      updateToggleMarkup(true);
    }

    function getFilteredItems() {
      if (!cachedItems) return [];
      if (selectedRegions.size === 0) return cachedItems;
      return cachedItems.filter((i) => Array.isArray(i.regions) && i.regions.some((r) => selectedRegions.has(r)));
    }

    function renderPinned(incidents, hasTicker) {
      let pinned = document.getElementById('wxStatusPinned');
      if (!pinned) {
        pinned = document.createElement('div');
        pinned.id = 'wxStatusPinned';
        pinned.className = 'wx-status-pinned';
        const tickerOuter = banner.querySelector('.wx-status-ticker-outer');
        if (tickerOuter) tickerOuter.insertAdjacentElement('beforebegin', pinned);
      }
      if (incidents.length === 0) {
        pinned.style.display = 'none';
        return;
      }
      pinned.style.display = '';
      pinned.classList.toggle('wx-has-ticker', hasTicker);
      pinned.innerHTML = incidents.map((item, idx) =>
        `<a class="wx-status-pinned-item" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">`
        + `<span class="wx-status-badge badge-incident">Incident</span>`
        + `<span class="wx-status-pinned-title">${escapeHtml(item.title)}</span>`
        + `</a>`
        + (idx < incidents.length - 1 ? '<span class="wx-status-pinned-sep" aria-hidden="true"></span>' : '')
      ).join('');
    }

    function renderTicker() {
      const items = getFilteredItems();
      const incidents = items.filter((i) => i.type === 'incident' && i.status === 'in_progress');
      const maintenance = items.filter((i) => !(i.type === 'incident' && i.status === 'in_progress'));

      banner.classList.remove('wx-active', 'wx-clear', 'wx-incident');
      if (incidents.length > 0) {
        banner.classList.add('wx-incident');
      } else if (maintenance.some((i) => i.status === 'in_progress')) {
        banner.classList.add('wx-active');
      } else if (cachedItems && cachedItems.length === 0) {
        banner.classList.add('wx-clear');
      }

      renderPinned(incidents, maintenance.length > 0);

      const tickerOuter = banner.querySelector('.wx-status-ticker-outer');
      if (!ticker) { showBanner(); return; }

      if (maintenance.length === 0) {
        if (incidents.length > 0) {
          // Incidents only — nothing to scroll
          if (tickerOuter) tickerOuter.style.display = 'none';
        } else {
          // All clear
          if (tickerOuter) tickerOuter.style.display = '';
          ticker.style.animation = 'none';
          ticker.innerHTML = selectedRegions.size > 0
            ? `<span class="wx-status-item" style="padding:0 12px;">No active notices for the selected region(s).</span>`
            : '<span class="wx-status-item" style="padding:0 12px;">All Webex services are operating normally.</span>';
          if (cachedItems && cachedItems.length === 0) banner.classList.add('wx-clear');
        }
        showBanner();
        return;
      }

      if (tickerOuter) tickerOuter.style.display = '';

      const itemsHtml = maintenance.map((item) => {
        const badgeClass = item.status === 'in_progress' ? 'badge-in_progress' : 'badge-scheduled';
        const badgeText = item.status === 'in_progress' ? 'In Progress' : 'Scheduled';
        return `<a class="wx-status-item" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">`
          + `<span class="wx-status-badge ${badgeClass}">${badgeText}</span>`
          + `${escapeHtml(item.title)}`
          + `</a><span class="wx-status-sep" aria-hidden="true">•</span>`;
      }).join('');

      ticker.innerHTML = itemsHtml + itemsHtml;
      const duration = Math.max(25, maintenance.length * 7);
      ticker.style.animation = `wx-scroll ${duration}s linear infinite`;

      showBanner();
    }

    function buildFilterUI(regions) {
      if (regions.length < 2) return;
      if (document.getElementById('wxStatusFilter')) return;

      const wrap = document.createElement('div');
      wrap.id = 'wxStatusFilter';
      wrap.className = 'wx-status-filter';

      const filterBtn = document.createElement('button');
      filterBtn.id = 'wxStatusFilterBtn';
      filterBtn.className = 'wx-status-filter-btn';
      filterBtn.type = 'button';
      filterBtn.setAttribute('aria-haspopup', 'true');
      filterBtn.setAttribute('aria-expanded', 'false');

      const dropdown = document.createElement('div');
      dropdown.id = 'wxStatusFilterDropdown';
      dropdown.className = 'wx-status-filter-dropdown';

      wrap.appendChild(filterBtn);
      wrap.appendChild(dropdown);

      const labelArea = banner.querySelector('.wx-status-label-area');
      if (labelArea) labelArea.insertAdjacentElement('afterend', wrap);

      const FUNNEL = `<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M1 1.5h10L7 6.5v3.5l-2-1V6.5z"/></svg>`;

      function updateBtn() {
        let label;
        if (selectedRegions.size === 0) label = 'All Regions';
        else if (selectedRegions.size === 1) label = [...selectedRegions][0];
        else label = `${selectedRegions.size} Regions`;
        filterBtn.innerHTML = `${FUNNEL}<span>${escapeHtml(label)}</span><span style="opacity:.5;font-size:9px">▾</span>`;
        filterBtn.classList.toggle('wx-filter-active', selectedRegions.size > 0);
      }

      function closeDropdown() {
        dropdown.classList.remove('open');
        filterBtn.setAttribute('aria-expanded', 'false');
      }

      function openDropdown() {
        dropdown.innerHTML = '';

        // Stop clicks inside the dropdown from hitting the document close listener
        dropdown.addEventListener('click', (e) => e.stopPropagation(), { once: false });

        function makeRow(label, checked, onChange) {
          const row = document.createElement('label');
          row.className = 'wx-status-filter-option';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = checked;
          cb.addEventListener('change', () => onChange(cb));
          row.appendChild(cb);
          row.appendChild(document.createTextNode(' ' + label));
          return { row, cb };
        }

        const { row: allRow, cb: allCb } = makeRow('All Regions', selectedRegions.size === 0, (cb) => {
          if (cb.checked) {
            selectedRegions.clear();
            dropdown.querySelectorAll('input[type=checkbox]').forEach((c) => { if (c !== cb) c.checked = false; });
            updateBtn();
            renderTicker();
          } else {
            cb.checked = true; // keep "All" checked unless something else is selected
          }
        });
        dropdown.appendChild(allRow);

        const divider = document.createElement('div');
        divider.className = 'wx-filter-divider';
        dropdown.appendChild(divider);

        regions.forEach((r) => {
          const { row, cb } = makeRow(r, selectedRegions.has(r), (cb) => {
            if (cb.checked) {
              selectedRegions.add(r);
              allCb.checked = false;
            } else {
              selectedRegions.delete(r);
              if (selectedRegions.size === 0) allCb.checked = true;
            }
            updateBtn();
            renderTicker();
          });
          dropdown.appendChild(row);
        });

        dropdown.classList.add('open');
        filterBtn.setAttribute('aria-expanded', 'true');
        const rect = filterBtn.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
      }

      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
      });

      document.addEventListener('click', closeDropdown);

      updateBtn();
    }

    async function fetchAndRender() {
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        cachedItems = (data.items || []).filter((i) => i.status !== 'completed' && i.status !== 'unknown');

        const regionSet = new Set();
        cachedItems.forEach((item) => (item.regions || []).forEach((r) => r && regionSet.add(r.trim())));
        buildFilterUI([...regionSet].sort());

        renderTicker();
      } catch (err) {
        console.warn('[WebexStatus] Could not load:', err.message);
      }
    }

    const isEnabled = localStorage.getItem(BANNER_KEY) === 'on';
    updateToggleMarkup(isEnabled);

    if (isEnabled) {
      fetchAndRender();
    }

    if (closeBtn && !closeBtn.dataset.statusCloseBound) {
      closeBtn.dataset.statusCloseBound = 'true';
      closeBtn.addEventListener('click', () => {
        localStorage.setItem(BANNER_KEY, 'off');
        hideBanner();
      });
    }

    if (toggleBtn && !toggleBtn.dataset.statusToggleBound) {
      toggleBtn.dataset.statusToggleBound = 'true';
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const enabled = localStorage.getItem(BANNER_KEY) === 'on';
        if (enabled) {
          localStorage.setItem(BANNER_KEY, 'off');
          hideBanner();
        } else {
          localStorage.setItem(BANNER_KEY, 'on');
          updateToggleMarkup(true);
          fetchAndRender();
        }
      });
    }
  }

  function initHeaderIdentity() {
    const nameEl = document.getElementById('userName') || document.getElementById('tpUserName');
    const orgEl = document.getElementById('userOrg') || document.getElementById('tpUserOrg');
    const hasToken = (localStorage.getItem(TOKEN_KEY) || '').trim();
    const userName = (localStorage.getItem('authUserName') || '').trim();
    const userOrg = (localStorage.getItem(ORG_NAME_KEY) || localStorage.getItem(ORG_KEY) || '').trim();

    if (nameEl) {
      nameEl.textContent = userName || (hasToken ? 'Authenticated' : 'Signed in');
    }
    if (orgEl && userOrg) {
      orgEl.textContent = userOrg;
    }
  }

  // Coordinates every rail dropdown/flyout (the shared Account/Org/section
  // flyout panel, and the separate Settings menu) so opening one always
  // closes whichever other one is currently open, even though they're two
  // independent DOM/toggle mechanisms with no other knowledge of each other.
  let activeDropdownClose = null;
  function registerOpenDropdown(closeFn) {
    if (activeDropdownClose && activeDropdownClose !== closeFn) activeDropdownClose();
    activeDropdownClose = closeFn;
  }
  function clearActiveDropdown(closeFn) {
    if (activeDropdownClose === closeFn) activeDropdownClose = null;
  }

  function initDesktopHeaderMenus() {
    const menus = [
      { button: document.getElementById('tpSettingsRailBtn'), menu: document.getElementById('tpSettingsMenu') }
    ].filter(({ button, menu }) => button && menu);

    if (!menus.length || document.body.dataset.tpDesktopMenusBound === 'true') return;
    document.body.dataset.tpDesktopMenusBound = 'true';

    menus.forEach((entry) => {
      entry.close = () => {
        entry.menu.classList.remove('open');
        entry.button.setAttribute('aria-expanded', 'false');
        clearActiveDropdown(entry.close);
      };
    });

    menus.forEach((entry) => {
      entry.button.addEventListener('click', (event) => {
        event.stopPropagation();
        menus.forEach((other) => { if (other !== entry) other.close(); });
        const isOpen = entry.menu.classList.toggle('open');
        entry.button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) registerOpenDropdown(entry.close);
        else clearActiveDropdown(entry.close);
      });
    });

    document.addEventListener('click', (event) => {
      const inside = menus.some(({ button, menu }) => button.contains(event.target) || menu.contains(event.target));
      if (!inside) {
        menus.forEach((entry) => entry.close());
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menus.forEach((entry) => entry.close());
      }
    });
  }

  function initSharedSignOut() {
    const signOutBtn = document.getElementById('signOutBtn') || document.getElementById('tpSignOut');
    if (!signOutBtn || signOutBtn.dataset.sharedSignOutBound === 'true') return;
    signOutBtn.dataset.sharedSignOutBound = 'true';

    signOutBtn.addEventListener('click', () => {
      if (USE_SERVER_AUTH) return;
      clearAuthStorage();
      window.location.href = getIndexHref();
    });
  }

  function getAuditHref() {
    const path = window.location.pathname || '';
    return path.includes('/pages/') ? '../../audit.html' : 'audit.html';
  }

  async function checkAdminAuditAccess() {
    const loginMethod = localStorage.getItem('authLoginMethod') || '';
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
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

  function initAuditLink() {
    const link = document.getElementById('tpAuditLink');
    if (!link) return;
    link.href = getAuditHref();

    if (localStorage.getItem('adminAuditAllowed') === 'true') {
      link.style.visibility = 'visible';
    }

    checkAdminAuditAccess().then((allowed) => {
      link.style.visibility = allowed ? 'visible' : 'hidden';
    });
  }

  function initAdminSignInLink() {
    if (window.OPSHUB_IS_ADMIN_USER !== true) return;
    const menu = document.getElementById('tpAccountMenu');
    if (!menu || menu.querySelector('#tpAdminSignInLink')) return;
    const link = document.createElement('a');
    link.className = 'home-accordion__link';
    link.id = 'tpAdminSignInLink';
    link.href = buildToolsHref('/admin.html');
    link.innerHTML = '<span>Sign-In Log</span>';
    menu.appendChild(link);
  }

  function initTokenHints() {
    const menu = document.getElementById('tpUserMenu');
    if (!menu || menu.querySelector('.tp-token-hint')) return;

    const hint = document.createElement('div');
    hint.className = 'tp-token-hint';

    const scopeHint = document.createElement('div');
    scopeHint.className = 'tp-token-hint';

    const signOutBtn = menu.querySelector('#signOutBtn') || menu.querySelector('#tpSignOut');
    if (signOutBtn) {
      menu.insertBefore(scopeHint, signOutBtn);
      menu.insertBefore(hint, scopeHint);
    } else {
      menu.appendChild(hint);
      menu.appendChild(scopeHint);
    }

    function updateHint() {
      const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
      const tail = token ? token.slice(-6) : '';
      hint.textContent = token ? `Token: …${tail}` : 'Token: not set';

      const scopes = (localStorage.getItem('authScopes') || '').trim();
      if (!scopes) {
        scopeHint.textContent = 'WxCC scopes: unknown';
        return;
      }
      const hasCjp = scopes.includes('cjp:config');
      const hasCjpRead = scopes.includes('cjp:config_read');
      const hasCjpWrite = scopes.includes('cjp:config_write');
      const ok = hasCjp || hasCjpRead || hasCjpWrite;
      scopeHint.textContent = ok ? 'WxCC scopes: ok' : 'WxCC scopes: missing';
    }

    updateHint();
  }

  function setHeaderOrgName(name, showCaret = false) {
    const orgEl = document.getElementById('userOrg') || document.getElementById('tpUserOrg');
    if (!orgEl || !name) return;
    if (orgEl.classList.contains('tp-org-trigger')) {
      orgEl.innerHTML = `${name}${showCaret ? ' <span class="tp-org-caret">▾</span>' : ''}`;
      return;
    }
    orgEl.textContent = name;
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
    if (orgPathIdx !== -1) {
      const candidate = raw.slice(orgPathIdx + 'organization/'.length);
      return candidate || raw;
    }
    return raw;
  }

  function initOrgSwitcher() {
    const menu = document.getElementById('tpOrgMenu');
    if (!menu || menu.querySelector('#tpOrgSwitchBtn')) return;

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'home-accordion__link tp-dropdown-item';
    switchBtn.id = 'tpOrgSwitchBtn';
    switchBtn.textContent = 'Switch Organization';
    switchBtn.style.display = 'none';
    menu.appendChild(switchBtn);

    const updateSwitchState = (event) => {
      const hasToken = (localStorage.getItem(TOKEN_KEY) || '').trim();
      const loginMethod = localStorage.getItem('authLoginMethod') || '';
      if (!hasToken) {
        switchBtn.style.display = 'none';
        switchBtn.disabled = true;
        switchBtn.title = 'Sign in first';
        return;
      }
      switchBtn.style.display = '';
      switchBtn.disabled = false;
      switchBtn.title = '';
      if (event?.detail?.autoOpen) {
        switchBtn.click();
      }
    };
    updateSwitchState();
    window.addEventListener('storage', updateSwitchState);
    window.addEventListener('token-updated', updateSwitchState);

    let orgs = [];
    let hasLoaded = false;

    function parseNextLink(linkHeader) {
      if (!linkHeader) return '';
      const match = linkHeader.split(',').map((s) => s.trim()).find((s) => s.includes('rel="next"'));
      if (!match) return '';
      const urlMatch = match.match(/<([^>]+)>/);
      return urlMatch ? urlMatch[1] : '';
    }

    async function fetchAllOrgs() {
      const items = [];
      let url = 'https://webexapis.com/v1/organizations?max=1000';
      let safety = 0;
      while (url && safety < 10) {
        safety += 1;
        const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
        if (!token) break;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) break;
        const data = await res.json();
        const pageItems = Array.isArray(data.items)
          ? data.items
          : (Array.isArray(data.organizations) ? data.organizations : (Array.isArray(data) ? data : []));
        if (pageItems.length) items.push(...pageItems);
        url = parseNextLink(res.headers.get('Link'));
      }
      return items;
    }

    function ensureModal() {
      let modal = document.querySelector('.tp-org-modal');
      if (modal) return modal;
      modal = document.createElement('div');
      modal.className = 'tp-org-modal';
      modal.innerHTML = `
        <div class="tp-org-card" role="dialog" aria-modal="true">
          <div class="tp-org-title">Switch Org</div>
          <div class="tp-org-subtitle">Search by name — or paste an Org ID (UUID or Hydra) and press Enter.</div>
          <div class="tp-org-actions">
            <input class="tp-org-search-input" type="text" placeholder="Org name or Org ID" />
            <button class="tp-org-search-btn" type="button">Search</button>
          </div>
          <div class="tp-org-results"></div>
          <div class="tp-org-footer">
            <button class="tp-org-cancel" type="button">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      return modal;
    }

    function renderResults(results) {
      const modal = ensureModal();
      const list = modal.querySelector('.tp-org-results');
      if (!results.length) {
        list.innerHTML = '<div class="tp-org-empty">No matches</div>';
        return;
      }
      const current = localStorage.getItem(ORG_KEY) || '';
      list.innerHTML = results.map((org) => {
        const name = org.displayName || org.name || org.id;
        const active = org.id === current ? ' active' : '';
        return `<button class="tp-org-result${active}" type="button" data-org-id="${org.id}" data-org-name="${name}">${name}</button>`;
      }).join('');
    }

    function openModal() {
      const modal = ensureModal();
      const input = modal.querySelector('.tp-org-search-input');
      const results = modal.querySelector('.tp-org-results');
      input.value = '';
      results.innerHTML = '<div class="tp-org-empty">Enter a organization name.</div>';
      modal.classList.add('open');
      input.focus();

      const cancelBtn = modal.querySelector('.tp-org-cancel');
      const searchBtn = modal.querySelector('.tp-org-search-btn');
      const doSearch = async () => {
        const term = input.value.trim();
        if (!term) {
          results.innerHTML = '<div class="tp-org-empty">Enter an organization name or Org ID.</div>';
          return;
        }
        // If the term looks like a UUID or a Hydra base64 ID, try a direct org lookup first
        const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term)
          || /^[A-Za-z0-9+/]{20,}={0,2}$/.test(term);
        if (looksLikeId) {
          results.innerHTML = '<div class="tp-org-empty">Looking up org…</div>';
          const lookupToken = (localStorage.getItem(TOKEN_KEY) || '').trim();
          try {
            const res = await fetch(`https://webexapis.com/v1/organizations/${encodeURIComponent(term)}`, {
              headers: { Authorization: `Bearer ${lookupToken}` }
            });
            if (res.ok) {
              const org = await res.json();
              renderResults([org]);
              return;
            }
          } catch (_) { /* fall through to name search */ }
        }
        // Fall back to name search
        if (!hasLoaded) {
          orgs = await fetchAllOrgs();
          hasLoaded = true;
        }
        const matches = orgs.filter((org) => (org.displayName || org.name || org.id || '').toLowerCase().includes(term.toLowerCase()));
        renderResults(matches);
      };
      searchBtn.onclick = doSearch;
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          doSearch();
        }
      };
      cancelBtn.onclick = () => modal.classList.remove('open');
      modal.onclick = (event) => {
        if (event.target === modal) modal.classList.remove('open');
      };
      results.onclick = (event) => {
        const btn = event.target.closest('.tp-org-result');
        if (!btn) return;
        const nextId = btn.dataset.orgId;
        const nextName = btn.dataset.orgName || nextId;
        if (!nextId) return;
        localStorage.setItem(ORG_KEY, nextId);
        localStorage.setItem(ORG_NAME_KEY, nextName);
        const decoded = decodeOrgId(nextId);
        if (decoded) localStorage.setItem('authOrgId', decoded);
        const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
        if (typeof isPartnerToken === 'function' && isPartnerToken(token) && typeof patchLoginRecord === 'function') {
          patchLoginRecord({ switchedOrg: nextName });
        }
        modal.classList.remove('open');
        window.location.reload();
      };
    }
    switchBtn.addEventListener('click', openModal);
  }

  function handleTokenSignIn(rawToken) {
    const token = (rawToken || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return Promise.reject(new Error('Token is required'));
    }
    const headers = { Authorization: `Bearer ${token}` };
    const orgRequest = fetch('https://webexapis.com/v1/organizations?max=1000', { headers }).then((res) => {
      if (!res.ok) throw new Error('Unable to fetch organizations');
      return res.json();
    });
    const meRequest = fetch('https://webexapis.com/v1/people/me', { headers }).then((res) => {
      if (!res.ok) throw new Error('Unable to fetch user info');
      return res.json();
    });

    return Promise.allSettled([orgRequest, meRequest]).then(([orgResult, meResult]) => {
      const orgInfo = { id: '', name: '' };
      if (orgResult.status === 'fulfilled' && orgResult.value) {
        const data = orgResult.value;
        const items = Array.isArray(data.items)
          ? data.items
          : (Array.isArray(data.organizations) ? data.organizations : []);
        if (items.length) {
          const first = items[0];
          orgInfo.id = first.id || first.orgId || '';
          orgInfo.name = first.displayName || first.name || '';
        }
      }
      const meData = meResult.status === 'fulfilled' ? meResult.value : null;

      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('authLoginMethod', 'token');
      localStorage.setItem('authRefreshToken', '');
      localStorage.setItem('authExpiresAt', '');
      localStorage.removeItem('authScopes');

      if (meData) {
        const userName = meData.displayName || meData.name || meData.emails?.[0] || '';
        if (userName) {
          localStorage.setItem('authUserName', userName);
        }
      }

      if (orgInfo.id) {
        localStorage.setItem('authOrg', orgInfo.id);
        localStorage.setItem('authOrgId', decodeOrgId(orgInfo.id) || orgInfo.id);
        if (orgInfo.name) {
          localStorage.setItem('authOrgName', orgInfo.name);
        }
      } else {
        localStorage.removeItem('authOrg');
        localStorage.removeItem('authOrgId');
        localStorage.removeItem('authOrgName');
      }

      const orgName = orgInfo.name || localStorage.getItem(ORG_NAME_KEY) || '';
      const tokenOwner = meData ? (meData.displayName || meData.name || meData.emails?.[0] || '') : '';
      if (typeof isPartnerToken === 'function' && isPartnerToken(token) && typeof patchLoginRecord === 'function') {
        patchLoginRecord({
          tokenType: 'Partner Token',
          switchedOrg: orgName || '',
          tokenUser: '',
          tokenOrg: ''
        });
      } else if (typeof patchLoginRecord === 'function') {
        patchLoginRecord({
          tokenType: 'Customer Token',
          switchedOrg: '',
          tokenUser: tokenOwner || '',
          tokenOrg: orgName || ''
        });
      }

      window.dispatchEvent(new CustomEvent('token-updated', { detail: { autoOpen: true } }));
      return token;
    });
  }

  function ensureTokenModal() {
    let modal = document.getElementById('apiToolsTokenModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'apiToolsTokenModal';
    modal.className = 'tp-token-modal';
    modal.innerHTML = `
      <div class="tp-token-card" role="dialog" aria-modal="true">
        <button type="button" class="tp-token-close" aria-label="Close">×</button>
        <div class="tp-token-title">Use Bearer Token</div>
        <p class="tp-token-subtitle">Paste a Webex bearer token.</p>
        <input
          class="tp-token-input"
          type="password"
          name="api-tools-bearer-token"
          inputmode="text"
          placeholder="Paste Bearer Token"
          autocomplete="new-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          readonly
          data-lpignore="true"
          data-1p-ignore="true"
        />
        <div class="tp-token-help">
          <a class="tp-token-help-link" href="https://developer.webex.com" target="_blank" rel="noopener noreferrer">
            Get a token from developer.webex.com
          </a>
        </div>
        <div class="tp-token-actions">
          <button type="button" class="btn tp-token-submit">Use Token</button>
        </div>
        <div class="tp-token-status" aria-live="polite"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const input = modal.querySelector('.tp-token-input');
    const submitBtn = modal.querySelector('.tp-token-submit');
    const statusEl = modal.querySelector('.tp-token-status');
    const closeBtn = modal.querySelector('.tp-token-close');
    const helpLink = modal.querySelector('.tp-token-help-link');
    const unlockTokenInput = () => {
      if (input.hasAttribute('readonly')) input.removeAttribute('readonly');
    };

    const closeModal = () => {
      modal.classList.remove('open');
      statusEl.textContent = '';
      input.setAttribute('readonly', 'readonly');
    };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    const submitToken = () => {
      statusEl.textContent = '';
      const value = input.value.trim();
      if (!value) {
        statusEl.textContent = 'Token is required.';
        return;
      }
      submitBtn.disabled = true;
      statusEl.textContent = 'Validating token…';
      handleTokenSignIn(value)
        .then(() => {
          statusEl.textContent = 'Token stored.';
          setTimeout(() => {
            closeModal();
          }, 200);
        })
        .catch((err) => {
          statusEl.textContent = err?.message || 'Unable to set token.';
        })
        .finally(() => {
          submitBtn.disabled = false;
        });
    };

    submitBtn.addEventListener('click', submitToken);
    input.addEventListener('focus', unlockTokenInput);
    input.addEventListener('pointerdown', unlockTokenInput);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitToken();
      }
    });
    helpLink?.addEventListener('click', (event) => {
      event.preventDefault();
      const popupWidth = Math.min(window.screen.availWidth - 40, Math.max(1280, window.outerWidth - 40));
      const popupHeight = Math.min(window.screen.availHeight - 80, Math.max(760, window.outerHeight - 120));
      const left = window.screenX + Math.max(0, (window.outerWidth - popupWidth) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - popupHeight) / 2);
      const popupName = `webexDevToken-${Date.now()}`;
      const popup = window.open(
        'https://developer.webex.com',
        popupName,
        `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
      if (popup) {
        popup.focus();
      } else {
        window.location.href = 'https://developer.webex.com';
      }
    });

    return modal;
  }

  function openTokenModal() {
    const modal = ensureTokenModal();
    modal.classList.add('open');
    const input = modal.querySelector('.tp-token-input');
    input.value = '';
    input.setAttribute('readonly', 'readonly');
    const statusEl = modal.querySelector('.tp-token-status');
    if (statusEl) statusEl.textContent = '';
    input.focus();
  }
  window.openTokenModal = openTokenModal;

  function initTokenEntryMenu() {
    const menu = document.getElementById('tpOrgMenu');
    if (!menu || menu.querySelector('#tpUseBearerToken')) return;
    const tokenBtn = document.createElement('button');
    tokenBtn.type = 'button';
    tokenBtn.className = 'home-accordion__link tp-dropdown-item';
    tokenBtn.id = 'tpUseBearerToken';
    tokenBtn.textContent = 'Use Bearer Token';
    menu.appendChild(tokenBtn);
    tokenBtn.addEventListener('click', (event) => {
      event.preventDefault();
      openTokenModal();
    });
  }

  function initPwaInstallPrompt() {
    if (!isHomePage()) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    let deferredPrompt = null;
    let toastElement = null;

    function createToast() {
      if (toastElement || !document.body) return toastElement;
      const toast = document.createElement('div');
      toast.id = PWA_PROMPT_ID;
      toast.className = 'pwa-install-toast';
      toast.innerHTML = `
        <style>
          .pwa-install-btn .pwa-install-icon {
            display: inline-block;
            width: 20px;
            height: 20px;
            margin-right: 8px;
            vertical-align: middle;
            background-image: url('/opshub/assets/images/CX%20only%20padded.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }
        </style>
        <button class="pwa-install-close" type="button" aria-label="Dismiss install prompt">×</button>
        <div class="pwa-install-message">
          <div>
            <strong class="pwa-install-title">Install as an app</strong>
            <p class="pwa-install-desc">Launch the OpsHub in its own window.</p>
          </div>
        </div>
        <div class="pwa-install-actions">
          <button class="pwa-install-btn" type="button">
            <span class="pwa-install-icon" aria-hidden="true"></span>
            <span>Open in app</span>
          </button>
        </div>
      `;
      document.body.appendChild(toast);
      const installBtn = toast.querySelector('.pwa-install-btn');
      const dismissBtn = toast.querySelector('.pwa-install-close');

      installBtn?.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        hideToast();
      });

      dismissBtn?.addEventListener('click', () => {
        deferredPrompt = null;
        hideToast();
      });

      toastElement = toast;
      return toast;
    }

    function showToast() {
      const toast = createToast();
      if (toast) toast.classList.add('open');
    }

    function hideToast() {
      const toast = toastElement || document.getElementById(PWA_PROMPT_ID);
      if (toast) toast.classList.remove('open');
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      showToast();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideToast();
    });
  }

  function ensureHeaderSticky() {
    const header = document.querySelector('.tp-header');
    if (!header) return;
    if (header.parentElement?.classList.contains('tp-header-sticky')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'tp-header-sticky';
    // Insert at the body level (not header's original parent) so the sticky
    // element has the full page height to stick within — nesting it inside a
    // shrink-wrapped container like <api-tools-header> gives it zero room to
    // stick and it just scrolls away immediately.
    document.body.insertBefore(wrapper, document.body.firstChild);
    wrapper.appendChild(header);
    const banner = document.getElementById('wxStatusBanner');
    if (banner) wrapper.appendChild(banner);

    function syncHeaderHeight() {
      document.documentElement.style.setProperty('--tp-header-h', `${wrapper.offsetHeight}px`);
    }
    syncHeaderHeight();
    window.addEventListener('resize', syncHeaderHeight);
    if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(wrapper);
  }

  const SIDE_RAIL_ICONS = {
    calling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5c0-1.1.9-2 2-2h2l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v2c0 1.1-.9 2-2 2h-1C9.5 19 3.5 13 3.5 6.5v-1Z"/></svg>',
    contact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-6H4Z"/><path d="M20 13a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1v-6h1Z"/><path d="M15 19a2 2 0 0 1-2 2h-1"/></svg>',
    aiagent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="2.5"/><path d="M12 3v4"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="13" r="1.2"/><circle cx="15" cy="13" r="1.2"/><path d="M9 16.5c1 .8 2 1 3 1s2-.2 3-1"/><path d="M2 13v2"/><path d="M22 13v2"/></svg>',
    meetings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M21 8.5v7l-5-2.5v-2Z"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/></svg>',
    org: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1"/><path d="M10 21v-3h4v3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M9.5 12l1.8 1.8L15 10.2"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    // Home / house glyph used for the "go to landing page" button at the
    // top of the side rail (both compact and expanded).
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 10v9.5h4v-5h5v5h4V10"/></svg>',
    // Chat-bubble glyph for the new Webex Messages section. Without this
    // the compact rail was rendering the string "undefined" where the
    // icon should sit (Messages was added after this map was written).
    messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-4 3.5v-3.5H6a2 2 0 0 1-2-2v-9Z"/><path d="M8 8h8M8 12h5"/></svg>'
  };

  const AVATAR_FALLBACK_SRC = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#123258"/><circle cx="20" cy="17" r="7" fill="#8fdcff"/><path d="M5 37c1.8-8.5 7.4-13 15-13s13.2 4.5 15 13" fill="#8fdcff"/></svg>'
  );

  function initUserAvatar() {
    const img = document.getElementById('tpUserAvatar');
    if (!img) return;

    const cached = localStorage.getItem('authAvatarUrl');
    img.src = cached || AVATAR_FALLBACK_SRC;
    img.onerror = () => { img.src = AVATAR_FALLBACK_SRC; };

    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (!token || img.dataset.avatarFetchedFor === token) return;
    img.dataset.avatarFetchedFor = token;

    fetch('https://webexapis.com/v1/people/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.avatar) {
          localStorage.setItem('authAvatarUrl', data.avatar);
          img.src = data.avatar;
        } else {
          localStorage.removeItem('authAvatarUrl');
          img.src = AVATAR_FALLBACK_SRC;
        }
      })
      .catch(() => {});
  }

  const RAIL_EXPANDED_KEY = 'tpRailExpanded';

  function initSideRail() {
    if (document.body.classList.contains('api-home')) return;
    if (document.querySelector('.tp-side-rail')) return;

    const sections = [
      { key: 'calling', title: 'Webex Calling', items: CALLING_NAV_ITEMS },
      { key: 'contact', title: 'Webex Contact Center', items: CONTACT_CENTER_NAV_ITEMS },
      { key: 'aiagent', title: 'AI Agent', items: AI_AGENT_NAV_ITEMS },
      { key: 'meetings', title: 'Webex Meetings', items: MEETINGS_NAV_ITEMS },
      { key: 'messages', title: 'Webex Messages', items: MESSAGES_NAV_ITEMS }
    ];

    function pathMatchesItem(path, item) {
      if (path.endsWith(item.path)) return true;
      // The wizard is a multi-step flow (S1_Teams.html…S5_Users.html) but only
      // its entry step is in the nav data — treat any step as a match so the
      // section stays open and the link stays highlighted throughout the flow.
      if (item.path.includes('/wizard/') && path.includes('/pages/wxcc/wizard/')) return true;
      return false;
    }

    function findCurrentSectionIndex() {
      const path = window.location.pathname;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].items.some((item) => pathMatchesItem(path, item))) return i;
      }
      return null;
    }

    // Rail is now always expanded -- the collapse feature was pulled
    // because the toggle button was inconsistently placed and the
    // collapsed rail duplicated navigation the header already covers.
    let expanded = true;
    try { localStorage.setItem(RAIL_EXPANDED_KEY, 'true'); } catch {}
    document.body.classList.add('tp-rail-expanded');

    const rail = document.createElement('aside');
    rail.className = 'tp-side-rail';
    rail.setAttribute('aria-label', 'Navigate OpsHub');
    rail.innerHTML = '<div class="tp-rail-nav" id="tpRailNav"></div>';
    document.body.appendChild(rail);
    const navHost = rail.querySelector('#tpRailNav');

    const flyout = document.createElement('div');
    flyout.className = 'tp-side-flyout';
    flyout.setAttribute('role', 'dialog');
    flyout.innerHTML = `
      <div class="tp-side-flyout__head" id="tpSideFlyoutTitle"></div>
      <nav class="tp-side-flyout__links" id="tpSideFlyoutLinks" aria-label="Tools"></nav>
    `;
    document.body.appendChild(flyout);

    const flyoutTitle = flyout.querySelector('#tpSideFlyoutTitle');
    const flyoutLinks = flyout.querySelector('#tpSideFlyoutLinks');
    let openIndex = null;

    function closeFlyout() {
      openIndex = null;
      flyout.classList.remove('open');
      rail.querySelectorAll('[data-rail-trigger]').forEach((btn) => {
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-active');
      });
      clearActiveDropdown(closeFlyout);
    }

    function positionFlyout(btn) {
      const rect = btn.getBoundingClientRect();
      const maxTop = window.innerHeight - flyout.offsetHeight - 12;
      flyout.style.top = `${Math.max(12, Math.min(rect.top, maxTop))}px`;
      flyout.classList.add('open');
      rail.querySelectorAll('[data-rail-trigger]').forEach((b) => {
        const active = b === btn;
        b.setAttribute('aria-expanded', active ? 'true' : 'false');
        b.classList.toggle('is-active', active);
      });
      registerOpenDropdown(closeFlyout);
    }

    function openFlyout(index, btn) {
      const section = sections[index];
      openIndex = index;
      flyoutTitle.textContent = section.title;
      flyoutLinks.innerHTML = section.items.map((item) => `
        <a class="home-accordion__link" href="${buildToolsHref(item.path)}"><span>${item.label}</span></a>
      `).join('');
      positionFlyout(btn);
    }

    function openAccountFlyout(btn) {
      openIndex = 'account';
      flyoutTitle.textContent = 'Admin';
      // Mirror the expanded rail's Admin accordion content: the two
      // As-Built links (from ADMIN_NAV_ITEMS) plus the Admin Audit /
      // Sign-In Log the JS helpers wire up below. Previously this
      // popover only had Admin Audit + Sign-In Log, so the compact
      // rail was missing the As-Built links that appear when expanded.
      flyoutLinks.innerHTML = `
        <div id="tpAccountMenu" class="home-accordion__links">
          ${ADMIN_NAV_ITEMS.map((item) => `<a class="home-accordion__link" href="${buildToolsHref(item.path)}"><span>${item.label}</span></a>`).join('')}
          <a class="home-accordion__link" id="tpAuditLink" href="${getAuditHref()}" style="visibility:hidden;"><span>Admin Audit</span></a>
        </div>
      `;
      // Populate before measuring/positioning so the flyout sizes to its real content.
      initAuditLink();
      initAdminSignInLink();
      positionFlyout(btn);
    }

    function openOrgFlyout(btn) {
      openIndex = 'org';
      flyoutTitle.textContent = 'Org';
      flyoutLinks.innerHTML = '<div id="tpOrgMenu" class="home-accordion__links"></div>';
      initOrgSwitcher();
      initTokenEntryMenu();
      positionFlyout(btn);
    }

    function handleRailTriggerClick(btn) {
      const raw = btn.dataset.railTrigger;
      const index = (raw === 'account' || raw === 'org') ? raw : Number(raw);
      if (openIndex === index) {
        closeFlyout();
      } else if (index === 'account') {
        openAccountFlyout(btn);
      } else if (index === 'org') {
        openOrgFlyout(btn);
      } else {
        openFlyout(index, btn);
      }
    }

    function bindRailTriggers(container) {
      container.querySelectorAll('[data-rail-trigger]').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          handleRailTriggerClick(btn);
        });
      });
    }

    function toggleExpandButtonHTML() {
      return `
        <button class="tp-side-rail__btn tp-rail-expand-toggle" type="button" id="tpRailExpandToggle" aria-label="${expanded ? 'Collapse navigation' : 'Expand navigation'}" title="${expanded ? 'Collapse navigation' : 'Expand navigation'}">
          ${expanded ? SIDE_RAIL_ICONS.collapse : SIDE_RAIL_ICONS.expand}
        </button>
      `;
    }

    function renderCompactNav() {
      // Sections first, then Admin/Org/Settings triggers below them --
      // matches the expanded accordion's top-to-bottom order 1:1 so
      // items don't jump around when the rail collapses/expands.
      // Collapse toggle moves to the bottom of the rail (below).
      navHost.innerHTML = sections.map((s, index) => `
        <button class="tp-side-rail__btn" type="button" data-rail-trigger="${index}" aria-expanded="false" aria-label="${s.title}">
          ${SIDE_RAIL_ICONS[s.key]}
        </button>
      `).join('') + `
        <button class="tp-side-rail__btn" type="button" data-rail-trigger="account" aria-haspopup="true" aria-expanded="false" aria-label="Admin">
          ${SIDE_RAIL_ICONS.person}
        </button>
      `;
      bindRailTriggers(navHost);
    }

    function collapseAccordionSections() {
      navHost.querySelectorAll('[data-home-section]').forEach((sectionEl) => {
        sectionEl.classList.remove('is-open');
        const trigger = sectionEl.querySelector('[data-home-trigger]');
        const panel = sectionEl.querySelector('.home-accordion__panel');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (panel) panel.hidden = true;
      });
    }

    function accountSettingsSectionsHTML() {
      const showAuthLink = window.API_TOOLS_SHOW_AUTH_LINK === true;
      return `
        <section class="home-accordion__section" data-home-section="account">
          <button
            class="home-accordion__trigger"
            type="button"
            aria-expanded="false"
            aria-controls="tpRailPanelAccount"
            id="tpRailTriggerAccount"
            data-home-trigger="account"
          >
            <span class="home-accordion__label">Admin</span>
            <span class="home-accordion__chevron" aria-hidden="true">▸</span>
          </button>
          <div class="home-accordion__panel" id="tpRailPanelAccount" role="region" aria-labelledby="tpRailTriggerAccount" hidden>
            <nav class="home-accordion__links" id="tpAccountMenu" aria-label="Admin">
              ${ADMIN_NAV_ITEMS.map((item) => `<a class="home-accordion__link" href="${buildToolsHref(item.path)}"><span>${item.label}</span></a>`).join('')}
              <a class="home-accordion__link" id="tpAuditLink" href="${getAuditHref()}" style="visibility:hidden;"><span>Admin Audit</span></a>
            </nav>
          </div>
        </section>
        <section class="home-accordion__section" data-home-section="org">
          <button
            class="home-accordion__trigger"
            type="button"
            aria-expanded="false"
            aria-controls="tpRailPanelOrg"
            id="tpRailTriggerOrg"
            data-home-trigger="org"
          >
            <span class="home-accordion__label">Org</span>
            <span class="home-accordion__chevron" aria-hidden="true">▸</span>
          </button>
          <div class="home-accordion__panel" id="tpRailPanelOrg" role="region" aria-labelledby="tpRailTriggerOrg" hidden>
            <nav class="home-accordion__links" id="tpOrgMenu" aria-label="Org"></nav>
          </div>
        </section>
        <section class="home-accordion__section" data-home-section="settings">
          <button
            class="home-accordion__trigger"
            type="button"
            aria-expanded="false"
            aria-controls="tpRailPanelSettings"
            id="tpRailTriggerSettings"
            data-home-trigger="settings"
          >
            <span class="home-accordion__label">Settings</span>
            <span class="home-accordion__chevron" aria-hidden="true">▸</span>
          </button>
          <div class="home-accordion__panel" id="tpRailPanelSettings" role="region" aria-labelledby="tpRailTriggerSettings" hidden>
            <nav class="home-accordion__links" id="tpSettingsMenu" aria-label="Settings">
              ${showAuthLink ? '<button class="home-accordion__link tp-dropdown-item authLink" type="button">Sign In</button>' : ''}
              <button class="home-accordion__link tp-dropdown-item" id="tpStatusToggle" type="button">Webex Status: Off</button>
              <button class="home-accordion__link tp-dropdown-item" id="signOutBtn" type="button">Sign Out</button>
            </nav>
          </div>
        </section>
      `;
    }

    function renderExpandedNav() {
      const currentIndex = findCurrentSectionIndex();
      const currentPath = window.location.pathname;

      navHost.innerHTML = `
        <div class="home-accordion tp-rail-accordion" id="tpRailAccordion">
          ${sections.map((s, index) => {
            const isCurrent = index === currentIndex;
            return `
            <section class="home-accordion__section${isCurrent ? ' is-open' : ''}" data-home-section="${index}">
              <button
                class="home-accordion__trigger"
                type="button"
                aria-expanded="${isCurrent}"
                aria-controls="tpRailPanel${index}"
                id="tpRailTrigger${index}"
                data-home-trigger="${index}"
              >
                <span class="home-accordion__label">${s.title}</span>
                <span class="home-accordion__chevron" aria-hidden="true">▸</span>
              </button>
              <div class="home-accordion__panel" id="tpRailPanel${index}" role="region" aria-labelledby="tpRailTrigger${index}" ${isCurrent ? '' : 'hidden'}>
                <nav class="home-accordion__links" aria-label="${s.title}">
                  ${s.items.map((item) => `
                    <a class="home-accordion__link${pathMatchesItem(currentPath, item) ? ' is-active' : ''}" href="${buildToolsHref(item.path)}"><span>${item.label}</span></a>
                  `).join('')}
                </nav>
              </div>
            </section>
          `;
          }).join('')}
          ${accountSettingsSectionsHTML()}
        </div>
      `;

      navHost.querySelectorAll('[data-home-trigger]').forEach((trigger) => {
        trigger.addEventListener('click', () => {
          const sectionEl = trigger.closest('[data-home-section]');
          const isOpen = trigger.getAttribute('aria-expanded') === 'true';
          collapseAccordionSections();
          if (isOpen) return;
          sectionEl.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          const panel = sectionEl.querySelector('.home-accordion__panel');
          if (panel) panel.hidden = false;
        });
      });

      // If the current URL matches an Admin sub-link (e.g.
      // /pages/asbuilt/wxc.html), open the Admin accordion so the link
      // stays highlighted after navigation. The main sections already
      // handle this via findCurrentSectionIndex; Admin/Org/Settings
      // needed a matching pass here since they're not in `sections`.
      if (ADMIN_NAV_ITEMS.some((item) => pathMatchesItem(currentPath, item))) {
        const adminSection = navHost.querySelector('[data-home-section="account"]');
        const adminTrigger = adminSection?.querySelector('[data-home-trigger="account"]');
        const adminPanel   = adminSection?.querySelector('.home-accordion__panel');
        if (adminSection) adminSection.classList.add('is-open');
        if (adminTrigger) adminTrigger.setAttribute('aria-expanded', 'true');
        if (adminPanel)   adminPanel.hidden = false;
        // Highlight the matching link inside so the current page reads
        // as active, same as main section links do.
        adminPanel?.querySelectorAll('a.home-accordion__link').forEach((a) => {
          const href = a.getAttribute('href') || '';
          if (href && currentPath.endsWith(href.replace(/^.*\/opshub/, '/opshub'))) {
            a.classList.add('is-active');
          }
        });
      }
    }

    // Compact-mode bottom row: Org + Settings triggers (Admin lives up
     // in the section list next to the main nav sections now, matching
     // where it sits in the expanded accordion). Collapse toggle sits at
     // the very bottom in BOTH modes -- appended below whatever the
     // per-mode bottom row emits.
    function compactBottomHTML() {
      const showAuthLink = window.API_TOOLS_SHOW_AUTH_LINK === true;
      return `
        <button class="tp-side-rail__btn" type="button" data-rail-trigger="org" aria-haspopup="true" aria-expanded="false" aria-label="Org">
          ${SIDE_RAIL_ICONS.org}
        </button>
        <div class="tp-rail-item">
          <button class="tp-side-rail__btn" type="button" id="tpSettingsRailBtn" aria-haspopup="true" aria-expanded="false" aria-label="Settings">
            ${SIDE_RAIL_ICONS.settings}
          </button>
          <div class="tp-rail-menu" id="tpSettingsMenu" role="menu">
            <div class="tp-rail-menu__head">Settings</div>
            ${showAuthLink ? '<button class="tp-dropdown-item authLink" type="button">Sign In</button>' : ''}
            <button class="tp-dropdown-item" id="tpStatusToggle" type="button">Webex Status: Off</button>
            <button class="tp-dropdown-item" id="signOutBtn" type="button">Sign Out</button>
          </div>
        </div>
      `;
    }

    function renderBottom() {
      // Rail no longer collapses -- the whole bottom chrome (collapse
      // toggle + compact-mode Org/Settings triggers) goes away. Org and
      // Settings still live inside the expanded accordion via
      // accountSettingsSectionsHTML(), so nothing was lost.
      const bottomHost = rail.querySelector('.tp-rail-bottom');
      if (bottomHost) bottomHost.remove();
    }

    function renderNav() {
      closeFlyout();
      if (expanded) {
        renderExpandedNav();
      } else {
        renderCompactNav();
      }
      renderBottom();
      initAuditLink();
      initAdminSignInLink();
      initOrgSwitcher();
      initTokenEntryMenu();
      initSharedSignOut();
      initWebexStatusBanner();

      const toggleBtn = navHost.querySelector('#tpRailExpandToggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          expanded = !expanded;
          localStorage.setItem(RAIL_EXPANDED_KEY, expanded ? 'true' : 'false');
          document.body.classList.toggle('tp-rail-expanded', expanded);
          renderNav();
        });
      }
    }

    renderNav();

    document.addEventListener('click', (event) => {
      if (openIndex === null) return;
      if (!flyout.contains(event.target) && !rail.contains(event.target)) closeFlyout();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFlyout();
    });
  }

  if (USE_SERVER_AUTH) {
    document.addEventListener('click', handleAuthClick, true);
  }
  ensureManifestLink();
  ensureThemeColorMeta();
  initPwaInstallPrompt();
  markPreAuthNav();

  // Inject the header immediately so that page scripts (which run before
  // DOMContentLoaded when readyState is still 'loading') can find nav elements.
  if (document.body) {
    ensureHeader();
    initSideRail();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }

  // Capture the initial OAuth login and create the mock API row once.
  if (localStorage.getItem(TOKEN_KEY) || localStorage.getItem('authUserName') || localStorage.getItem(ORG_NAME_KEY)) {
    logLoginOnce();
  }
})();
