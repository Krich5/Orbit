(function () {
  const CLIENT_ID = 'Cc604fe2354b93ecd1eb3d799e69a4ce981649161c1e31253ae91805e95b54e64';
  const REDIRECT_URI = 'https://cxasteam.bitbucket.io/opshub/callback.html';
  const SCOPES = 'spark-admin:locations_write spark:all spark-admin:locations_read spark-admin:organizations_read spark:organizations_read spark-admin:workspace_locations_read spark-admin:places_read cjp:config_read spark:kms spark-admin:devices_read cjp:config_write spark-admin:workspace_locations_write spark-admin:places_write cjp:config spark-admin:devices_write spark-admin:telephony_config_read spark-admin:telephony_config_write audit:events_read spark-admin:licenses_read spark-admin:people_read spark-admin:people_write meeting:transcripts_read';
  const KEYS = { bearer: 'authBearer', org: 'authOrg', orgName: 'authOrgName' };
  const STATE_KEY = 'api_auth_state';
  const AUTH_IN_PROGRESS = 'api_auth_in_progress';
  const SIGN_OUT_KEYS = ['authBearer', 'authOrg', 'authOrgName', 'authUserName', 'authRefreshToken', 'authExpiresAt'];

  function getToken() {
    return localStorage.getItem(KEYS.bearer) || '';
  }

  function getLead() {
    return document.querySelector('.lead');
  }

  function setStatus(text) {
    const lead = getLead();
    if (lead) lead.textContent = text;
  }

  function buildAuthUrl(state) {
    return `https://webexapis.com/v1/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(state)}&prompt=consent`;
  }

  function startAuth() {
    const state = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STATE_KEY, state);
    localStorage.setItem(AUTH_IN_PROGRESS, '1');

    const authUrl = buildAuthUrl(state);
    const width = 520;
    const height = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open(authUrl, 'webexApiAuth', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      window.location.href = authUrl;
      return;
    }

    setStatus('Waiting for Webex sign-in to complete…');
  }

  function handleMessage(event) {
    if (event.origin !== window.location.origin) return;

    const data = event.data || {};
    if (data.source !== 'api-popup') return;

    const expectedState = localStorage.getItem(STATE_KEY);
    if (expectedState && data.state && data.state !== expectedState) return;

    localStorage.removeItem(AUTH_IN_PROGRESS);
    localStorage.removeItem(STATE_KEY);
    window.location.href = `callback.html?code=${encodeURIComponent(data.code || '')}&error=${encodeURIComponent(data.error || '')}`;
  }

  function initAuthButton() {
    const authButton = document.getElementById('authBtn');
    if (authButton) authButton.addEventListener('click', startAuth);
  }

  function closeMenu(button, menu) {
    if (!button || !menu) return;
    menu.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu(button, menu, siblings) {
    if (!button || !menu) return;

    siblings.forEach(({ button: siblingButton, menu: siblingMenu }) => closeMenu(siblingButton, siblingMenu));
    const isOpen = menu.classList.toggle('open');
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function initHeaderMenus() {
    const userButton = document.getElementById('tpUserMenuBtn');
    const userMenu = document.getElementById('tpUserMenu');
    const signOutButton = document.getElementById('tpSignOut');

    const menus = [
      { button: userButton, menu: userMenu }
    ];

    menus.forEach(({ button, menu }) => {
      if (!button || !menu) return;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMenu(
          button,
          menu,
          menus.filter((entry) => entry.button !== button)
        );
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      const clickedInsideMenu = menus.some(({ button, menu }) => {
        return Boolean(button && menu && (button.contains(target) || menu.contains(target)));
      });

      if (!clickedInsideMenu) {
        menus.forEach(({ button, menu }) => closeMenu(button, menu));
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        menus.forEach(({ button, menu }) => closeMenu(button, menu));
      }
    });

    if (signOutButton) {
      signOutButton.addEventListener('click', () => {
        SIGN_OUT_KEYS.forEach((key) => localStorage.removeItem(key));
        window.location.href = '/opshub/index.html';
      });
    }
  }

  function initStatus() {
    const token = getToken();
    if (token) {
      window.location.href = 'home.html';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('signedout') === '1') {
      setStatus('Session expired. Please sign in again.');
      return;
    }

    if (localStorage.getItem(AUTH_IN_PROGRESS)) {
      setStatus('If the login window did not appear, click “Sign in with Webex” to retry.');
    }
  }

  function init() {
    initAuthButton();
    initHeaderMenus();
    initStatus();
    window.addEventListener('message', handleMessage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
