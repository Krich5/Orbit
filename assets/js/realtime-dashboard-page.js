(function () {
  const SEARCH_ENDPOINT = 'https://api.wxcc-us1.cisco.com/search';
  const TEAM_ENDPOINT = (orgId, page = 0, pageSize = 250) =>
    `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/v2/team?page=${page}&pageSize=${pageSize}`;
  const USER_ENDPOINT = (orgId, page = 0, pageSize = 250) =>
    `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/v2/user?page=${page}&pageSize=${pageSize}`;
  const QUEUE_ENDPOINT = (orgId, page = 0, pageSize = 200) =>
    `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/v3/contact-service-queue?page=${page}&pageSize=${pageSize}`;

  const cacheKeyBearer = 'authBearer';
  const cacheKeyOrg = 'authOrg';
  const cacheKeyOrgName = 'authOrgName';
  const SERVICE_LEVEL_THRESHOLD_SEC = 30;
  const REFRESH_INTERVAL_MS = 5000;

  // ── State ──
  let teams = [];
  let agents = [];
  let queueCache = [];
  let refreshTimer = null;
  let filtersLoaded = false;
  let teamSelections = new Set();
  let queueSelections = new Set();
  let teamAllSelected = true;
  let queueAllSelected = true;
  let sortKey = 'waiting';
  let sortDir = -1;

  // ── DOM refs (populated after component renders) ──
  let queueTableBody, queueTableFoot, queueCountLabel, metricMap;

  function initDomRefs() {
    queueTableBody  = document.getElementById('queueTableBody');
    queueTableFoot  = document.getElementById('queueTableFoot');
    queueCountLabel = document.getElementById('queueCountLabel');
    metricMap = {
      activeCalls: { valueEl: document.getElementById('metric-activeCalls') },
      avgWait:     { valueEl: document.getElementById('metric-avgWait') },
      connected:   { valueEl: document.getElementById('metric-connected') },
      handled:     { valueEl: document.getElementById('metric-handled') },
      abandoned:   { valueEl: document.getElementById('metric-abandoned') }
    };
  }

  const QUEUE_METRIC_PATHS = {
    waiting:    ['statistics.waitingContacts','statistics.waiting','metrics.waitingCount','queueLength','currentQueueLength','queuedContacts','waiting'],
    serviceLevel:['statistics.serviceLevel','metrics.serviceLevel','serviceLevel','serviceLevelPercentage','serviceLevelPercent'],
    avgHandle:  ['statistics.averageTalkTime','metrics.averageTalkTime','metrics.avgHandleTime','averageTalkTime','avgHandleTime','averageHandlingTime'],
    agents:     ['statistics.assignedAgents','statistics.availableAgents','metrics.agentCount','metrics.availableAgents','assignedAgents','agents'],
    abandoned:  ['statistics.abandonedContacts','metrics.abandoned','abandonedContacts','abandoned'],
    presented:  ['statistics.presentedContacts','metrics.presented','presentedContacts','presented'],
    handled:    ['statistics.handledContacts','metrics.handled','handledContacts','handled'],
    connected:  ['statistics.connectedContacts','metrics.connected','connectedContacts','connected']
  };

  const STATE_BUCKETS = {
    available: ['AVAILABLE'],
    onCall:    ['CONNECTED','TALKING','ON_CALL','HOLD','CONSULT','CONFERENCE'],
    ringing:   ['RESERVED','RINGING'],
    wrapUp:    ['WRAPUP','WRAP_UP','WRAP_UP_AGENT','POST_CALL'],
    idle:      ['IDLE','NOT_RESPONDING','NOT_RESPONDED','RONA']
  };

  // ── Helpers ──
  function includesNormalized(list, value) {
    if (!Array.isArray(list) || !list.length || value === null || value === undefined) return false;
    const normalizedValue = String(value);
    return list.some((entry) => String(entry) === normalizedValue);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hrs  = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }

  function agentMatchesTeams(agent, teamIds) {
    if (!teamIds || !teamIds.size) return true;
    const candidateIds = new Set();
    (Array.isArray(agent?.teamIds) ? agent.teamIds : []).filter(Boolean).forEach((id) => candidateIds.add(String(id)));
    (Array.isArray(agent?.teams) ? agent.teams : []).forEach((team) => {
      const id = team?.id || team;
      if (id) candidateIds.add(String(id));
    });
    return [...teamIds].some((teamId) => candidateIds.has(teamId));
  }

  // ── Checkbox dropdown filter UI ──
  function updateDropdownBadge(dropdownId, selections, totalCount = selections.size, allSelected = false) {
    const el = document.getElementById(dropdownId);
    if (!el) return;
    const badge  = el.querySelector('.filter-dropdown__badge');
    const toggle = el.querySelector('.filter-dropdown__toggle');
    const textEl = el.querySelector('.dashboard-filter-toggle__text');
    const count  = allSelected ? totalCount : selections.size;
    if (badge)  { badge.textContent = count; badge.hidden = count === 0; }
    if (toggle) toggle.classList.toggle('has-selection', count > 0);
    if (textEl) textEl.textContent = allSelected ? 'All' : count ? `${count} selected` : 'None';
  }

  function renderCheckboxList(listEl, searchEl, items, selections, options) {
    if (!listEl) return;
    const { onChange, allSelected = false, setAllSelected = () => {} } = options || {};
    const allValues   = items.map((item) => item.value);
    const validValues = new Set(allValues);
    [...selections].forEach((value) => { if (!validValues.has(value)) selections.delete(value); });
    if (allSelected) {
      selections.clear();
      allValues.forEach((value) => selections.add(value));
    }
    const term            = (searchEl?.value || '').toLowerCase();
    const filtered        = term ? items.filter((i) => i.label.toLowerCase().includes(term)) : items;
    const filteredValues  = filtered.map((item) => item.value);
    const allVisibleSelected = filteredValues.length > 0 && filteredValues.every((value) => selections.has(value));
    listEl.innerHTML = `
      <label class="filter-dropdown__item filter-dropdown__item--select-all">
        <input type="checkbox" data-select-all="true"${allVisibleSelected ? ' checked' : ''}>
        <span class="filter-dropdown__item-label">Select all</span>
      </label>
    ` + filtered.map((item) => `
      <label class="filter-dropdown__item">
        <input type="checkbox" value="${item.value}"${selections.has(item.value) ? ' checked' : ''}>
        <span class="filter-dropdown__item-label">${item.label}</span>
      </label>`).join('');
    listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.dataset.selectAll === 'true') {
          if (cb.checked) {
            if (term) {
              filteredValues.forEach((value) => selections.add(value));
              setAllSelected(selections.size === allValues.length && allValues.length > 0);
            } else {
              selections.clear();
              allValues.forEach((value) => selections.add(value));
              setAllSelected(true);
            }
          } else {
            selections.clear();
            setAllSelected(false);
          }
        } else {
          setAllSelected(false);
          if (cb.checked) selections.add(cb.value);
          else selections.delete(cb.value);
          if (selections.size === allValues.length && allValues.length > 0) setAllSelected(true);
        }
        onChange();
      });
    });
  }

  function renderTeamOptions() {
    const listEl   = document.getElementById('sharedTeamList');
    const searchEl = document.getElementById('sharedTeamSearch');
    const items = teams
      .map((t) => ({ value: String(t?.id || t?.teamId || ''), label: t?.displayName || t?.name || t?.teamName || '' }))
      .filter((o) => o.value && o.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    renderCheckboxList(listEl, searchEl, items, teamSelections, {
      allSelected: teamAllSelected,
      setAllSelected: (value) => { teamAllSelected = value; },
      onChange: () => {
        renderTeamOptions();
        updateDropdownBadge('sharedTeamDropdown', teamSelections, items.length, teamAllSelected);
        refreshDashboard(false);
      }
    });
    updateDropdownBadge('sharedTeamDropdown', teamSelections, items.length, teamAllSelected);
  }

  function renderQueueOptions() {
    const listEl   = document.getElementById('sharedQueueList');
    const searchEl = document.getElementById('sharedQueueSearch');
    const items = queueCache
      .map((q) => ({ value: String(q?.id || ''), label: q?.name || q?.displayName || q?.customName || 'Unnamed queue' }))
      .filter((o) => o.value && o.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    renderCheckboxList(listEl, searchEl, items, queueSelections, {
      allSelected: queueAllSelected,
      setAllSelected: (value) => { queueAllSelected = value; },
      onChange: () => {
        renderQueueOptions();
        updateDropdownBadge('sharedQueueDropdown', queueSelections, items.length, queueAllSelected);
        refreshDashboard(false);
      }
    });
    updateDropdownBadge('sharedQueueDropdown', queueSelections, items.length, queueAllSelected);
  }

  function extractList(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.teams)) return payload.teams;
    if (Array.isArray(payload.users)) return payload.users;
    if (Array.isArray(payload.contactServiceQueues)) return payload.contactServiceQueues;
    return [];
  }

  function getOrgIdValue() {
    const cachedId = localStorage.getItem('authOrgId') || '';
    if (cachedId) {
      if (/^Y2lz/i.test(cachedId)) {
        try {
          const padded  = cachedId.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cachedId.length / 4) * 4, '=');
          const decoded = atob(padded);
          const parts   = decoded.split('/');
          const result  = parts[parts.length - 1] || decoded;
          localStorage.setItem('authOrgId', result);
          return result;
        } catch { return cachedId; }
      }
      const pathIdx = cachedId.toLowerCase().indexOf('organization/');
      if (pathIdx !== -1) {
        const candidate = cachedId.slice(pathIdx + 'organization/'.length);
        if (candidate) { localStorage.setItem('authOrgId', candidate); return candidate; }
      }
      return cachedId;
    }
    const raw = localStorage.getItem(cacheKeyOrg) || '';
    if (!raw) return '';
    if (/^Y2lz/i.test(raw)) {
      try {
        const padded  = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const decoded = atob(padded);
        const parts   = decoded.split('/');
        return parts[parts.length - 1] || decoded;
      } catch { return raw; }
    }
    const pathIdx = raw.toLowerCase().indexOf('organization/');
    if (pathIdx !== -1) {
      const candidate = raw.slice(pathIdx + 'organization/'.length);
      return candidate || raw;
    }
    return raw;
  }

  function getAuthState() {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId  = getOrgIdValue();
    if (!bearer || !orgId) return null;
    const orgName = localStorage.getItem(cacheKeyOrgName) || localStorage.getItem(cacheKeyOrg) || '';
    return { bearer, orgId, orgName };
  }

  async function requestList(url, auth) {
    if (!auth) return [];
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${auth.bearer}`, OrgId: auth.orgId, 'Content-Type': 'application/json' }
      });
      if (!res.ok) return [];
      return extractList(await res.json());
    } catch { return []; }
  }

  async function fetchTeams(auth) {
    if (!auth) return [];
    const list = await requestList(TEAM_ENDPOINT(auth.orgId), auth);
    teams = Array.isArray(list) ? list.filter(Boolean) : [];
    return teams;
  }

  async function fetchAgents(auth) {
    if (!auth) return [];
    const list = await requestList(USER_ENDPOINT(auth.orgId), auth);
    agents = Array.isArray(list) ? list.filter(Boolean) : [];
    return agents;
  }

  async function fetchQueueList(auth) {
    if (!auth) return [];
    const list = await requestList(QUEUE_ENDPOINT(auth.orgId), auth);
    queueCache = Array.isArray(list) ? list.filter(Boolean) : [];
    return queueCache;
  }

  function buildParkedTaskQuery(fromMs, toMs, cursor = '0') {
    return `{
  task(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    timeComparator: createdTime
    filter: { and: [
      { isActive: { equals: true } }
      { status: { equals: "parked" } }
      { channelType: { equals: telephony } }
      { direction: { equals: "inbound" } }
    ] }
    pagination: { cursor: "${cursor}" }
  ) {
    tasks {
      id status createdTime queueDuration connectedDuration terminationType
      lastQueue { id name } lastTeam { id name } owner { id name }
    }
    pageInfo { endCursor hasNextPage }
  }
}`;
  }

  function buildConnectedTaskQuery(fromMs, toMs, cursor = '0') {
    return `{
  task(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    timeComparator: createdTime
    filter: { and: [
      { status: { equals: "connected" } }
      { channelType: { equals: telephony } }
      { direction: { equals: "inbound" } }
    ] }
    pagination: { cursor: "${cursor}" }
  ) {
    tasks { id status lastQueue { id name } lastTeam { id name } }
    pageInfo { endCursor hasNextPage }
  }
}`;
  }

  function buildDailyTaskQuery(fromMs, toMs, cursor = '0') {
    return `{
  task(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    timeComparator: createdTime
    filter: { and: [
      { channelType: { equals: telephony } }
      { direction: { equals: "inbound" } }
    ] }
    pagination: { cursor: "${cursor}" }
  ) {
    tasks {
      id isActive status createdTime connectedDuration terminationType
      lastQueue { id name } lastTeam { id name } owner { id name }
    }
    pageInfo { endCursor hasNextPage }
  }
}`;
  }

  function buildSessionQuery(fromMs, toMs) {
    return `{
  agentSession(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    filter: { and: [
      { isActive: { equals: true } }
      { channelInfo: { channelType: { equals: "telephony" } } }
    ] }
  ) {
    agentSessions {
      agentId agentName teamId teamName startTime
      channelInfo { channelType currentState lastActivityTime idleCodeName connectedCount ronaCount }
    }
  }
}`;
  }

  async function fetchGraphQL(query, auth) {
    if (!auth) return null;
    try {
      const res = await fetch(`${SEARCH_ENDPOINT}?orgId=${encodeURIComponent(auth.orgId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.bearer}`, OrgId: auth.orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) { console.error('[dashboard search error]', res.status); return null; }
      const payload = await res.json();
      if (payload?.error) { console.error('[dashboard graphql error]', payload); return null; }
      return payload?.data || null;
    } catch (err) { console.error(err); return null; }
  }

  async function fetchAllTaskPages(auth, buildQuery, fromMs, toMs) {
    const allTasks    = [];
    const seenTaskIds = new Set();
    const seenCursors = new Set();
    let cursor = '0';
    for (let page = 0; page < 250; page += 1) {
      const data     = await fetchGraphQL(buildQuery(fromMs, toMs, cursor), auth);
      if (!data?.task) break;
      const taskNode = data.task;
      const tasks    = Array.isArray(taskNode?.tasks) ? taskNode.tasks : [];
      const pageInfo = taskNode?.pageInfo || {};
      tasks.forEach((task) => {
        const taskId = String(task?.id || '');
        if (taskId && seenTaskIds.has(taskId)) return;
        if (taskId) seenTaskIds.add(taskId);
        allTasks.push(task);
      });
      const nextCursor = pageInfo?.endCursor;
      if (!pageInfo?.hasNextPage || !nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return allTasks;
  }

  function fetchParkedTasks(auth, fromMs, toMs)    { return fetchAllTaskPages(auth, buildParkedTaskQuery, fromMs, toMs); }
  function fetchConnectedTasks(auth, fromMs, toMs) { return fetchAllTaskPages(auth, buildConnectedTaskQuery, fromMs, toMs); }

  async function fetchDailyTaskData(auth, fromMs, toMs) {
    return fetchAllTaskPages(auth, buildDailyTaskQuery, fromMs, toMs);
  }

  async function fetchAgentSessions(auth, fromMs, toMs) {
    const data = await fetchGraphQL(buildSessionQuery(fromMs, toMs), auth);
    return data?.agentSession?.agentSessions || [];
  }

  function toSeconds(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return value > 1000 ? value / 1000 : value;
  }

  function parseEpochish(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return 0;
      return value > 1e12 ? value : value > 1e9 ? value * 1000 : 0;
    }
    const trimmed = String(value).trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric > 1e9 ? numeric * 1000 : 0;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function getQueueWaitSeconds(task) {
    const explicit = toSeconds(Number(task?.queueDuration));
    if (explicit > 0) return explicit;
    const startedAt = parseEpochish(task?.createdTime);
    if (!startedAt) return 0;
    return Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  }

  function getConnectedDurationSeconds(task) { return toSeconds(Number(task?.connectedDuration)); }

  function isAbandonedTask(task) {
    const status = String(task?.status || '').toLowerCase();
    const terminationType = String(task?.terminationType || '').toLowerCase();
    return status === 'abandoned' || status === 'abandoned_in_queue' || status === 'abandon' || terminationType.includes('abandon');
  }

  function isHandledTask(task) {
    if (isAbandonedTask(task)) return false;
    if (getConnectedDurationSeconds(task) > 0) return true;
    if (task?.owner?.id) return true;
    const status = String(task?.status || '').toLowerCase();
    return status === 'ended' || status === 'completed' || status === 'wrapup' || status === 'wrap_up';
  }

  function pickQueueMetric(queue, paths) {
    for (const path of paths) {
      let target = queue;
      for (const segment of path.split('.')) {
        if (!target) break;
        target = target[segment];
      }
      if (Array.isArray(target)) return target.length;
      if (typeof target === 'number' && !Number.isNaN(target)) return target;
      if (typeof target === 'string' && target.trim()) {
        const parsed = Number(target);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return 0;
  }

  function normalizeQueue(queue) {
    const label = (queue?.name || queue?.displayName || queue?.customName || queue?.label || 'Unnamed queue').toString().trim();
    return {
      id:          queue?.id || '',
      name:        label,
      teamIds:     extractQueueTeamIds(queue),
      teamNames:   extractQueueTeamNames(queue),
      waiting:     pickQueueMetric(queue, QUEUE_METRIC_PATHS.waiting),
      serviceLevel:Math.min(100, Math.max(0, Math.round(pickQueueMetric(queue, QUEUE_METRIC_PATHS.serviceLevel)))),
      avgHandle:   toSeconds(pickQueueMetric(queue, QUEUE_METRIC_PATHS.avgHandle)),
      agents:      pickQueueMetric(queue, QUEUE_METRIC_PATHS.agents),
      abandoned:   pickQueueMetric(queue, QUEUE_METRIC_PATHS.abandoned),
      handled:     pickQueueMetric(queue, QUEUE_METRIC_PATHS.handled),
      connected:   pickQueueMetric(queue, QUEUE_METRIC_PATHS.connected)
    };
  }

  function extractQueueTeamIds(queue) {
    const teamIds = new Set();
    const tryAdd = (value) => {
      if (value === null || value === undefined || value === '') return;
      teamIds.add(String(value));
    };
    const tryCollection = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            tryAdd(entry.id || entry.teamId || entry.team?.id || entry.value);
          } else {
            tryAdd(entry);
          }
        });
        return;
      }
      if (typeof value === 'object') {
        tryAdd(value.id || value.teamId || value.team?.id || value.value);
      } else {
        tryAdd(value);
      }
    };
    tryCollection(queue?.teamId);
    tryCollection(queue?.teamIds);
    tryCollection(queue?.team);
    tryCollection(queue?.teams);
    tryCollection(queue?.associatedTeamId);
    tryCollection(queue?.associatedTeamIds);
    tryCollection(queue?.defaultTeamId);
    tryCollection(queue?.defaultTeamIds);
    tryCollection(queue?.agentBasedTeamId);
    tryCollection(queue?.agentBasedTeamIds);
    tryCollection(queue?.queueTeams);
    tryCollection(queue?.routingTeams);
    if (Array.isArray(queue?.callDistributionGroups)) {
      queue.callDistributionGroups.forEach((group) => {
        if (!Array.isArray(group?.agentGroups)) return;
        group.agentGroups.forEach((agentGroup) => {
          tryCollection(agentGroup?.teamId);
          tryCollection(agentGroup?.teamIds);
          tryCollection(agentGroup?.team);
        });
      });
    }
    if (Array.isArray(queue?.agents) && Array.isArray(agents)) {
      const usersByKeys = new Map();
      agents.forEach((agent) => {
        [
          agent?.id,
          agent?.userId,
          agent?.ciUserId,
          agent?.wxccUserId,
          agent?.user?.id,
          agent?.user?.ciUserId
        ].filter(Boolean).forEach((key) => usersByKeys.set(String(key), agent));
      });
      queue.agents.forEach((queueAgent) => {
        const matchedUser = [
          queueAgent?.id,
          queueAgent?.userId,
          queueAgent?.ciUserId,
          queueAgent?.wxccUserId
        ].filter(Boolean).map((key) => usersByKeys.get(String(key))).find(Boolean);
        if (!matchedUser) return;
        tryCollection(matchedUser?.teamId);
        tryCollection(matchedUser?.teamIds);
        tryCollection(matchedUser?.team);
        tryCollection(matchedUser?.teams);
      });
    }
    return [...teamIds];
  }

  function extractQueueTeamNames(queue) {
    const teamNames = new Set();
    const tryAdd = (value) => {
      if (value === null || value === undefined) return;
      const normalized = String(value).trim();
      if (!normalized) return;
      teamNames.add(normalized.toLowerCase());
    };
    const tryCollection = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            tryAdd(entry.name || entry.teamName || entry.displayName || entry.team?.name);
          } else {
            tryAdd(entry);
          }
        });
        return;
      }
      if (typeof value === 'object') {
        tryAdd(value.name || value.teamName || value.displayName || value.team?.name);
      } else {
        tryAdd(value);
      }
    };
    tryCollection(queue?.teamName);
    tryCollection(queue?.teamNames);
    tryCollection(queue?.team);
    tryCollection(queue?.teams);
    tryCollection(queue?.associatedTeamName);
    tryCollection(queue?.associatedTeamNames);
    tryCollection(queue?.defaultTeamName);
    tryCollection(queue?.defaultTeamNames);
    tryCollection(queue?.queueTeams);
    tryCollection(queue?.routingTeams);
    return [...teamNames];
  }

  function getSelectedTeamMatchers() {
    if (teamAllSelected || !teamSelections.size) return { ids: [], names: [] };
    const selectedTeams = teams.filter((team) => teamSelections.has(String(team?.id || team?.teamId || '')));
    return {
      ids: [...teamSelections],
      names: selectedTeams
        .map((team) => String(team?.displayName || team?.name || team?.teamName || '').trim().toLowerCase())
        .filter(Boolean)
    };
  }

  function queueMatchesTeams(queue, teamMatcher, activeAggregates, dailyAggregates) {
    if (!teamMatcher.ids.length && !teamMatcher.names.length) return true;
    if (queue?.teamIds?.some((id) => includesNormalized(teamMatcher.ids, id))) return true;
    if (queue?.teamNames?.some((name) => teamMatcher.names.includes(String(name).toLowerCase()))) return true;
    const queueId = queue?.id;
    const active = queueId ? activeAggregates?.[queueId] : null;
    const daily  = queueId ? dailyAggregates?.[queueId] : null;
    return Boolean(active || daily);
  }

  function aggregateQueueTasks(parkedTasks) {
    const buckets = {};
    (Array.isArray(parkedTasks) ? parkedTasks : []).forEach((task) => {
      const queueId = task?.lastQueue?.id || '';
      if (!queueId) return;
      if ((task?.status || '').toLowerCase() === 'connected') return;
      if (!buckets[queueId]) buckets[queueId] = { queueId, waiting: 0, connected: 0, queueDurationSum: 0, withinThreshold: 0, longestWait: 0 };
      const b  = buckets[queueId];
      const qd = getQueueWaitSeconds(task);
      b.waiting += 1;
      b.queueDurationSum += qd;
      if (qd > b.longestWait) b.longestWait = qd;
      if (qd <= SERVICE_LEVEL_THRESHOLD_SEC) b.withinThreshold += 1;
    });
    return buckets;
  }

  function mergeConnectedCounts(activeAggregates, connectedTasks) {
    (Array.isArray(connectedTasks) ? connectedTasks : []).forEach((task) => {
      const queueId = task?.lastQueue?.id || '';
      if (!queueId) return;
      if (!activeAggregates[queueId]) activeAggregates[queueId] = { queueId, waiting: 0, connected: 0, queueDurationSum: 0, withinThreshold: 0, longestWait: 0 };
      activeAggregates[queueId].connected += 1;
    });
    return activeAggregates;
  }

  function aggregateDailyTasks(allTasks) {
    const ACTIVE_STATUSES = new Set(['parked','connected','wrapup','wrap_up','reserved','ringing']);
    const buckets = {};
    (Array.isArray(allTasks) ? allTasks : []).forEach((task) => {
      const queueId = task?.lastQueue?.id || '';
      if (!queueId) return;
      const status = (task?.status || '').toLowerCase();
      if (task?.isActive || ACTIVE_STATUSES.has(status)) return;
      if (!buckets[queueId]) buckets[queueId] = { queueId, handled: 0, abandoned: 0 };
      const b = buckets[queueId];
      if (isAbandonedTask(task)) b.abandoned += 1;
      else if (isHandledTask(task)) b.handled += 1;
    });
    return buckets;
  }

  function renderQueueTable(normalizedQueues, activeAggregates, dailyAggregates) {
    if (!queueTableBody) return;
    const teamMatcher = getSelectedTeamMatchers();
    const filtered = normalizedQueues.filter((q) => {
      if (queueSelections.size && !queueSelections.has(q.id)) return false;
      return queueMatchesTeams(q, teamMatcher, activeAggregates, dailyAggregates);
    });
    if (!filtered.length) {
      queueTableBody.innerHTML = '<tr><td colspan="7" class="realtime-status">No queues match the current filters.</td></tr>';
      if (queueTableFoot) queueTableFoot.innerHTML = '';
      if (queueCountLabel) queueCountLabel.textContent = '0';
      return;
    }
    const rows = filtered.map((queue) => {
      const active = activeAggregates?.[queue.id] || {};
      const daily  = dailyAggregates?.[queue.id]  || {};
      const waiting     = active.waiting     ?? 0;
      const avgWait     = waiting ? active.queueDurationSum / waiting : 0;
      const longestWait = active.longestWait  ?? 0;
      const handled     = daily.handled       ?? 0;
      const abandoned   = daily.abandoned     ?? 0;
      const connected   = active.connected    ?? 0;
      return { queue, waiting, avgWait, longestWait, handled, abandoned, connected };
    });
    rows.sort((a, b) => {
      if (sortKey === 'name') return sortDir * a.queue.name.localeCompare(b.queue.name);
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir * (av - bv);
    });
    let totWaiting = 0, totHandled = 0, totAbandoned = 0, totConnected = 0;
    let totWaitSum = 0, totWaitCount = 0, totLongest = 0;
    queueTableBody.innerHTML = rows.map((r) => {
      totWaiting   += r.waiting;
      totHandled   += r.handled;
      totAbandoned += r.abandoned;
      totConnected += r.connected;
      totWaitSum   += r.avgWait * r.waiting;
      if (r.waiting) totWaitCount += r.waiting;
      if (r.longestWait > totLongest) totLongest = r.longestWait;
      const waitClass    = r.waiting > 5 ? 'val-high' : r.waiting > 0 ? 'val-mid' : '';
      const longestClass = r.longestWait > 120 ? 'val-high' : r.longestWait > 60 ? 'val-mid' : '';
      const total    = r.handled + r.abandoned;
      const abanPct  = total ? Math.round(r.abandoned / total * 100) : 0;
      const abanTag  = abanPct > 0 ? `<span class="abandon-pct">${abanPct}%</span>` : '';
      return `<tr>
        <td class="queue-name-cell">${r.queue.name}</td>
        <td class="${waitClass}">${r.waiting}</td>
        <td>${formatTime(r.avgWait)}</td>
        <td class="${longestClass}">${r.longestWait > 0 ? formatTime(r.longestWait) : '—'}</td>
        <td>${r.handled}</td>
        <td>${r.abandoned}${abanTag}</td>
        <td>${r.connected}</td>
      </tr>`;
    }).join('');
    const overallAvg = totWaitCount ? totWaitSum / totWaitCount : 0;
    if (queueTableFoot) {
      queueTableFoot.innerHTML = `<tr>
        <td>Total (${rows.length})</td>
        <td>${totWaiting}</td>
        <td>${formatTime(overallAvg)}</td>
        <td>${totLongest > 0 ? formatTime(totLongest) : '—'}</td>
        <td>${totHandled}</td>
        <td>${totAbandoned}</td>
        <td>${totConnected}</td>
      </tr>`;
    }
    if (queueCountLabel) queueCountLabel.textContent = rows.length;
  }

  function buildFilterSelections() {
    return {
      teams:  getSelectedTeamMatchers(),
      agents: [],
      queues: queueAllSelected ? [] : [...queueSelections]
    };
  }

  function matchesTeamOnTask(task, teamMatcher) {
    if (!teamMatcher.ids.length && !teamMatcher.names.length) return true;
    const lastTeamIds = [
      task?.lastTeam?.id,
      task?.teamId,
      task?.lastTeam?.teamId
    ].filter(Boolean);
    if (lastTeamIds.some((id) => includesNormalized(teamMatcher.ids, id))) return true;
    const lastTeamNames = [
      task?.lastTeam?.name,
      task?.teamName,
      task?.lastTeam?.teamName
    ].filter(Boolean).map((name) => String(name).trim().toLowerCase());
    return lastTeamNames.some((name) => teamMatcher.names.includes(name));
  }

  function matchesQueueOnTask(task, queueIds) {
    if (!queueIds.length) return true;
    const queueId = task?.lastQueue?.id;
    return queueId && includesNormalized(queueIds, queueId);
  }

  function filterTasks(tasks, selections) {
    return (tasks || []).filter((task) =>
      matchesTeamOnTask(task, selections.teams) &&
      matchesQueueOnTask(task, selections.queues)
    );
  }

  function matchesTeamOnSession(session, teamMatcher) {
    if (!teamMatcher.ids.length && !teamMatcher.names.length) return true;
    const teamId = session?.teamId;
    if (teamId && includesNormalized(teamMatcher.ids, teamId)) return true;
    const teamName = String(session?.teamName || '').trim().toLowerCase();
    return Boolean(teamName && teamMatcher.names.includes(teamName));
  }

  function filterSessions(sessions, selections) {
    return (sessions || []).filter((session) => matchesTeamOnSession(session, selections.teams));
  }

  function computeMetrics(parkedTasks, connectedTasks) {
    const sanitized = (Array.isArray(parkedTasks) ? parkedTasks : []).filter((t) => (t?.status || '').toLowerCase() !== 'connected');
    const total     = sanitized.length;
    const connected = Array.isArray(connectedTasks) ? connectedTasks.length : 0;
    const longestWait = sanitized.reduce((max, task) => Math.max(max, getQueueWaitSeconds(task)), 0);
    return { activeCalls: total, connected, longestWait };
  }

  function updateMetrics(values) {
    const { activeCalls = 0, longestWait = 0, connected = 0, handled = 0, abandoned = 0 } = values || {};
    if (metricMap.activeCalls.valueEl) metricMap.activeCalls.valueEl.textContent = activeCalls;
    if (metricMap.avgWait.valueEl)     metricMap.avgWait.valueEl.textContent     = formatTime(longestWait);
    if (metricMap.connected.valueEl)   metricMap.connected.valueEl.textContent   = connected;
    if (metricMap.handled.valueEl)     metricMap.handled.valueEl.textContent     = handled;
    if (metricMap.abandoned.valueEl)   metricMap.abandoned.valueEl.textContent   = abandoned;
  }

  function getSessionState(session) {
    const ci = session?.channelInfo;
    if (!ci) return '';
    const channels = Array.isArray(ci) ? ci : [ci];
    const ch = channels.find((c) => c?.channelType === 'telephony') || channels[0];
    return ch?.currentState || '';
  }

  function categorizeAgentState(state) {
    const normalized = (state || '').toString().toUpperCase();
    if (STATE_BUCKETS.available.includes(normalized)) return 'available';
    if (STATE_BUCKETS.onCall.includes(normalized))    return 'onCall';
    if (STATE_BUCKETS.ringing.includes(normalized))   return 'ringing';
    if (STATE_BUCKETS.wrapUp.includes(normalized))    return 'wrapUp';
    if (STATE_BUCKETS.idle.includes(normalized))      return 'idle';
    if (normalized) return 'idle';
    return 'offline';
  }

  function getSessionDurationSeconds(session) {
    const channels = Array.isArray(session?.channelInfo) ? session.channelInfo : [session?.channelInfo].filter(Boolean);
    const telCh = channels.find((c) => c?.channelType === 'telephony') || channels[0];
    const raw   = telCh?.lastActivityTime ?? session?.startTime;
    if (!raw) return 0;
    const ts = typeof raw === 'number' ? raw : Number(raw) > 0 ? Number(raw) : Date.parse(raw);
    if (!ts || Number.isNaN(ts)) return 0;
    return Math.max(0, Math.round((Date.now() - ts) / 1000));
  }

  const STATE_SORT_ORDER = { connected: 0, ringing: 1, wrapup: 2, available: 3, idle: 4, offline: 5 };

  function getStateBadgeClass(bucket) {
    return { available: 'available', onCall: 'connected', ringing: 'ringing', wrapUp: 'wrapup', idle: 'idle', offline: 'idle' }[bucket] || 'idle';
  }

  function getStateBadgeLabel(stateValue) {
    const norm = (stateValue || '').toUpperCase();
    if (STATE_BUCKETS.available.includes(norm)) return 'Available';
    if (STATE_BUCKETS.onCall.includes(norm))    return 'Connected';
    if (STATE_BUCKETS.ringing.includes(norm))   return 'Ringing';
    if (STATE_BUCKETS.wrapUp.includes(norm))    return 'Wrap-up';
    if (STATE_BUCKETS.idle.includes(norm))      return 'Idle';
    if (norm === '') return 'Unknown';
    return stateValue;
  }

  function updateAgentCounts(sessions) {
    const counts     = { available: 0, onCall: 0, wrapUp: 0, idle: 0, offline: 0 };
    const seenAgents = new Set();
    (Array.isArray(sessions) ? sessions : []).forEach((session) => {
      const bucket = categorizeAgentState(getSessionState(session));
      counts[bucket] = (counts[bucket] || 0) + 1;
      if (session?.agentId) seenAgents.add(session.agentId);
    });
    const pillMap = { available: 'agentCount-available', onCall: 'agentCount-connected', wrapUp: 'agentCount-wrapup' };
    Object.entries(pillMap).forEach(([bucket, id]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = counts[bucket];
    });
    const idleEl = document.getElementById('agentCount-idle');
    if (idleEl) idleEl.textContent = counts.idle + counts.offline;
    return seenAgents.size;
  }

  function updateAgentTables(sessions, selections) {
    const bodyEl  = document.getElementById('agentStateBody');
    const countEl = document.getElementById('agentCountLabel');
    const filtered = filterSessions(sessions, selections);
    if (!bodyEl) return;
    if (!filtered.length) {
      bodyEl.innerHTML = '<tr><td colspan="7" class="realtime-status">No agents match the current filters.</td></tr>';
      if (countEl) countEl.textContent = '0';
      return;
    }
    const prepared = filtered.map((session) => {
      const stateValue  = getSessionState(session);
      const bucket      = categorizeAgentState(stateValue);
      const badgeClass  = getStateBadgeClass(bucket);
      const badgeLabel  = getStateBadgeLabel(stateValue);
      const durationSec = getSessionDurationSeconds(session);
      const channels    = Array.isArray(session?.channelInfo) ? session.channelInfo : [session?.channelInfo].filter(Boolean);
      const telCh       = channels.find((c) => c?.channelType === 'telephony') || channels[0];
      const idleCode    = bucket === 'idle' ? (telCh?.idleCodeName || '—') : '—';
      const handled     = telCh?.connectedCount ?? '—';
      const rona        = telCh?.ronaCount ?? '—';
      return { session, bucket, badgeClass, badgeLabel, durationSec, idleCode, handled, rona };
    });
    prepared.sort((a, b) => {
      const ta = (a.session.teamName || '').toLowerCase();
      const tb = (b.session.teamName || '').toLowerCase();
      if (ta !== tb) return ta.localeCompare(tb);
      const so = (STATE_SORT_ORDER[a.badgeClass] ?? 4) - (STATE_SORT_ORDER[b.badgeClass] ?? 4);
      return so !== 0 ? so : b.durationSec - a.durationSec;
    });
    bodyEl.innerHTML = prepared.map(({ session, badgeClass, badgeLabel, durationSec, idleCode, handled, rona }) => `
      <tr>
        <td>${session.teamName || '—'}</td>
        <td>${session.agentName || '—'}</td>
        <td><span class="state-badge ${badgeClass}">${badgeLabel}</span></td>
        <td>${formatTime(durationSec)}</td>
        <td>${idleCode}</td>
        <td>${handled}</td>
        <td>${rona}</td>
      </tr>`).join('');
    if (countEl) countEl.textContent = prepared.length;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  async function refreshDashboard(forceFilters = false) {
    const auth = getAuthState();
    if (!auth) {
      updateMetrics({ activeCalls: 0, longestWait: 0, connected: 0, handled: 0, abandoned: 0 });
      if (queueTableBody) queueTableBody.innerHTML = '<tr><td colspan="7" class="realtime-status">Sign in to Webex to see live data.</td></tr>';
      const agentBody = document.getElementById('agentStateBody');
      if (agentBody) agentBody.innerHTML = '<tr><td colspan="7" class="realtime-status">Not authenticated.</td></tr>';
      return;
    }
    if (!filtersLoaded || forceFilters) {
      await Promise.all([fetchTeams(auth), fetchAgents(auth), fetchQueueList(auth)]);
      filtersLoaded = true;
      renderTeamOptions();
      renderQueueOptions();
    } else {
      await fetchQueueList(auth);
      renderQueueOptions();
    }
    const now        = Date.now();
    const todayStart = startOfToday();
    try {
      const [parkedTasks, connectedTasks, dailyTasks, sessions] = await Promise.all([
        fetchParkedTasks(auth, todayStart, now),
        fetchConnectedTasks(auth, todayStart, now),
        fetchDailyTaskData(auth, todayStart, now),
        fetchAgentSessions(auth, todayStart, now)
      ]);
      const selections       = buildFilterSelections();
      const filteredParked   = filterTasks(parkedTasks,    selections);
      const filteredConn     = filterTasks(connectedTasks, selections);
      const filteredDaily    = filterTasks(dailyTasks,     selections);
      const filteredSessions = filterSessions(sessions,    selections);
      const normalizedQueues = queueCache.map(normalizeQueue);
      let activeAggregates   = aggregateQueueTasks(filteredParked);
      activeAggregates       = mergeConnectedCounts(activeAggregates, filteredConn);
      const dailyAggregates  = aggregateDailyTasks(filteredDaily);
      const metrics          = computeMetrics(filteredParked, filteredConn);
      updateAgentCounts(filteredSessions);
      const totalHandled   = Object.values(dailyAggregates).reduce((s, b) => s + b.handled,   0);
      const totalAbandoned = Object.values(dailyAggregates).reduce((s, b) => s + b.abandoned, 0);
      updateMetrics({ ...metrics, handled: totalHandled, abandoned: totalAbandoned });
      renderQueueTable(normalizedQueues, activeAggregates, dailyAggregates);
      updateAgentTables(filteredSessions, selections);
    } catch (error) { console.error(error); }
  }

  function bindFilterEvents() {
    let activePanelState = null;

    function positionPanel(toggle, panel) {
      if (!toggle || !panel) return;
      const rect = toggle.getBoundingClientRect();
      panel.style.top  = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }
    function openPanel(wrapper, toggle, panel) {
      document.body.appendChild(panel);
      panel.style.position = 'fixed';
      panel.style.display  = 'flex';
      panel.style.zIndex   = '9999';
      positionPanel(toggle, panel);
      activePanelState = { wrapper, toggle, panel };
      panel.querySelector('input')?.focus();
    }
    function closePanel(wrapper, panel) {
      if (panel.parentElement === document.body) wrapper.appendChild(panel);
      panel.style.position = '';
      panel.style.top      = '';
      panel.style.left     = '';
      panel.style.display  = '';
      panel.style.zIndex   = '';
      if (activePanelState?.panel === panel) activePanelState = null;
    }
    function syncActivePanelPosition() {
      if (!activePanelState) return;
      positionPanel(activePanelState.toggle, activePanelState.panel);
    }

    ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((id) => {
      const wrapper = document.getElementById(id);
      if (!wrapper) return;
      const toggle = wrapper.querySelector('.filter-dropdown__toggle');
      const panel  = wrapper.querySelector('.filter-dropdown__panel');
      toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((other) => {
          if (other === id) return;
          const o = document.getElementById(other);
          if (!o) return;
          o.classList.remove('open');
          o.querySelector('.filter-dropdown__toggle')?.setAttribute('aria-expanded', 'false');
          const panelId  = other === 'sharedQueueDropdown' ? 'sharedQueuePanel' : 'sharedTeamPanel';
          const sibPanel = document.getElementById(panelId);
          if (sibPanel) closePanel(o, sibPanel);
        });
        if (isOpen && panel) openPanel(wrapper, toggle, panel);
        else if (!isOpen && panel) closePanel(wrapper, panel);
      });
    });

    document.getElementById('sharedTeamSearch')?.addEventListener('input', renderTeamOptions);
    document.getElementById('sharedQueueSearch')?.addEventListener('input', renderQueueOptions);
    window.addEventListener('resize', syncActivePanelPosition);
    window.addEventListener('scroll', syncActivePanelPosition, true);

    document.addEventListener('click', (e) => {
      ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el || !el.classList.contains('open')) return;
        const panelId = id === 'sharedQueueDropdown' ? 'sharedQueuePanel' : 'sharedTeamPanel';
        const panel   = document.getElementById(panelId);
        if (!el.contains(e.target) && !(panel && panel.contains(e.target))) {
          el.classList.remove('open');
          el.querySelector('.filter-dropdown__toggle')?.setAttribute('aria-expanded', 'false');
          if (panel) closePanel(el, panel);
        }
      });
    });

    function updateQueueSortHeaders() {
      document.querySelectorAll('#queueTable thead th[data-sort]').forEach((h) => {
        h.classList.remove('sort-asc', 'sort-desc');
        if (h.dataset.sort === sortKey) h.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
      });
    }

    document.getElementById('queueTable')?.addEventListener('click', (e) => {
      if (e.target.closest('.filter-icon-btn') || e.target.closest('.filter-dropdown__panel')) return;
      const trigger = e.target.closest('[data-sort-trigger]');
      const th = trigger?.closest('th[data-sort]') || e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
      updateQueueSortHeaders();
      refreshDashboard(false);
    });

    updateQueueSortHeaders();
  }

  function initDashboard() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    refreshDashboard(true);
    refreshTimer = setInterval(() => refreshDashboard(), REFRESH_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initDomRefs();
    bindFilterEvents();
    initDashboard();
  });
})();

