(function () {
  const HOME_SECTIONS = [
    {
      title: 'Administration',
      items: [
        { title: 'Bulk Import', desc: 'Bulk-create Teams, Queues, Entry Points, Desktop Profiles, and Users from fillable rows.', href: 'pages/bulkimport.html' },
        { title: 'Setup Wizard', desc: 'Step-by-step guided setup for Contact Center configuration.', href: 'pages/S1_Teams.html' },
        { title: 'Search API', desc: 'Run contact searches with custom filters and payloads.', href: 'pages/searchapi.html' },
        { title: 'Supervisor Controls', desc: 'Supervisor-facing contact center controls.', href: 'pages/supervisorcontrols.html' }
      ]
    },
    {
      title: 'Customer Experience',
      items: [
        { title: 'Entry Point', desc: 'Browse entry points and linked flows.', href: 'pages/channels.html' },
        { title: 'Queues', desc: 'List inbound queues and dependencies.', href: 'pages/queues.html' },
        { title: 'Business Hours', desc: 'View and manage business hours schedules and shifts.', href: 'pages/businesshours.html' },
        { title: 'Flows', desc: 'List flows, export, and Flow Visualizations.', href: 'pages/flows.html' },
        { title: 'Functions', desc: 'Browse hidden Functions, edit fnCode, and save updates back through the BFF.', href: 'pages/functions.html' },
        { title: 'Function Builder', desc: 'Build a lookup-table function from an input variable and a set of rows.', href: 'pages/functionbuilder.html' },
        { title: 'AI Agent', desc: 'Review AI call summaries, endpoints, and auth guidance.', href: 'pages/aiagent.html' }
      ]
    },
    {
      title: 'User Management',
      items: [
        { title: 'Contact Center Users', desc: 'List users, status, and team assignments.', href: 'pages/contactcenterusers.html' },
        { title: 'Skills', desc: 'View skill profiles and skill definitions.', href: 'pages/skills.html' }
      ]
    },
    {
      title: 'Desktop Experience',
      items: [
        { title: 'Desktop Layout', desc: 'Build and preview agent desktop layouts.', href: 'pages/desktoplayout.html' },
        { title: 'Address Book', desc: 'Search and manage address book entries.', href: 'pages/addressbook.html' },
        { title: 'Desktop Profiles', desc: 'Review every desktop profile with routing, wrap-up, and stats.', href: 'pages/desktopprofiles.html' }
      ]
    },
    {
      title: 'Statistics',
      items: [
        { title: 'Realtime Dashboard', desc: 'Jump straight into a live Dashboard!', href: 'pages/realtime-dashboard.html' },
        { title: 'Historical Data', desc: 'Reconstruct a queue and team snapshot for a specific time.', href: 'pages/historical-data.html' }
      ]
    }
  ];

  class ApiToolsHeader extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';

      const base = this.getAttribute('basepath') || '';

      this.innerHTML = `
        <header class="tp-header">
          <div class="tp-header-inner">
            <div class="left">
              <a class="tp-logo" href="${base}home.html" aria-label="Orbit — Home">
                <img src="${base}assets/images/Orbit.png" alt="Orbit">
              </a>
            </div>
            <div class="right">
              <div class="tp-header-actions">
                <div class="tp-user-menu">
                  <button class="tp-user-avatar-btn" id="tpUserMenuBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">
                    <img class="tp-user-avatar" id="tpUserAvatar" alt="" aria-hidden="true">
                  </button>
                  <div class="tp-user-dropdown" id="tpUserMenuDropdown" role="menu">
                    <div class="tp-user-dropdown__identity">
                      <div class="tp-user-name" id="userName">Signed in</div>
                      <div class="tp-user-org" id="userOrg"></div>
                    </div>
                    <button class="tp-dropdown-item" id="tpStatusToggle" type="button">Webex Status: Off</button>
                    <button class="tp-dropdown-item" id="signOutBtn" type="button">Sign Out</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div id="wxStatusBanner" class="wx-status-banner" data-proxy-url="${(window.ORBIT_PROXY_BASE || '') + '/status'}">
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
        </div>
      `;
    }
  }

  class ApiAuthCard extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';

      const title = this.getAttribute('title') || 'Orbit';

      this.innerHTML = `
        <section class="surface-card surface-card--hero">
          <div class="hero-brand">
            <img class="hero-logo" src="assets/images/Orbit.png" alt="${title}">
          </div>
          <button class="auth-button" id="authBtn" type="button">
            <img src="assets/images/Webex.png" alt="Webex icon">
            Sign in with Webex
          </button>
          <p class="lead" aria-live="polite"></p>
        </section>
      `;
    }
  }

  class ApiToolsHome extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';

      this.innerHTML = `
        <main>
          <div class="home-layout">
            <aside class="home-sidebar" aria-label="Tool categories">
              <nav class="tp-rail-nav" aria-label="Webex Contact Center">
                ${HOME_SECTIONS.map((section) => `
                  <div class="tp-rail-group">
                    <div class="tp-rail-group__label">${section.title}</div>
                    ${section.items.map((item) => `
                      <a class="home-accordion__link" href="${item.href}"><span>${item.title}</span></a>
                    `).join('')}
                  </div>
                `).join('')}
              </nav>
            </aside>
            <section class="home-content">
              <img class="home-content__logo" src="assets/images/Orbit.png" alt="Orbit">
            </section>
          </div>
        </main>
      `;
    }
  }

  const QUEUES_SECTION = `
    <main>
      <div class="wrap wide contentWrap">
        <section class="card">
          <div class="pageHeader">
            <div>
              <h1>Queues <span class="section-count" id="queueCountPill">—</span></h1>
              <p class="lead">List inbound queues and inspect routing targets.</p>
            </div>
            <div class="pageHeaderActions">
              <input id="searchInput" class="searchInput" type="text" placeholder="Search queues..." />
              <button class="btn" id="scanAllBtn" disabled>Scan All Dependencies</button>
              <button class="btn" id="exportAllBtn" disabled>Export Table</button>
            </div>
          </div>
          <div class="status" id="statusText"></div>
          <div class="queue-table-scroll">
            <table class="queue-table" id="queueTable">
              <colgroup>
                <col class="queue-col-queue">
                <col class="queue-col-description">
                <col class="queue-col-dependencies">
                <col class="queue-col-direction">
                <col class="queue-col-channel">
                <col class="queue-col-routing">
                <col class="queue-col-assignment">
              </colgroup>
              <thead>
                <tr>
                  <th data-sort="name" class="is-filterable">
                    <span class="table-head-cell">
                      <button class="table-head-button" type="button" data-sort-trigger="name">
                        <span>Queue</span>
                        <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                      </button>
                      <div class="filter-dropdown header-filter-dropdown" id="nameDropdown">
                        <button class="filter-icon-btn" id="nameToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter queues">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"></polygon></svg>
                        </button>
                        <div class="filter-dropdown__panel" id="namePanel" role="listbox" aria-multiselectable="true">
                          <input class="filter-dropdown__search" type="search" placeholder="Search queues…" id="nameSearch" autocomplete="off">
                          <div class="filter-dropdown__list" id="nameList"></div>
                        </div>
                      </div>
                    </span>
                  </th>
                  <th data-sort="description">
                    <button class="table-head-button" type="button" data-sort-trigger="description">
                      <span>Description</span>
                      <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                    </button>
                  </th>
                  <th>Dependencies</th>
                  <th data-sort="queueType" class="is-filterable">
                    <span class="table-head-cell">
                      <button class="table-head-button" type="button" data-sort-trigger="queueType">
                        <span>Direction</span>
                        <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                      </button>
                      <div class="filter-dropdown header-filter-dropdown" id="directionDropdown">
                        <button class="filter-icon-btn" id="directionToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter direction">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"></polygon></svg>
                        </button>
                        <div class="filter-dropdown__panel" id="directionPanel" role="listbox" aria-multiselectable="true">
                          <input class="filter-dropdown__search" type="search" placeholder="Search…" id="directionSearch" autocomplete="off">
                          <div class="filter-dropdown__list" id="directionList"></div>
                        </div>
                      </div>
                    </span>
                  </th>
                  <th data-sort="channelType" class="is-filterable">
                    <span class="table-head-cell">
                      <button class="table-head-button" type="button" data-sort-trigger="channelType">
                        <span>Channel</span>
                        <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                      </button>
                      <div class="filter-dropdown header-filter-dropdown" id="channelDropdown">
                        <button class="filter-icon-btn" id="channelToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter channel">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"></polygon></svg>
                        </button>
                        <div class="filter-dropdown__panel" id="channelPanel" role="listbox" aria-multiselectable="true">
                          <input class="filter-dropdown__search" type="search" placeholder="Search…" id="channelSearch" autocomplete="off">
                          <div class="filter-dropdown__list" id="channelList"></div>
                        </div>
                      </div>
                    </span>
                  </th>
                  <th data-sort="routingType" class="is-filterable">
                    <span class="table-head-cell">
                      <button class="table-head-button" type="button" data-sort-trigger="routingType">
                        <span>Routing</span>
                        <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                      </button>
                      <div class="filter-dropdown header-filter-dropdown" id="routingDropdown">
                        <button class="filter-icon-btn" id="routingToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter routing">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"></polygon></svg>
                        </button>
                        <div class="filter-dropdown__panel" id="routingPanel" role="listbox" aria-multiselectable="true">
                          <input class="filter-dropdown__search" type="search" placeholder="Search…" id="routingSearch" autocomplete="off">
                          <div class="filter-dropdown__list" id="routingList"></div>
                        </div>
                      </div>
                    </span>
                  </th>
                  <th data-sort="queueRoutingType" class="is-filterable">
                    <span class="table-head-cell">
                      <button class="table-head-button" type="button" data-sort-trigger="queueRoutingType">
                        <span>Assignment</span>
                        <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                      </button>
                      <div class="filter-dropdown header-filter-dropdown" id="assignmentDropdown">
                        <button class="filter-icon-btn" id="assignmentToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter assignment">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 5 21 5 14 13 14 19 10 21 10 13 3 5"></polygon></svg>
                        </button>
                        <div class="filter-dropdown__panel" id="assignmentPanel" role="listbox" aria-multiselectable="true">
                          <input class="filter-dropdown__search" type="search" placeholder="Search…" id="assignmentSearch" autocomplete="off">
                          <div class="filter-dropdown__list" id="assignmentList"></div>
                        </div>
                      </div>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody id="queueTableBody">
                <tr><td colspan="7" class="realtime-status">Loading queues…</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  `;

  const REALTIME_SECTION = `
    <main>
      <div class="wrap wide contentWrap">
        <section class="card">
        <div class="dashboard-panel-body">
        <section class="dashboard-intro">
          <div class="pageHeader dashboard-hero">
            <h1>Realtime Contact Center Dashboard</h1>
            <div class="dashboard-filter-row" aria-label="Dashboard filters">
              <div class="dashboard-filter-group">
                <span class="dashboard-filter-group__label">Queue Name</span>
                <div class="filter-dropdown dashboard-filter-dropdown" id="sharedQueueDropdown">
                  <button class="filter-dropdown__toggle dashboard-filter-toggle" id="sharedQueueToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter dashboard by queue">
                    <span class="dashboard-filter-toggle__text">All</span>
                    <span class="filter-dropdown__badge">0</span>
                    <span class="filter-dropdown__chevron" aria-hidden="true">▼</span>
                  </button>
                  <div class="filter-dropdown__panel" id="sharedQueuePanel" role="listbox" aria-multiselectable="true">
                    <input class="filter-dropdown__search" type="search" placeholder="Search queues…" id="sharedQueueSearch" autocomplete="off">
                    <div class="filter-dropdown__list" id="sharedQueueList"></div>
                  </div>
                </div>
              </div>
              <div class="dashboard-filter-group">
                <span class="dashboard-filter-group__label">Managed Teams</span>
                <div class="filter-dropdown dashboard-filter-dropdown" id="sharedTeamDropdown">
                  <button class="filter-dropdown__toggle dashboard-filter-toggle" id="sharedTeamToggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter dashboard by team">
                    <span class="dashboard-filter-toggle__text">All</span>
                    <span class="filter-dropdown__badge">0</span>
                    <span class="filter-dropdown__chevron" aria-hidden="true">▼</span>
                  </button>
                  <div class="filter-dropdown__panel" id="sharedTeamPanel" role="listbox" aria-multiselectable="true">
                    <input class="filter-dropdown__search" type="search" placeholder="Search teams…" id="sharedTeamSearch" autocomplete="off">
                    <div class="filter-dropdown__list" id="sharedTeamList"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="metric-grid" role="region" aria-label="Realtime KPIs">
            <article class="metric-card">
              <span class="metric-label">Waiting Now</span>
              <strong class="metric-value" id="metric-activeCalls">0</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">Longest in Queue</span>
              <strong class="metric-value" id="metric-avgWait">00:00:00</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">Total Handled</span>
              <strong class="metric-value" id="metric-handled">0</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">Connected</span>
              <strong class="metric-value" id="metric-connected">0</strong>
            </article>
            <article class="metric-card">
              <span class="metric-label">Total Abandoned</span>
              <strong class="metric-value" id="metric-abandoned">0</strong>
            </article>
          </div>
        </section>

        <section class="dashboard-section dashboard-block">
          <div class="queue-table-wrap">
            <div class="card-header">
              <div class="card-header-meta">
                <h2>Queue Details</h2>
                <span class="section-count" id="queueCountLabel">—</span>
              </div>
            </div>
            <div class="queue-table-scroll">
              <table class="queue-table" id="queueTable">
                <colgroup>
                  <col class="queue-col-name">
                  <col class="queue-col-waiting">
                  <col class="queue-col-avg-wait">
                  <col class="queue-col-longest-wait">
                  <col class="queue-col-handled">
                  <col class="queue-col-abandoned">
                  <col class="queue-col-connected">
                </colgroup>
                <thead>
                  <tr>
                    <th data-sort="name">
                      <span class="table-head-cell">
                        <button class="table-head-button" type="button" data-sort-trigger="name">
                          <span>Queue</span>
                          <span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span>
                        </button>
                      </span>
                    </th>
                    <th data-sort="waiting"><button class="table-head-button" type="button" data-sort-trigger="waiting"><span>Waiting</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                    <th data-sort="avgWait"><button class="table-head-button" type="button" data-sort-trigger="avgWait"><span>Avg Wait</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                    <th data-sort="longestWait"><button class="table-head-button" type="button" data-sort-trigger="longestWait"><span>Longest Wait</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                    <th data-sort="handled"><button class="table-head-button" type="button" data-sort-trigger="handled"><span>Handled</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                    <th data-sort="abandoned"><button class="table-head-button" type="button" data-sort-trigger="abandoned"><span>Abandoned</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                    <th data-sort="connected"><button class="table-head-button" type="button" data-sort-trigger="connected"><span>Connected</span><span class="sort-caret" aria-hidden="true"><span class="sort-caret__up">▲</span><span class="sort-caret__down">▼</span></span></button></th>
                  </tr>
                </thead>
                <tbody id="queueTableBody">
                  <tr><td colspan="7" class="realtime-status">Loading queue data…</td></tr>
                </tbody>
                <tfoot id="queueTableFoot"></tfoot>
              </table>
            </div>
          </div>
        </section>

        <section class="dashboard-section dashboard-block">
          <div class="agent-table-wrap">
            <div class="card-header">
              <div class="card-header-meta">
                <h2>Agent State</h2>
                <span class="section-count" id="agentCountLabel">—</span>
              </div>
            </div>
            <div class="agent-summary-pills" id="agentSummaryPills">
              <span class="agent-pill available"><span class="agent-pill__count" id="agentCount-available">0</span> Available</span>
              <span class="agent-pill connected"><span class="agent-pill__count" id="agentCount-connected">0</span> Connected</span>
              <span class="agent-pill wrapup"><span class="agent-pill__count" id="agentCount-wrapup">0</span> Wrap-up</span>
              <span class="agent-pill idle"><span class="agent-pill__count" id="agentCount-idle">0</span> Idle</span>
            </div>
            <div class="agent-table-scroll">
              <table class="agent-state-table" id="agentStateTable">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Agent</th>
                    <th>State</th>
                    <th>Duration</th>
                    <th>Idle Code</th>
                    <th>Handled</th>
                    <th>RONA</th>
                  </tr>
                </thead>
                <tbody id="agentStateBody">
                  <tr><td colspan="7" class="realtime-status">Loading agent data…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        </div>
        </section>
      </div>
    </main>
  `;

  class ApiToolsQueues extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      this.innerHTML = QUEUES_SECTION;
    }
  }

  class ApiToolsRealtime extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      this.innerHTML = REALTIME_SECTION;
    }
  }

  if (!customElements.get('api-tools-header')) {
    customElements.define('api-tools-header', ApiToolsHeader);
  }

  if (!customElements.get('api-auth-card')) {
    customElements.define('api-auth-card', ApiAuthCard);
  }

  if (!customElements.get('api-tools-home')) {
    customElements.define('api-tools-home', ApiToolsHome);
  }

  if (!customElements.get('api-tools-queues')) {
    customElements.define('api-tools-queues', ApiToolsQueues);
  }

  if (!customElements.get('api-tools-realtime')) {
    customElements.define('api-tools-realtime', ApiToolsRealtime);
  }
})();
