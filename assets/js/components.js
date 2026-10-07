(function () {
  const HOME_SECTIONS = [
    {
      title: 'Webex Calling',
      items: [
        { title: 'Workspaces', desc: 'Bulk workspace creation with extensions and phone numbers.', href: 'pages/wxc/workspaces.html' },
        { title: 'Locations', desc: 'Pull a list of Webex Calling locations for your org.', href: 'pages/wxc/locations.html' },
        { title: 'Numbers', desc: 'List all Webex Calling numbers.', href: 'pages/wxc/number.html' },
        { title: 'Usage & Activity', desc: 'Find calling-licensed users with no recent usage or disabled login.', href: 'pages/wxc/usage.html' },
        { title: 'Devices', desc: 'Bulk virtual line setup, assignment, and device add-ons.', href: 'pages/wxc/devices.html' },
        { title: 'Users', desc: 'List Control Hub users and update assigned license types.', href: 'pages/wxc/user.html' },
        { title: 'Virtual Lines', desc: 'Create, edit, and manage virtual lines for your org.', href: 'pages/wxc/virtuallines.html' },
        { title: 'Auto Attendant', desc: 'Create and configure auto attendants by location.', href: 'pages/wxc/autoattendant.html' }
      ]
    },
    {
      title: 'Webex Contact Center',
      items: [
        { title: 'Queues', desc: 'List inbound queues and dependencies.', href: 'pages/wxcc/queues.html' },
        { title: 'Business Hours', desc: 'View and manage business hours schedules and shifts.', href: 'pages/wxcc/businesshours.html' },
        { title: 'Contact Center Users', desc: 'List users, status, and team assignments.', href: 'pages/wxcc/contactcenterusers.html' },
        { title: 'Skills', desc: 'View skill profiles and skill definitions.', href: 'pages/wxcc/skills.html' },
        { title: 'Desktop Profiles', desc: 'Review every desktop profile with routing, wrap-up, and stats.', href: 'pages/wxcc/desktopprofiles.html' },
        { title: 'Desktop Layout', desc: 'Build and preview agent desktop layouts.', href: 'pages/wxcc/desktoplayout.html' },
        { title: 'Channels', desc: 'Browse Channels and liked Flows.', href: 'pages/wxcc/channels.html' },
        { title: 'Flows', desc: 'List flows, export, and Flow Visualizations.', href: 'pages/wxcc/flows.html' },
        { title: 'Functions', desc: 'Browse hidden Functions, edit fnCode, and save updates back through the BFF.', href: 'pages/wxcc/functions.html' },
        { title: 'Address Book', desc: 'Search and manage address book entries.', href: 'pages/wxcc/addressbook.html' },
        { title: 'Search API', desc: 'Run contact searches with custom filters and payloads.', href: 'pages/wxcc/searchapi.html' },
        { title: 'Realtime Dashboard', desc: 'Jump straight into a live Dashboard!', href: 'pages/wxcc/realtime-dashboard.html' },
        { title: 'Historical Data', desc: 'Reconstruct a queue and team snapshot for a specific time.', href: 'pages/wxcc/historical-data.html' },
        { title: 'Outbound Campaign Manager', desc: 'Manage outbound campaigns, contact lists, and manual contacts.', href: 'pages/wxcc/ocm.html' },
        { title: 'Contact Center Wizard', desc: 'Step-by-step guided setup for Contact Center configuration.', href: 'pages/wxcc/wizard/S1_Teams.html' },
        { title: 'Bulk Import', desc: 'Bulk-create Teams, Queues, Entry Points, Desktop Profiles, and Users from fillable rows.', href: 'pages/wxcc/bulkimport.html' }
      ]
    },
    {
      title: 'AI Agent',
      items: [
        { title: 'AI Bot Visualizer', desc: 'Load a bot export JSON and browse intents, entities, responses, and conversation flow.', href: 'pages/aiagent/visualizer.html' },
        { title: 'AI Call Transcript Summary', desc: 'Run post-call, mid-call transfer, and consult summaries using the Summaries API.', href: 'pages/aiagent/summary.html' },
        { title: 'AI Utilization', desc: 'Guided setup: import AI utilization assets (global vars + subflows) into the tenant.', href: 'pages/aiagent/utilization.html' },
        { title: 'Autonomous Instructions Builder', desc: 'Draft the Agent Goal and Instructions against the shared 5,120 character limit.', href: 'pages/aiagent/autonomous.html' },
        { title: 'AI Agent Calculator', desc: 'Size AI Agent / Assistant bundles from real per-queue call volume and connected time.', href: 'pages/aiagent/agent-calculator.html' }
      ]
    },
    {
      title: 'Webex Meetings',
      items: [
        { title: 'Meeting Transcriptions', desc: 'Browse recent meetings, pick a time range, and view or download the transcript.', href: 'pages/meetings/transcriptions.html' }
      ]
    },
    {
      // Space History Export used to live under Webex Calling but it's
      // actually a Messages API feature (/rooms, /messages, /people),
      // so it got its own group + its own folder (pages/wxmessages/).
      title: 'Webex Messages',
      items: [
        { title: 'Space History Export', desc: 'Export Webex space history with sender persona, timestamps, and transcript text.', href: 'pages/wxmessages/spacehistory.html' }
      ]
    }
  ];

  // Admin section sub-links surfaced on the home rail. Kept in sync
  // manually with ADMIN_NAV_ITEMS in theme.js so both the home page and
  // interior pages show the same Admin children.
  const HOME_ADMIN_ITEMS = [
    { title: 'Create As-Built',      href: 'pages/asbuilt/full.html' }
  ];

  const ADMIN_SECTIONS = `
    <main>
      <div class="wrap wide contentWrap">
        <section class="card">
          <div class="pageHeader">
            <div>
              <h1>Login Log</h1>
              <p class="lead" id="loginMeta">Loading...</p>
            </div>
            <div class="pageHeaderActions">
              <button class="btn" id="filterLogins">Hide Closed</button>
              <button class="btn" data-refresh="logins">↻ Refresh</button>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Signed In As</th>
                  <th>Token</th>
                  <th>Organization / Switched Org</th>
                  <th>Login Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="tbodyLogins"><tr class="state-row"><td colspan="7">Loading...</td></tr></tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  `;

  const AUDIT_SECTION = `
    <main>
      <div class="wrap wide contentWrap">
        <section class="card">
          <div class="pageHeader">
            <h1>Admin Audit</h1>
            <p class="lead">Review admin audit events across Webex services.</p>
          </div>
          <div class="message-banner error" id="accessNotice" style="display:none; margin-bottom:16px;">Admin access is required to view audit events.</div>
          <div class="filter-grid filter-grid--quad" id="auditFilters">
            <div class="field-stack">
              <label for="fromInput">From</label>
              <input id="fromInput" type="datetime-local" step="1" />
            </div>
            <div class="field-stack">
              <label for="toInput">To</label>
              <input id="toInput" type="datetime-local" step="1" />
            </div>
            <div class="field-stack">
              <label for="categoryToggle">Categories</label>
              <div class="dropdown-field">
                <button class="dropdown-button" id="categoryToggle" type="button" aria-haspopup="true" aria-expanded="false">
                  <span id="categoryLabel">All categories</span>
                  <span class="dropdown-caret">▾</span>
                </button>
                <div class="dropdown-panel" id="categoryMenu" role="menu">
                  <div class="dropdown-stack" id="categoryList"></div>
                </div>
              </div>
            </div>
            <div class="inline-actions">
              <button class="btn primary" id="loadBtn" type="button">Load</button>
            </div>
          </div>
          <div class="toolbar-surface" id="auditToolbar">
            <input id="searchInput" class="searchInput" type="search" placeholder="Search changed by..." />
            <span class="pill" id="countHint">0 events</span>
          </div>
          <div class="table-shell" id="auditTableWrap">
            <table class="data-sheet" id="auditTable"></table>
          </div>
          <div class="inline-actions inline-actions--spread" id="auditEmptyRow" style="margin-top:10px;">
            <span id="emptyState" class="emptyState" style="display:none;">No audit events found.</span>
          </div>
        </section>
      </div>
    </main>
  `;

  const REPORT_SECTION = `
    <main>
      <div class="page-shell">
        <section class="surface-card surface-card--panel">
          <div class="pageHeader">
            <h1>Feedback Flow Retired</h1>
            <p class="lead">The legacy feature request and bug report submission flow has been removed.</p>
          </div>
          <p class="page-subtitle">This area previously depended on an external mock backend and is no longer active.</p>
        </section>
      </div>
    </main>
    <footer>&copy; CX Advanced Solutions</footer>
  `;

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
                <img class="tp-user-avatar" id="tpUserAvatar" alt="" aria-hidden="true">
                <div class="tp-user-info">
                  <div class="tp-user-name" id="userName">Signed in</div>
                  <div class="tp-user-org" id="userOrg"></div>
                </div>
              </div>
            </div>
          </div>
        </header>
        <div id="wxStatusBanner" class="wx-status-banner" data-proxy-url="${(window.ORBIT_PROXY_BASE || "") + "/status"}">
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
              <div class="home-accordion" id="homeAccordion">
                ${HOME_SECTIONS.map((section, index) => `
                  <section class="home-accordion__section" data-home-section="${index}">
                    <button
                      class="home-accordion__trigger"
                      type="button"
                      aria-expanded="false"
                      aria-controls="homeSectionPanel${index}"
                      id="homeSectionTrigger${index}"
                      data-home-trigger="${index}"
                    >
                      <span class="home-accordion__label">${section.title}</span>
                      <span class="home-accordion__chevron" aria-hidden="true">▸</span>
                    </button>
                    <div
                      class="home-accordion__panel"
                      id="homeSectionPanel${index}"
                      role="region"
                      aria-labelledby="homeSectionTrigger${index}"
                      hidden
                    >
                      <nav class="home-accordion__links" aria-label="${section.title}">
                        ${section.items.map((item) => `
                          <a
                            class="home-accordion__link"
                            href="${item.href}"
                            data-home-link="${index}"
                          >
                            <span>${item.title}</span>
                          </a>
                        `).join('')}
                      </nav>
                    </div>
                  </section>
                `).join('')}
                <section class="home-accordion__section" data-home-section="account">
                  <button
                    class="home-accordion__trigger"
                    type="button"
                    aria-expanded="false"
                    aria-controls="homeSectionPanelAccount"
                    id="homeSectionTriggerAccount"
                    data-home-trigger="account"
                  >
                    <span class="home-accordion__label">Admin</span>
                    <span class="home-accordion__chevron" aria-hidden="true">▸</span>
                  </button>
                  <div
                    class="home-accordion__panel"
                    id="homeSectionPanelAccount"
                    role="region"
                    aria-labelledby="homeSectionTriggerAccount"
                    hidden
                  >
                    <nav class="home-accordion__links" id="tpAccountMenu" aria-label="Admin">
                      ${HOME_ADMIN_ITEMS.map((item) => `<a class="home-accordion__link" href="${item.href}"><span>${item.title}</span></a>`).join('')}
                    </nav>
                  </div>
                </section>
                <section class="home-accordion__section" data-home-section="settings">
                  <button
                    class="home-accordion__trigger"
                    type="button"
                    aria-expanded="false"
                    aria-controls="homeSectionPanelSettings"
                    id="homeSectionTriggerSettings"
                    data-home-trigger="settings"
                  >
                    <span class="home-accordion__label">Settings</span>
                    <span class="home-accordion__chevron" aria-hidden="true">▸</span>
                  </button>
                  <div
                    class="home-accordion__panel"
                    id="homeSectionPanelSettings"
                    role="region"
                    aria-labelledby="homeSectionTriggerSettings"
                    hidden
                  >
                    <nav class="home-accordion__links" id="tpSettingsMenu" aria-label="Settings">
                      <button class="home-accordion__link tp-dropdown-item" id="tpStatusToggle" type="button">Webex Status: Off</button>
                      <button class="home-accordion__link tp-dropdown-item" id="signOutBtn" type="button">Sign Out</button>
                    </nav>
                  </div>
                </section>
              </div>
            </aside>
            <section class="home-content">
              <img class="home-content__logo" src="assets/images/Orbit.png" alt="Orbit">
            </section>
          </div>
        </main>
      `;
    }
  }

  class ApiToolsAdmin extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      this.innerHTML = ADMIN_SECTIONS;
    }
  }

  class ApiToolsAudit extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      this.innerHTML = AUDIT_SECTION;
    }
  }

  class ApiToolsReport extends HTMLElement {
    connectedCallback() {
      if (this.dataset.rendered === 'true') return;
      this.dataset.rendered = 'true';
      this.innerHTML = REPORT_SECTION;
    }
  }

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

  if (!customElements.get('api-tools-admin')) {
    customElements.define('api-tools-admin', ApiToolsAdmin);
  }

  if (!customElements.get('api-tools-audit')) {
    customElements.define('api-tools-audit', ApiToolsAudit);
  }

  if (!customElements.get('api-tools-report')) {
    customElements.define('api-tools-report', ApiToolsReport);
  }

  if (!customElements.get('api-tools-queues')) {
    customElements.define('api-tools-queues', ApiToolsQueues);
  }

  if (!customElements.get('api-tools-realtime')) {
    customElements.define('api-tools-realtime', ApiToolsRealtime);
  }
})();
