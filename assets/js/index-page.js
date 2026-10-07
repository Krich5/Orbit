(function () {
  const CLIENT_ID = window.ORBIT_CLIENT_ID;
  const REDIRECT_URI = window.ORBIT_REDIRECT_URI;
  const SCOPES = window.ORBIT_OAUTH_SCOPES;
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

    // Flow A — popup landed on popup-callback.html and forwarded the raw
    // code+state back to us: we take over the token exchange on this window.
    if (data.source === 'api-popup') {
      const expectedState = localStorage.getItem(STATE_KEY);
      if (expectedState && data.state && data.state !== expectedState) return;
      localStorage.removeItem(AUTH_IN_PROGRESS);
      localStorage.removeItem(STATE_KEY);
      window.location.href = `callback.html?code=${encodeURIComponent(data.code || '')}&error=${encodeURIComponent(data.error || '')}`;
      return;
    }

    // Flow B — popup landed on callback.html (our registered redirect_uri),
    // did the token exchange itself, and is just nudging us that we're
    // signed in. The authBearer is already in localStorage at this point.
    if (data.source === 'orbit-oauth' && data.status === 'signed-in') {
      localStorage.removeItem(AUTH_IN_PROGRESS);
      localStorage.removeItem(STATE_KEY);
      window.location.href = 'home.html';
    }
  }

  // Even without the postMessage nudge, the opener window can detect the
  // popup writing to localStorage via the 'storage' event — this covers
  // the case where the popup closes before postMessage lands or the user
  // blocks popups entirely and callback.html ran in the main window instead.
  function handleStorage(event) {
    if (event.key !== 'authBearer') return;
    if (!event.newValue) return;
    localStorage.removeItem(AUTH_IN_PROGRESS);
    localStorage.removeItem(STATE_KEY);
    window.location.href = 'home.html';
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
        window.location.href = 'index.html';
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
    window.addEventListener('storage', handleStorage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
