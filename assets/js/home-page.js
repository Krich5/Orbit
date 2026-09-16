(function () {
  function ensureAuthenticated() {
    if (!(localStorage.getItem('authBearer') || '')) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  function init() {
    ensureAuthenticated();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
