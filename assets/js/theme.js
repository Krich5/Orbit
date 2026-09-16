(function () {
  const ORG_KEY = 'authOrg';
  const ORG_NAME_KEY = 'authOrgName';
  const TOKEN_KEY = 'authBearer';
  const EXPIRES_KEY = 'authExpiresAt';
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
  // Derived from the current URL so the app works whether it's hosted at a
  // domain root or under a subpath (e.g. GitHub Pages project sites like
  // https://user.github.io/Orbit/).
  const SITE_ROOT = (function () {
    const path = window.location.pathname || '/';
    const marker = '/pages/';
    const idx = path.indexOf(marker);
    if (idx !== -1) return path.slice(0, idx);
    return path.replace(/\/[^/]*$/, '');
  })();
  const THEME_COLOR = '#0a224a';
  const MANIFEST_PATH = `${SITE_ROOT}/assets/manifest.webmanifest`;
  const PWA_PROMPT_ID = 'apiInstallToast';
  const PREAUTH_CLASS = 'pre-auth';
  const LANDING_PATHS = [`${SITE_ROOT}/index.html`, `${SITE_ROOT}/`, SITE_ROOT];
  const OAUTH_SERVER_HOST = 'automation.cxsol.com';
  const DEFAULT_OAUTH_ROOT = '/oauth';
  const AUTH_LOGIN_SELECTORS = ['#authBtn', '.authLink', '#authWebex', '.authCard .btn.webex', '.btn-webex'];
  const AUTH_LOGOUT_SELECTORS = ['#signOutBtn'];
  const OAUTH_ROOT = (window.API_TOOLS_AUTH_ROOT || DEFAULT_OAUTH_ROOT).replace(/\/+$/, '');
  const OAUTH_LOGIN_URL = `${OAUTH_ROOT}/webex_login.php`;
  const OAUTH_LOGOUT_URL = `${OAUTH_ROOT}/webex_logout.php`;
  const USE_SERVER_AUTH = window.API_TOOLS_AUTH_FORCE === true || Boolean(window.API_TOOLS_AUTH_ROOT) || window.location.host.includes(OAUTH_SERVER_HOST);
  const CONTACT_CENTER_NAV_GROUPS = [
    {
      title: 'Administration',
      items: [
        { label: 'Bulk Import', path: '/pages/wxcc/bulkimport.html' },
        { label: 'Setup Wizard', path: '/pages/wxcc/S1_Teams.html' },
        { label: 'Search API', path: '/pages/wxcc/searchapi.html' },
        { label: 'Supervisor Controls', path: '/pages/wxcc/supervisorcontrols.html' }
      ]
    },
    {
      title: 'Customer Experience',
      items: [
        { label: 'Entry Point', path: '/pages/wxcc/channels.html' },
        { label: 'Queues', path: '/pages/wxcc/queues.html' },
        { label: 'Business Hours', path: '/pages/wxcc/businesshours.html' },
        { label: 'Flows', path: '/pages/wxcc/flows.html' },
        { label: 'Functions', path: '/pages/wxcc/functions.html' },
        { label: 'Function Builder', path: '/pages/wxcc/functionbuilder.html' },
        { label: 'AI Agent', path: '/pages/wxcc/aiagent.html' }
      ]
    },
    {
      title: 'User Management',
      items: [
        { label: 'Contact Center Users', path: '/pages/wxcc/contactcenterusers.html' },
        { label: 'Skills', path: '/pages/wxcc/skills.html' }
      ]
    },
    {
      title: 'Desktop Experience',
      items: [
        { label: 'Desktop Layout', path: '/pages/wxcc/desktoplayout.html' },
        { label: 'Address Book', path: '/pages/wxcc/addressbook.html' },
        { label: 'Desktop Profiles', path: '/pages/wxcc/desktopprofiles.html' }
      ]
    },
    {
      title: 'Statistics',
      items: [
        { label: 'Realtime Dashboard', path: '/pages/wxcc/realtime-dashboard.html' },
        { label: 'Historical Data', path: '/pages/wxcc/historical-data.html' }
      ]
    }
  ];

  function getIndexHref() {
    return `${SITE_ROOT}/index.html`;
  }

  function getSignedOutHref() {
    const url = new URL(getIndexHref(), window.location.href);
    url.searchParams.set('signedout', '1');
    return url.toString();
  }

  function getToolsRootPath() {
    return SITE_ROOT;
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
    if (document.body.classList.contains('api-home')) return;
    if (document.querySelector('.tp-header')) return;
    const root = getToolsRootPath();
    const header = document.createElement('header');
    header.className = 'tp-header';
    header.innerHTML = `
      <div class="tp-header-inner">
        <div class="left">
          <a class="tp-logo" href="${root}/home.html" aria-label="Orbit \u2014 Home">
            <span class="tp-logo-text">Orbit</span>
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
    banner.dataset.proxyUrl = (window.ORBIT_PROXY_BASE || '') + '/status';
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

    validateSessionOnLoad();
    initWebexStatusBanner();

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn && !signOutBtn.dataset.loginClearBound) {
      signOutBtn.dataset.loginClearBound = 'true';
      signOutBtn.addEventListener('click', () => {
        localStorage.removeItem('authLoginMethod');
      });
    }
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
      { button: document.getElementById('tpUserMenuBtn'), menu: document.getElementById('tpUserMenuDropdown') }
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

  function populateAuthFromToken(token) {
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

      window.dispatchEvent(new CustomEvent('token-updated', { detail: { autoOpen: true } }));
      return token;
    });
  }

  function handleTokenSignIn(rawToken) {
    const token = (rawToken || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return Promise.reject(new Error('Token is required'));
    }
    return populateAuthFromToken(token).then((resolvedToken) => {
      localStorage.setItem('authLoginMethod', 'token');
      localStorage.setItem('authRefreshToken', '');
      localStorage.setItem('authExpiresAt', '');
      localStorage.removeItem('authScopes');
      return resolvedToken;
    });
  }

  // Called by callback.html once it has exchanged an OAuth authorization
  // code for a real token set (see proxy/server.js's /token route).
  function completeOAuthSignIn(tokenResponse) {
    const token = (tokenResponse?.access_token || '').trim();
    if (!token) {
      return Promise.reject(new Error('No access token returned'));
    }
    return populateAuthFromToken(token).then((resolvedToken) => {
      localStorage.setItem('authLoginMethod', 'oauth');
      localStorage.setItem('authRefreshToken', tokenResponse.refresh_token || '');
      const expiresIn = Number(tokenResponse.expires_in);
      localStorage.setItem('authExpiresAt', expiresIn ? String(Date.now() + expiresIn * 1000) : '');
      if (tokenResponse.scope) {
        localStorage.setItem('authScopes', tokenResponse.scope);
      } else {
        localStorage.removeItem('authScopes');
      }
      return resolvedToken;
    });
  }
  window.completeOAuthSignIn = completeOAuthSignIn;

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
            background-image: url('/assets/images/Orbit_Icon-192.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }
        </style>
        <button class="pwa-install-close" type="button" aria-label="Dismiss install prompt">×</button>
        <div class="pwa-install-message">
          <div>
            <strong class="pwa-install-title">Install as an app</strong>
            <p class="pwa-install-desc">Launch Orbit in its own window.</p>
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

  function initSideRail() {
    if (document.body.classList.contains('api-home')) return;
    if (document.querySelector('.tp-side-rail')) return;

    const WIZARD_STEP_FILES = ['S1_Teams.html', 'S2_Queues.html', 'S3_Channels.html', 'S4_DesktopProfile.html', 'S5_Users.html'];

    function pathMatchesItem(path, item) {
      if (path.endsWith(item.path)) return true;
      // The wizard is a multi-step flow (S1_Teams.html…S5_Users.html) but only
      // its entry step is in the nav data — treat any step as a match so the
      // link stays highlighted throughout the flow.
      if (WIZARD_STEP_FILES.some((f) => item.path.endsWith(f)) && WIZARD_STEP_FILES.some((f) => path.endsWith(f))) return true;
      return false;
    }

    const currentPath = window.location.pathname;
    const rail = document.createElement('aside');
    rail.className = 'tp-side-rail';
    rail.setAttribute('aria-label', 'Navigate Orbit');
    rail.innerHTML = `
      <nav class="tp-rail-nav" aria-label="Webex Contact Center">
        ${CONTACT_CENTER_NAV_GROUPS.map((group) => `
          <div class="tp-rail-group">
            <div class="tp-rail-group__label">${group.title}</div>
            ${group.items.map((item) => `
              <a class="home-accordion__link${pathMatchesItem(currentPath, item) ? ' is-active' : ''}" href="${buildToolsHref(item.path)}"><span>${item.label}</span></a>
            `).join('')}
          </div>
        `).join('')}
      </nav>
    `;
    document.body.appendChild(rail);
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
})();
