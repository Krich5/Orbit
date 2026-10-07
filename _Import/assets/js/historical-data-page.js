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
  const SNAPSHOT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

  const STATE_BUCKETS = {
    available: ['AVAILABLE'],
    onCall: ['CONNECTED', 'TALKING', 'ON_CALL', 'HOLD', 'CONSULT', 'CONFERENCE'],
    ringing: ['RESERVED', 'RINGING'],
    wrapUp: ['WRAPUP', 'WRAP_UP', 'WRAP_UP_AGENT', 'POST_CALL'],
    idle: ['IDLE', 'NOT_RESPONDING', 'NOT_RESPONDED', 'RONA']
  };

  let teams = [];
  let agents = [];
  let queueCache = [];
  let filtersLoaded = false;
  let teamSelections = new Set();
  let queueSelections = new Set();
  let teamAllSelected = true;
  let queueAllSelected = true;

  function $(id) {
    return document.getElementById(id);
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

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatDateTime(value) {
    const ts = parseEpochish(value);
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }

  function formatDateTimeLocalValue(date) {
    const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return adjusted.toISOString().slice(0, 16);
  }

  function includesNormalized(list, value) {
    if (!Array.isArray(list) || !list.length || value === null || value === undefined) return false;
    const normalizedValue = String(value);
    return list.some((entry) => String(entry) === normalizedValue);
  }

  function getOrgIdValue() {
    const cachedId = localStorage.getItem('authOrgId') || '';
    if (cachedId) {
      if (/^Y2lz/i.test(cachedId)) {
        try {
          const padded = cachedId.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(cachedId.length / 4) * 4, '=');
          const decoded = atob(padded);
          const parts = decoded.split('/');
          const result = parts[parts.length - 1] || decoded;
          localStorage.setItem('authOrgId', result);
          return result;
        } catch {
          return cachedId;
        }
      }
      const pathIdx = cachedId.toLowerCase().indexOf('organization/');
      if (pathIdx !== -1) {
        const candidate = cachedId.slice(pathIdx + 'organization/'.length);
        if (candidate) {
          localStorage.setItem('authOrgId', candidate);
          return candidate;
        }
      }
      return cachedId;
    }
    const raw = localStorage.getItem(cacheKeyOrg) || '';
    if (!raw) return '';
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
    const pathIdx = raw.toLowerCase().indexOf('organization/');
    if (pathIdx !== -1) {
      const candidate = raw.slice(pathIdx + 'organization/'.length);
      return candidate || raw;
    }
    return raw;
  }

  function getAuthState() {
    const bearer = (localStorage.getItem(cacheKeyBearer) || '').trim();
    const orgId = getOrgIdValue();
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
    } catch {
      return [];
    }
  }

  async function fetchTeams(auth) {
    teams = (await requestList(TEAM_ENDPOINT(auth.orgId), auth)).filter(Boolean);
    return teams;
  }

  async function fetchAgents(auth) {
    agents = (await requestList(USER_ENDPOINT(auth.orgId), auth)).filter(Boolean);
    return agents;
  }

  async function fetchQueueList(auth) {
    queueCache = (await requestList(QUEUE_ENDPOINT(auth.orgId), auth)).filter(Boolean);
    return queueCache;
  }

  async function ensureReferenceData(auth) {
    if (!auth || filtersLoaded) return;
    await Promise.all([fetchTeams(auth), fetchAgents(auth), fetchQueueList(auth)]);
    filtersLoaded = true;
    renderTeamOptions();
    renderQueueOptions();
  }

  function updateDropdownBadge(dropdownId, selections, totalCount = selections.size, allSelected = false) {
    const el = $(dropdownId);
    if (!el) return;
    const badge = el.querySelector('.filter-dropdown__badge');
    const toggle = el.querySelector('.filter-dropdown__toggle');
    const textEl = el.querySelector('.dashboard-filter-toggle__text');
    const count = allSelected ? totalCount : selections.size;
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }
    if (toggle) toggle.classList.toggle('has-selection', count > 0);
    if (textEl) textEl.textContent = allSelected ? 'All' : count ? `${count} selected` : 'None';
  }

  function renderCheckboxList(listEl, searchEl, items, selections, options) {
    if (!listEl) return;
    const { onChange, allSelected = false, setAllSelected = () => {} } = options || {};
    const allValues = items.map((item) => item.value);
    const validValues = new Set(allValues);
    [...selections].forEach((value) => {
      if (!validValues.has(value)) selections.delete(value);
    });
    if (allSelected) {
      selections.clear();
      allValues.forEach((value) => selections.add(value));
    }
    const term = (searchEl?.value || '').toLowerCase();
    const filtered = term ? items.filter((item) => item.label.toLowerCase().includes(term)) : items;
    const filteredValues = filtered.map((item) => item.value);
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
      </label>
    `).join('');
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
    const listEl = $('sharedTeamList');
    const searchEl = $('sharedTeamSearch');
    const items = teams
      .map((team) => ({ value: String(team?.id || team?.teamId || ''), label: team?.displayName || team?.name || team?.teamName || '' }))
      .filter((item) => item.value && item.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    renderCheckboxList(listEl, searchEl, items, teamSelections, {
      allSelected: teamAllSelected,
      setAllSelected: (value) => { teamAllSelected = value; },
      onChange: () => {
        renderTeamOptions();
        updateDropdownBadge('sharedTeamDropdown', teamSelections, items.length, teamAllSelected);
      }
    });
    updateDropdownBadge('sharedTeamDropdown', teamSelections, items.length, teamAllSelected);
  }

  function renderQueueOptions() {
    const listEl = $('sharedQueueList');
    const searchEl = $('sharedQueueSearch');
    const items = queueCache
      .map((queue) => ({ value: String(queue?.id || ''), label: queue?.name || queue?.displayName || queue?.customName || 'Unnamed queue' }))
      .filter((item) => item.value && item.label)
      .sort((a, b) => a.label.localeCompare(b.label));
    renderCheckboxList(listEl, searchEl, items, queueSelections, {
      allSelected: queueAllSelected,
      setAllSelected: (value) => { queueAllSelected = value; },
      onChange: () => {
        renderQueueOptions();
        updateDropdownBadge('sharedQueueDropdown', queueSelections, items.length, queueAllSelected);
      }
    });
    updateDropdownBadge('sharedQueueDropdown', queueSelections, items.length, queueAllSelected);
  }

  async function fetchGraphQL(query, auth) {
    if (!auth) return null;
    try {
      const res = await fetch(`${SEARCH_ENDPOINT}?orgId=${encodeURIComponent(auth.orgId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.bearer}`, OrgId: auth.orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) return null;
      const payload = await res.json();
      if (payload?.error) return null;
      return payload?.data || null;
    } catch {
      return null;
    }
  }

  function buildAgentSessionQuery(fromMs, toMs, cursor = '0') {
    return `{
  agentSession(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    pagination: { cursor: "${cursor}" }
  ) {
    agentSessions {
      agentId
      agentName
      teamId
      teamName
      startTime
      endTime
      isActive
      channelInfo {
        channelType
        currentState
        lastActivityTime
        idleCodeName
        connectedCount
        ronaCount
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
  }

  function buildTaskSnapshotQuery(fromMs, toMs, cursor = '0') {
    return `{
  taskDetails(
    from: ${Math.floor(fromMs)}
    to: ${Math.floor(toMs)}
    pagination: { cursor: "${cursor}" }
    filter: { and: [
      { channelType: { equals: telephony } }
      { direction: { equals: "inbound" } }
    ] }
  ) {
    tasks {
      id
      status
      isActive
      createdTime
      endedTime
      queueDuration
      connectedDuration
      lastQueue { id name }
      lastTeam { id name }
      lastAgent { id name }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
  }

  async function fetchAllPages(auth, buildQuery, rootKey, listKey, fromMs, toMs) {
    const allRows = [];
    const seenIds = new Set();
    const seenCursors = new Set();
    let cursor = '0';
    for (let page = 0; page < 250; page += 1) {
      const data = await fetchGraphQL(buildQuery(fromMs, toMs, cursor), auth);
      const rootNode = data?.[rootKey];
      if (!rootNode) break;
      const rows = Array.isArray(rootNode?.[listKey]) ? rootNode[listKey] : [];
      const pageInfo = rootNode?.pageInfo || {};
      rows.forEach((row) => {
        const rowId = String(row?.id || `${row?.agentId || row?.agentName || ''}-${row?.startTime || ''}`);
        if (rowId && seenIds.has(rowId)) return;
        if (rowId) seenIds.add(rowId);
        allRows.push(row);
      });
      const nextCursor = pageInfo?.endCursor;
      if (!pageInfo?.hasNextPage || !nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return allRows;
  }

  function fetchHistoricalSessions(auth, fromMs, toMs) {
    return fetchAllPages(auth, buildAgentSessionQuery, 'agentSession', 'agentSessions', fromMs, toMs);
  }

  function fetchHistoricalTasks(auth, fromMs, toMs) {
    return fetchAllPages(auth, buildTaskSnapshotQuery, 'taskDetails', 'tasks', fromMs, toMs);
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
          if (entry && typeof entry === 'object') tryAdd(entry.id || entry.teamId || entry.team?.id || entry.value);
          else tryAdd(entry);
        });
        return;
      }
      if (typeof value === 'object') tryAdd(value.id || value.teamId || value.team?.id || value.value);
      else tryAdd(value);
    };
    tryCollection(queue?.teamId);
    tryCollection(queue?.teamIds);
    tryCollection(queue?.team);
    tryCollection(queue?.teams);
    tryCollection(queue?.associatedTeamId);
    tryCollection(queue?.defaultTeamId);
    tryCollection(queue?.queueTeams);
    tryCollection(queue?.routingTeams);
    return [...teamIds];
  }

  function extractQueueTeamNames(queue) {
    const teamNames = new Set();
    const tryAdd = (value) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized) teamNames.add(normalized);
    };
    const tryCollection = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry && typeof entry === 'object') tryAdd(entry.name || entry.teamName || entry.displayName || entry.team?.name);
          else tryAdd(entry);
        });
        return;
      }
      if (typeof value === 'object') tryAdd(value.name || value.teamName || value.displayName || value.team?.name);
      else tryAdd(value);
    };
    tryCollection(queue?.teamName);
    tryCollection(queue?.teamNames);
    tryCollection(queue?.team);
    tryCollection(queue?.teams);
    tryCollection(queue?.queueTeams);
    tryCollection(queue?.routingTeams);
    return [...teamNames];
  }

  function getSelectedQueueIds() {
    if (queueAllSelected || !queueSelections.size) return [];
    return [...queueSelections];
  }

  function getSelectedTeamMatcher() {
    if (!teamAllSelected && teamSelections.size) {
      const selectedTeams = teams.filter((team) => teamSelections.has(String(team?.id || team?.teamId || '')));
      return {
        ids: [...teamSelections],
        names: selectedTeams
          .map((team) => String(team?.displayName || team?.name || team?.teamName || '').trim().toLowerCase())
          .filter(Boolean)
      };
    }

    const selectedQueueIds = getSelectedQueueIds();
    if (!selectedQueueIds.length) return { ids: [], names: [] };

    const inferredIds = new Set();
    const inferredNames = new Set();
    queueCache
      .filter((queue) => selectedQueueIds.includes(String(queue?.id || '')))
      .forEach((queue) => {
        extractQueueTeamIds(queue).forEach((id) => inferredIds.add(String(id)));
        extractQueueTeamNames(queue).forEach((name) => inferredNames.add(String(name).toLowerCase()));
      });
    return { ids: [...inferredIds], names: [...inferredNames] };
  }

  function matchesTeam(teamId, teamName, matcher) {
    if (!matcher.ids.length && !matcher.names.length) return true;
    if (teamId && includesNormalized(matcher.ids, teamId)) return true;
    const normalizedName = String(teamName || '').trim().toLowerCase();
    return Boolean(normalizedName && matcher.names.includes(normalizedName));
  }

  function matchesQueue(queueId, selectedQueueIds) {
    if (!selectedQueueIds.length) return true;
    return Boolean(queueId && includesNormalized(selectedQueueIds, queueId));
  }

  function isTaskSpanningSnapshot(task, snapshotMs) {
    const createdTime = parseEpochish(task?.createdTime);
    const endedTime = parseEpochish(task?.endedTime);
    if (!createdTime || createdTime > snapshotMs) return false;
    return !endedTime || endedTime >= snapshotMs;
  }

  function isSessionSpanningSnapshot(session, snapshotMs) {
    const startTime = parseEpochish(session?.startTime);
    const endTime = parseEpochish(session?.endTime);
    if (!startTime || startTime > snapshotMs) return false;
    return !endTime || endTime >= snapshotMs;
  }

  function classifyTaskState(task) {
    const status = String(task?.status || '').trim().toLowerCase();
    if (['parked', 'queued', 'queueing', 'reserved', 'ringing'].includes(status)) return 'waiting';
    if (['connected', 'consult', 'conference', 'talking', 'on_call'].includes(status)) return 'connected';
    return 'other';
  }

  function getTaskAgeSeconds(task, snapshotMs) {
    const createdTime = parseEpochish(task?.createdTime);
    if (!createdTime) return 0;
    return Math.max(0, Math.round((snapshotMs - createdTime) / 1000));
  }

  function getSessionState(session) {
    const channelInfo = Array.isArray(session?.channelInfo) ? session.channelInfo : [session?.channelInfo].filter(Boolean);
    const telephony = channelInfo.find((item) => item?.channelType === 'telephony') || channelInfo[0];
    return telephony?.currentState || '';
  }

  function getSessionStateDurationSeconds(session, snapshotMs) {
    const channelInfo = Array.isArray(session?.channelInfo) ? session.channelInfo : [session?.channelInfo].filter(Boolean);
    const telephony = channelInfo.find((item) => item?.channelType === 'telephony') || channelInfo[0];
    const lastActivity = parseEpochish(telephony?.lastActivityTime);
    const startTime = parseEpochish(session?.startTime);
    const anchor = lastActivity && lastActivity <= snapshotMs ? lastActivity : startTime;
    if (!anchor) return 0;
    return Math.max(0, Math.round((snapshotMs - anchor) / 1000));
  }

  function categorizeAgentState(state) {
    const normalized = String(state || '').toUpperCase();
    if (STATE_BUCKETS.available.includes(normalized)) return 'available';
    if (STATE_BUCKETS.onCall.includes(normalized)) return 'onCall';
    if (STATE_BUCKETS.ringing.includes(normalized)) return 'ringing';
    if (STATE_BUCKETS.wrapUp.includes(normalized)) return 'wrapUp';
    if (STATE_BUCKETS.idle.includes(normalized)) return 'idle';
    if (normalized) return 'idle';
    return 'offline';
  }

  function getStateBadgeClass(bucket) {
    return { available: 'available', onCall: 'connected', ringing: 'connected', wrapUp: 'wrapup', idle: 'idle', offline: 'idle' }[bucket] || 'idle';
  }

  function getStateBadgeLabel(stateValue) {
    const norm = String(stateValue || '').toUpperCase();
    if (STATE_BUCKETS.available.includes(norm)) return 'Available';
    if (STATE_BUCKETS.onCall.includes(norm)) return 'Connected';
    if (STATE_BUCKETS.ringing.includes(norm)) return 'Ringing';
    if (STATE_BUCKETS.wrapUp.includes(norm)) return 'Wrap-up';
    if (STATE_BUCKETS.idle.includes(norm)) return 'Idle';
    if (!norm) return 'Unknown';
    return stateValue;
  }

  function buildSnapshotContext(snapshotMs) {
    return {
      snapshotMs,
      selectedQueueIds: getSelectedQueueIds(),
      teamMatcher: getSelectedTeamMatcher()
    };
  }

  function filterSnapshotTasks(tasks, snapshot) {
    return (Array.isArray(tasks) ? tasks : []).filter((task) => {
      if (!isTaskSpanningSnapshot(task, snapshot.snapshotMs)) return false;
      if (!matchesQueue(task?.lastQueue?.id, snapshot.selectedQueueIds)) return false;
      return matchesTeam(task?.lastTeam?.id, task?.lastTeam?.name, snapshot.teamMatcher);
    });
  }

  function filterSnapshotSessions(sessions, snapshot) {
    return (Array.isArray(sessions) ? sessions : []).filter((session) => {
      if (!isSessionSpanningSnapshot(session, snapshot.snapshotMs)) return false;
      return matchesTeam(session?.teamId, session?.teamName, snapshot.teamMatcher);
    });
  }

  function updateStatus(text) {
    const el = $('snapshotStatus');
    if (el) el.textContent = text;
  }

  function updateFilterPills(snapshot) {
    const pills = [];
    const selectedQueues = queueCache
      .filter((queue) => snapshot.selectedQueueIds.includes(String(queue?.id || '')))
      .map((queue) => queue?.name || queue?.displayName || queue?.customName || 'Queue');
    const selectedTeams = teams
      .filter((team) => matchesTeam(team?.id || team?.teamId, team?.displayName || team?.name || team?.teamName, snapshot.teamMatcher))
      .map((team) => team?.displayName || team?.name || team?.teamName || 'Team');
    if (selectedQueues.length) pills.push(...selectedQueues.map((label) => `Queue: ${label}`));
    else pills.push('Queue: All');
    if (selectedTeams.length) pills.push(...selectedTeams.slice(0, 6).map((label) => `Team: ${label}`));
    else pills.push('Team: All');
    $('snapshotFilterPills').innerHTML = pills.map((pill) => `<span>${pill}</span>`).join('');
  }

  function updateSummary(snapshot, tasks, sessions) {
    $('snapshotWindowText').textContent = `Snapshot at ${formatDateTime(snapshot.snapshotMs)} using a ${Math.round(SNAPSHOT_LOOKBACK_MS / 3600000)} hour lookback window for active sessions and tasks.`;
    updateFilterPills(snapshot);
    const waitingCount = tasks.filter((task) => classifyTaskState(task) === 'waiting').length;
    const connectedCount = tasks.filter((task) => classifyTaskState(task) === 'connected').length;
    const availableCount = sessions.filter((session) => categorizeAgentState(getSessionState(session)) === 'available').length;
    const loggedInCount = sessions.length;
    const teamScoped = snapshot.teamMatcher.ids.length || snapshot.teamMatcher.names.length;
    $('snapshotNarrative').textContent = waitingCount > 0
      ? `${waitingCount} calls were still waiting at the selected time. ${availableCount} agents were marked available and ${connectedCount} calls were already connected. ${teamScoped ? 'Team filters were applied to keep the view scoped to the selected routing teams.' : 'No team filter was applied, so this reflects the broader contact center view.'}`
      : `No waiting calls were found at the selected time. ${loggedInCount} agent sessions and ${connectedCount} connected calls still matched the selected queue and team scope.`;
  }

  function updateMetrics(tasks, sessions) {
    const waiting = tasks.filter((task) => classifyTaskState(task) === 'waiting').length;
    const connected = tasks.filter((task) => classifyTaskState(task) === 'connected').length;
    const available = sessions.filter((session) => categorizeAgentState(getSessionState(session)) === 'available').length;
    const idle = sessions.filter((session) => {
      const bucket = categorizeAgentState(getSessionState(session));
      return bucket === 'idle' || bucket === 'offline';
    }).length;
    $('metric-waitingCalls').textContent = waiting;
    $('metric-connectedCalls').textContent = connected;
    $('metric-loggedInAgents').textContent = sessions.length;
    $('metric-availableAgents').textContent = available;
    $('metric-idleAgents').textContent = idle;
  }

  function renderQueueTable(tasks, snapshotMs) {
    const tbody = $('queueTableBody');
    const countLabel = $('queueCountLabel');
    const queueMap = new Map();
    tasks.forEach((task) => {
      const queueId = String(task?.lastQueue?.id || '');
      const queueName = task?.lastQueue?.name || 'Unknown queue';
      const teamName = task?.lastTeam?.name || 'Unknown team';
      const entry = queueMap.get(queueId) || {
        queueName,
        waiting: 0,
        connected: 0,
        active: 0,
        longestWait: 0,
        waitingWithoutAgent: 0,
        teamNames: new Set()
      };
      const state = classifyTaskState(task);
      const age = getTaskAgeSeconds(task, snapshotMs);
      entry.active += 1;
      entry.teamNames.add(teamName);
      if (state === 'waiting') {
        entry.waiting += 1;
        entry.longestWait = Math.max(entry.longestWait, age);
        if (!task?.lastAgent?.id) entry.waitingWithoutAgent += 1;
      }
      if (state === 'connected') entry.connected += 1;
      queueMap.set(queueId, entry);
    });
    const rows = [...queueMap.values()].sort((a, b) => {
      if (b.waiting !== a.waiting) return b.waiting - a.waiting;
      return a.queueName.localeCompare(b.queueName);
    });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="realtime-status">No queues had active inbound tasks at the selected time.</td></tr>';
      countLabel.textContent = '0';
      return;
    }
    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td class="queue-name-cell">${row.queueName}</td>
        <td>${row.waiting}</td>
        <td>${row.connected}</td>
        <td>${row.longestWait > 0 ? formatTime(row.longestWait) : '—'}</td>
        <td>${row.active}</td>
        <td>${row.teamNames.size}</td>
        <td>${row.waitingWithoutAgent}</td>
      </tr>
    `).join('');
    countLabel.textContent = rows.length;
  }

  function updateAgentCounts(sessions) {
    const counts = { available: 0, onCall: 0, wrapUp: 0, idle: 0, offline: 0, ringing: 0 };
    sessions.forEach((session) => {
      const bucket = categorizeAgentState(getSessionState(session));
      counts[bucket] = (counts[bucket] || 0) + 1;
    });
    $('agentCount-available').textContent = counts.available;
    $('agentCount-connected').textContent = counts.onCall + counts.ringing;
    $('agentCount-wrapup').textContent = counts.wrapUp;
    $('agentCount-idle').textContent = counts.idle + counts.offline;
    $('agentCountLabel').textContent = sessions.length;
  }

  function renderAgentTable(sessions, snapshotMs) {
    const tbody = $('agentStateBody');
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="realtime-status">No agents matched the selected snapshot filters.</td></tr>';
      return;
    }
    const prepared = sessions.map((session) => {
      const stateValue = getSessionState(session);
      const bucket = categorizeAgentState(stateValue);
      const badgeClass = getStateBadgeClass(bucket);
      const badgeLabel = getStateBadgeLabel(stateValue);
      const durationSec = getSessionStateDurationSeconds(session, snapshotMs);
      const channelInfo = Array.isArray(session?.channelInfo) ? session.channelInfo : [session?.channelInfo].filter(Boolean);
      const telephony = channelInfo.find((item) => item?.channelType === 'telephony') || channelInfo[0];
      return {
        session,
        badgeClass,
        badgeLabel,
        durationSec,
        idleCode: bucket === 'idle' ? (telephony?.idleCodeName || '—') : '—',
        handled: telephony?.connectedCount ?? '—',
        rona: telephony?.ronaCount ?? '—'
      };
    }).sort((a, b) => {
      const teamA = String(a.session?.teamName || '').toLowerCase();
      const teamB = String(b.session?.teamName || '').toLowerCase();
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return String(a.session?.agentName || '').localeCompare(String(b.session?.agentName || ''));
    });
    tbody.innerHTML = prepared.map((row) => `
      <tr>
        <td>${row.session.teamName || '—'}</td>
        <td>${row.session.agentName || '—'}</td>
        <td><span class="state-badge ${row.badgeClass}">${row.badgeLabel}</span></td>
        <td>${formatTime(row.durationSec)}</td>
        <td>${formatDateTime(row.session.startTime)}</td>
        <td>${row.idleCode}</td>
        <td>${row.handled}</td>
        <td>${row.rona}</td>
      </tr>
    `).join('');
  }

  function renderTaskTable(tasks, snapshotMs) {
    const tbody = $('taskTableBody');
    $('taskCountLabel').textContent = tasks.length;
    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="realtime-status">No active inbound calls matched the selected time, queue, and team filters.</td></tr>';
      return;
    }
    const sorted = [...tasks].sort((a, b) => getTaskAgeSeconds(b, snapshotMs) - getTaskAgeSeconds(a, snapshotMs));
    tbody.innerHTML = sorted.map((task) => {
      const state = classifyTaskState(task);
      const label = state === 'waiting' ? 'Waiting' : state === 'connected' ? 'Connected' : (task?.status || 'Other');
      return `
        <tr>
          <td>${task?.lastQueue?.name || '—'}</td>
          <td>${task?.lastTeam?.name || '—'}</td>
          <td><span class="task-status-pill ${state}">${label}</span></td>
          <td>${formatDateTime(task?.createdTime)}</td>
          <td>${formatTime(getTaskAgeSeconds(task, snapshotMs))}</td>
          <td>${task?.lastAgent?.name || '—'}</td>
        </tr>
      `;
    }).join('');
  }

  function currentSnapshotMs() {
    const inputValue = $('snapshotTimeInput')?.value;
    return inputValue ? new Date(inputValue).getTime() : Date.now();
  }

  async function runSnapshotAnalysis() {
    const auth = getAuthState();
    if (!auth) {
      updateStatus('Sign in to Webex before using Historical Data.');
      return;
    }
    await ensureReferenceData(auth);
    const snapshotMs = currentSnapshotMs();
    if (!Number.isFinite(snapshotMs) || snapshotMs <= 0) {
      updateStatus('Choose a valid snapshot time.');
      return;
    }
    const lookbackStart = Math.max(0, snapshotMs - SNAPSHOT_LOOKBACK_MS);
    updateStatus(`Reconstructing snapshot for ${formatDateTime(snapshotMs)}…`);
    $('analyzeSnapshotBtn').disabled = true;
    try {
      const [sessions, tasks] = await Promise.all([
        fetchHistoricalSessions(auth, lookbackStart, snapshotMs),
        fetchHistoricalTasks(auth, lookbackStart, snapshotMs)
      ]);
      const snapshot = buildSnapshotContext(snapshotMs);
      const filteredSessions = filterSnapshotSessions(sessions, snapshot);
      const filteredTasks = filterSnapshotTasks(tasks, snapshot);
      updateMetrics(filteredTasks, filteredSessions);
      updateSummary(snapshot, filteredTasks, filteredSessions);
      renderQueueTable(filteredTasks, snapshotMs);
      updateAgentCounts(filteredSessions);
      renderAgentTable(filteredSessions, snapshotMs);
      renderTaskTable(filteredTasks, snapshotMs);
      updateStatus(`Snapshot loaded for ${formatDateTime(snapshotMs)}. ${filteredTasks.length} calls and ${filteredSessions.length} agent sessions matched the current scope.`);
    } catch (error) {
      console.error(error);
      updateStatus('Historical snapshot failed to load. Check the browser console for query details.');
    } finally {
      $('analyzeSnapshotBtn').disabled = false;
    }
  }

  function bindFilterEvents() {
    let activePanelState = null;

    function positionPanel(toggle, panel) {
      if (!toggle || !panel) return;
      const rect = toggle.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 8}px`;
      panel.style.left = `${rect.left}px`;
    }

    function openPanel(wrapper, toggle, panel) {
      document.body.appendChild(panel);
      panel.style.position = 'fixed';
      panel.style.display = 'flex';
      panel.style.zIndex = '9999';
      positionPanel(toggle, panel);
      activePanelState = { wrapper, toggle, panel };
      panel.querySelector('input')?.focus();
    }

    function closePanel(wrapper, panel) {
      if (panel.parentElement === document.body) wrapper.appendChild(panel);
      panel.style.position = '';
      panel.style.top = '';
      panel.style.left = '';
      panel.style.display = '';
      panel.style.zIndex = '';
      if (activePanelState?.panel === panel) activePanelState = null;
    }

    function syncActivePanelPosition() {
      if (!activePanelState) return;
      positionPanel(activePanelState.toggle, activePanelState.panel);
    }

    ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((id) => {
      const wrapper = $(id);
      if (!wrapper) return;
      const toggle = wrapper.querySelector('.filter-dropdown__toggle');
      const panel = wrapper.querySelector('.filter-dropdown__panel');
      toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = wrapper.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((other) => {
          if (other === id) return;
          const otherWrapper = $(other);
          if (!otherWrapper) return;
          otherWrapper.classList.remove('open');
          otherWrapper.querySelector('.filter-dropdown__toggle')?.setAttribute('aria-expanded', 'false');
          const panelId = other === 'sharedQueueDropdown' ? 'sharedQueuePanel' : 'sharedTeamPanel';
          const otherPanel = $(panelId);
          if (otherPanel) closePanel(otherWrapper, otherPanel);
        });
        if (isOpen && panel) openPanel(wrapper, toggle, panel);
        else if (!isOpen && panel) closePanel(wrapper, panel);
      });
    });

    $('sharedTeamSearch')?.addEventListener('input', renderTeamOptions);
    $('sharedQueueSearch')?.addEventListener('input', renderQueueOptions);
    window.addEventListener('resize', syncActivePanelPosition);
    window.addEventListener('scroll', syncActivePanelPosition, true);

    document.addEventListener('click', (event) => {
      ['sharedTeamDropdown', 'sharedQueueDropdown'].forEach((id) => {
        const wrapper = $(id);
        if (!wrapper || !wrapper.classList.contains('open')) return;
        const panelId = id === 'sharedQueueDropdown' ? 'sharedQueuePanel' : 'sharedTeamPanel';
        const panel = $(panelId);
        if (!wrapper.contains(event.target) && !(panel && panel.contains(event.target))) {
          wrapper.classList.remove('open');
          wrapper.querySelector('.filter-dropdown__toggle')?.setAttribute('aria-expanded', 'false');
          if (panel) closePanel(wrapper, panel);
        }
      });
    });
  }

  function initDefaults() {
    const rounded = new Date(Math.floor(Date.now() / 300000) * 300000);
    $('snapshotTimeInput').value = formatDateTimeLocalValue(rounded);
    $('snapshotNowBtn')?.addEventListener('click', () => {
      const now = new Date(Math.floor(Date.now() / 300000) * 300000);
      $('snapshotTimeInput').value = formatDateTimeLocalValue(now);
    });
    $('analyzeSnapshotBtn')?.addEventListener('click', runSnapshotAnalysis);
  }

  async function initPage() {
    bindFilterEvents();
    initDefaults();
    const auth = getAuthState();
    if (!auth) {
      updateStatus('Sign in to Webex before using Historical Data.');
      return;
    }
    await ensureReferenceData(auth);
    updateStatus('Reference data loaded. Choose a time and run Analyze Snapshot.');
  }

  document.addEventListener('DOMContentLoaded', initPage);
})();
