(function () {
  const STATE_KEY = 'orbitOAuthState';

  function getToken() {
    return localStorage.getItem('authBearer') || '';
  }

  function setStatus(text) {
    const lead = document.querySelector('.lead');
    if (lead) lead.textContent = text;
  }

  function startOAuth() {
    const state = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: window.ORBIT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: window.ORBIT_REDIRECT_URI,
      scope: window.ORBIT_OAUTH_SCOPES || '',
      state,
    });
    window.location.href = `https://webexapis.com/v1/authorize?${params.toString()}`;
  }

  function initAuthButton() {
    const authButton = document.getElementById('authBtn');
    if (!authButton) return;

    const oauthConfigured = window.ORBIT_CLIENT_ID && window.ORBIT_REDIRECT_URI
      && !String(window.ORBIT_CLIENT_ID).includes('REPLACE');

    authButton.addEventListener('click', () => {
      if (oauthConfigured) {
        startOAuth();
      } else if (typeof window.openTokenModal === 'function') {
        window.openTokenModal();
      }
    });
  }

  function initStatus() {
    if (getToken()) {
      window.location.href = 'home.html';
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('signedout') === '1') {
      setStatus('Session expired. Please sign in again.');
    } else if (params.get('error')) {
      setStatus(`Sign-in failed: ${params.get('error')}`);
    }
  }

  function init() {
    initAuthButton();
    initStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
