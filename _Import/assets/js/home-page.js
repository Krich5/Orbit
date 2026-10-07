(function () {
  function ensureAuthenticated() {
    if (!(localStorage.getItem('authBearer') || '')) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  function activateSection(index) {
    document.querySelectorAll('[data-home-section]').forEach((sectionEl) => {
      const isActive = sectionEl.dataset.homeSection === String(index);
      sectionEl.classList.toggle('is-open', isActive);
      const trigger = sectionEl.querySelector('[data-home-trigger]');
      const panel = sectionEl.querySelector('.home-accordion__panel');
      if (trigger) trigger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
      if (panel) panel.hidden = !isActive;
    });
  }

  function collapseSections() {
    document.querySelectorAll('[data-home-section]').forEach((sectionEl) => {
      sectionEl.classList.remove('is-open');
      const trigger = sectionEl.querySelector('[data-home-trigger]');
      const panel = sectionEl.querySelector('.home-accordion__panel');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
    });
  }

  function initHomeAccordion() {
    const triggers = document.querySelectorAll('[data-home-trigger]');
    if (!triggers.length) return;
    triggers.forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const isOpen = trigger.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          collapseSections();
          return;
        }
        activateSection(trigger.dataset.homeTrigger);
      });
    });
    document.querySelectorAll('.home-accordion__link').forEach((linkEl) => {
      linkEl.addEventListener('click', () => {
        document.querySelectorAll('.home-accordion__link').forEach((item) => item.classList.remove('is-active'));
        linkEl.classList.add('is-active');
      });
    });
    collapseSections();
  }

  function initAdminLink() {
    if (document.body.dataset.adminUser !== 'true') return;
    const menu = document.getElementById('tpAccountMenu');
    if (!menu || menu.querySelector('#tpHomeAdminLink')) return;

    const link = document.createElement('a');
    link.className = 'home-accordion__link tp-dropdown-item';
    link.id = 'tpHomeAdminLink';
    link.href = 'admin.html';
    link.textContent = 'Admin';
    menu.appendChild(link);
  }

  function init() {
    if (!ensureAuthenticated()) return;
    initAdminLink();
    initHomeAccordion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
