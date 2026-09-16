/* Bulk Import — bulk multi-row import for WxCC Teams / Queues / Entry Points /
   Desktop Profiles / Users. Reuses the exact create-call shapes from the Setup
   Wizard (pages/wxcc/S1..S5), just looped over N grid rows instead of one
   item at a time, with per-row failures never blocking the rest of the run. */
(function () {
  'use strict';
  const WC = window.WxccWizardCommon;

  /* ── Confirm modal (replaces native confirm() everywhere on this page) ── */
  function showConfirmModal({ title, body, okLabel = 'OK' }) {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('cgConfirmModal');
      document.getElementById('cgConfirmTitle').textContent = title;
      document.getElementById('cgConfirmBody').textContent = body;
      const okBtn = document.getElementById('cgConfirmOk');
      const cancelBtn = document.getElementById('cgConfirmCancel');
      okBtn.textContent = okLabel;
      function close(result) {
        backdrop.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onBackdrop);
        resolve(result);
      }
      function onOk() { close(true); }
      function onCancel() { close(false); }
      function onBackdrop(e) { if (e.target === backdrop) close(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onBackdrop);
      backdrop.classList.add('open');
    });
  }

  /* ── Run progress modal (live status + Cancel, replaces the per-row
     Status column while a "Run X" tab is in progress) ── */
  function runProgressModal(title, labels) {
    const overlay = document.getElementById('cgRunModal');
    const listEl = document.getElementById('cgRunModalList');
    const countEl = document.getElementById('cgRunModalCount');
    const cancelBtn = document.getElementById('cgRunModalCancel');
    const closeBtn = document.getElementById('cgRunModalClose');
    document.getElementById('cgRunModalTitle').textContent = title;
    let cancelled = false;
    let processed = 0;
    listEl.innerHTML = labels.map((label, i) => `
      <div class="cg-run-item" id="cgRunItem${i}">
        <span class="cg-status-icon" id="cgRunIcon${i}">○</span>
        <span>${WC.escHtml(label)}</span>
      </div>
    `).join('');
    countEl.textContent = `0 / ${labels.length} processed`;
    cancelBtn.disabled = false;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.classList.remove('hidden');
    closeBtn.classList.add('hidden');
    function onCancelClick() {
      cancelled = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling…';
    }
    cancelBtn.addEventListener('click', onCancelClick);
    overlay.classList.add('open');
    return {
      isCancelled: () => cancelled,
      update(pos, status, detail) {
        const icons = { active: '⟳', done: '✓', error: '✗' };
        const cls = { active: 'cg-status-active', done: 'cg-status-done', error: 'cg-status-error' };
        const icon = document.getElementById(`cgRunIcon${pos}`);
        if (icon) {
          icon.textContent = icons[status] || '○';
          icon.className = `cg-status-icon ${cls[status] || ''}`;
          if (detail) icon.title = detail;
        }
        const item = document.getElementById(`cgRunItem${pos}`);
        if (item) item.className = `cg-run-item ${status === 'done' ? 'cg-run-done' : status === 'error' ? 'cg-run-error' : ''}`;
        if (status === 'done' || status === 'error') {
          processed++;
          countEl.textContent = `${processed} / ${labels.length} processed`;
        }
      },
      finish() {
        cancelBtn.removeEventListener('click', onCancelClick);
        cancelBtn.classList.add('hidden');
        closeBtn.classList.remove('hidden');
        closeBtn.addEventListener('click', () => overlay.classList.remove('open'), { once: true });
      }
    };
  }

  /* ── Org data (fetched once) + this-session created-item maps ─────
     Every cross-tab reference (Team/Queue/Entry Point/Dial Plan names)
     resolves against whichever of these has a match, so a row can point
     at something already in the org OR something an earlier tab in this
     same run just created. */
  const org = {
    sites: [], desktopLayouts: [], multimediaProfiles: [], teams: [], queues: [],
    musicFiles: [], entryPoints: [], dialPlans: [], auxCodes: [], skills: [], locations: [], holidayLists: [],
    businessHoursList: [], flows: []
  };
  const created = { teams: new Map(), queues: new Map(), entryPoints: new Map(), profiles: new Map(), businessHours: new Map(), flows: new Map() };
  let locationRegionMap = {};

  function byNameLower(list, name) {
    const needle = (name || '').trim().toLowerCase();
    if (!needle) return null;
    return list.find((item) => (item.name || '').trim().toLowerCase() === needle) || null;
  }

  function resolveEntity(createdMap, orgList, name) {
    const needle = (name || '').trim().toLowerCase();
    if (!needle) return null;
    if (createdMap.has(needle)) return createdMap.get(needle);
    const match = byNameLower(orgList, name);
    return match ? { id: match.id, name: match.name, raw: match } : null;
  }

  function resolveList(createdMap, orgList, commaList) {
    const names = (commaList || '').split(',').map((n) => n.trim()).filter(Boolean);
    const ids = [];
    const missing = [];
    names.forEach((n) => {
      const found = resolveEntity(createdMap, orgList, n);
      if (found) ids.push(found.id); else missing.push(n);
    });
    return { ids, missing };
  }

  function pickMultimediaProfile() {
    const pick = org.multimediaProfiles.find((p) => /telephony/i.test(p.name || '')) || org.multimediaProfiles[0];
    return pick || null;
  }

  /* ── Load all org reference data used for cross-tab resolution ───── */
  async function loadOrgData() {
    const [sites, desktopLayouts, multimediaProfiles, teams, queues, musicFiles, entryPoints, dialPlans, auxCodes, skills, holidayLists, businessHoursList] = await Promise.all([
      WC.fetchList(`${WC.BASE_URL}/v2/site`),
      WC.fetchList(`${WC.BASE_URL}/v2/desktop-layout`),
      WC.fetchList(`${WC.BASE_URL}/v2/multimedia-profile`),
      WC.fetchList(`${WC.BASE_URL}/v2/team?page=0&pageSize=200`),
      WC.fetchList(`${WC.BASE_URL}/v3/contact-service-queue?page=0&pageSize=200`),
      WC.fetchList(`${WC.BASE_URL}/v2/audio-file`),
      WC.fetchList(`${WC.BASE_URL}/v2/entry-point`),
      WC.fetchList(`${WC.BASE_URL}/v2/dial-plan`),
      WC.fetchList(`${WC.BASE_URL}/v2/auxiliary-code`),
      WC.fetchList(`${WC.BASE_URL}/skill`),
      WC.fetchList(`${WC.BASE_URL}/v2/holiday-list?page=0&pageSize=100`),
      WC.fetchList(`${WC.BASE_URL}/v2/business-hours?page=0&pageSize=200`)
    ]);
    org.sites = sites; org.desktopLayouts = desktopLayouts; org.multimediaProfiles = multimediaProfiles;
    org.teams = teams; org.queues = queues; org.musicFiles = musicFiles; org.entryPoints = entryPoints;
    org.dialPlans = dialPlans; org.auxCodes = auxCodes; org.skills = skills; org.holidayLists = holidayLists;
    org.businessHoursList = businessHoursList;

    // Entry Points' "Flow" column needs the tenant's real, already-published
    // flows — not just ones created earlier in this same Bulk Import run —
    // so someone wiring an entry point to an existing flow can find it here.
    try {
      const flows = await fetchFlowList();
      org.flows = flows.map((f) => ({ id: f.id, name: f.name || f.id }));
    } catch { /* leave org.flows as-is (session-created flows still work) */ }

    try {
      const params = new URLSearchParams({ max: '1000' });
      const rawOrgId = (localStorage.getItem('authOrgId') || localStorage.getItem('authOrg') || '').trim();
      if (rawOrgId) params.set('orgId', rawOrgId);
      const r = await fetch(`${WC.WEBEX_BASE}/v1/telephony/config/locations?${params}`, { headers: WC.fetchHeaders });
      const body = r.ok ? await r.json() : {};
      org.locations = body?.locations || [];
    } catch { org.locations = []; }

    try {
      const r = await fetch(`${WC.BASE_URL}/dial-number`, { headers: WC.fetchHeaders });
      const body = r.ok ? await r.json() : {};
      const entries = Array.isArray(body) ? body : (body?.data ?? []);
      entries.forEach((e) => { if (e.location && e.regionId) locationRegionMap[e.location] = e.regionId; });
    } catch { /* fine — dial-number mapping falls back to FALLBACK_REGION_ID */ }
  }

  function opts(list) { return list.map((i) => ({ value: i.id, label: i.name || i.id })); }

  /* Outdial Queue must only offer queues actually usable for outbound
     dialing (Control Hub's "Contact direction: Outbound queue"), not every
     queue in the org. queueType is the field the standalone Queues tool
     already filters "Direction" by against this same v3 endpoint. Falls
     back to the full list if nothing matches so a naming mismatch never
     leaves the picker silently empty. */
  function outdialQueues() {
    const outbound = org.queues.filter((q) => /outbound|outdial/i.test(q.queueType || '') && /telephony/i.test(q.channelType || ''));
    return outbound.length ? outbound : org.queues;
  }

  const TIMEZONE_OPTIONS = [
    { value: 'America/New_York', label: 'Eastern (America/New_York)' },
    { value: 'America/Chicago', label: 'Central (America/Chicago)' },
    { value: 'America/Denver', label: 'Mountain (America/Denver)' },
    { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
    { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' }
  ];
  const BH_PRESETS = {
    '247': [{ name: 'All Hours', days: ['MON','TUE','WED','THU','FRI','SAT','SUN'], startTime: '00:00', endTime: '23:59' }],
    mf85: [{ name: 'Business Hours', days: ['MON','TUE','WED','THU','FRI'], startTime: '08:00', endTime: '16:59' }],
    mf95: [{ name: 'Business Hours', days: ['MON','TUE','WED','THU','FRI'], startTime: '09:00', endTime: '16:59' }]
  };

  /* ════════════════════════════════════════════════════════════════
     TEAMS
  ════════════════════════════════════════════════════════════════ */
  const teamsSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetTeams'),
    draftKey: 'cgDraftV1_teams',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'site', label: 'Site', type: 'select', options: () => opts(org.sites) },
      { key: 'desktopLayout', label: 'Desktop Layout', type: 'select', options: () => opts(org.desktopLayouts) },
      { key: 'description', label: 'Description', type: 'text' }
    ]
  });

  async function runTeamRow(row) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    if (!row.site) throw new Error('Site is required');
    if (!row.desktopLayout) throw new Error('Desktop layout is required');
    const mmp = pickMultimediaProfile();
    const payload = {
      name, teamType: 'AGENT', teamStatus: 'IN_SERVICE', active: true,
      siteId: row.site, multiMediaProfileId: mmp?.id || '', desktopLayoutId: row.desktopLayout,
      description: row.description || ''
    };
    const body = await WC.apiPost('/team', payload);
    const created_ = { id: body?.id || '', name: body?.name || name };
    created.teams.set(name.toLowerCase(), created_);
    org.teams.push({ id: created_.id, name: created_.name });
    refreshTeamNamesDatalist();
    return created_.name;
  }

  /* Keeps the "Team" text fields (Queues/Desktop Profiles/Users) showing a
     browsable/searchable list of real team names — without turning the field
     into a <select>, which would break pasting many rows of names at once. */
  function refreshTeamNamesDatalist() {
    let list = document.getElementById('teamNamesList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'teamNamesList';
      document.body.appendChild(list);
    }
    const names = Array.from(new Set(org.teams.map((t) => t.name).filter(Boolean))).sort();
    list.innerHTML = names.map((n) => `<option value="${WC.escHtml(n)}"></option>`).join('');
  }

  /* ════════════════════════════════════════════════════════════════
     SKILLS (skill definitions, referenced by Queues' "assign to queue" mode)
  ════════════════════════════════════════════════════════════════ */
  const SKILL_TYPE_WORD = { '0': 'PROFICIENCY', '1': 'BOOLEAN', '2': 'TEXT', '3': 'ENUM' };
  const skillsSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetSkills'),
    draftKey: 'cgDraftV1_skills',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'skillType', label: 'Skill Type', type: 'select', default: '0', options: () => ([
        { value: '0', label: 'Proficiency' },
        { value: '1', label: 'Boolean' },
        { value: '2', label: 'Text' },
        { value: '3', label: 'Enum' }
      ]) },
      { key: 'slt', label: 'Service Level Threshold', type: 'number', default: '30' },
      { key: 'description', label: 'Description', type: 'text' }
    ]
  });

  async function runSkillRow(row) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    const skillType = row.skillType || '0';
    const payload = {
      name, description: row.description || '',
      serviceLevelThreshold: Number(row.slt || 30),
      skillType, active: true
    };
    const body = await WC.apiPost('/skill', payload);
    const created_ = { id: body?.id || body?.dbId || '', name: body?.name || name, skillType: SKILL_TYPE_WORD[skillType] || skillType };
    org.skills.push({ id: created_.id, name: created_.name, skillType: created_.skillType });
    queuesSheet.render();
    return created_.name;
  }

  /* ════════════════════════════════════════════════════════════════
     QUEUES
  ════════════════════════════════════════════════════════════════ */
  /* Queue Type is chosen once for the whole tab via the card selector above
     the grid (mirrors the Setup Wizard's Step 2) instead of per row — every
     queue created in one run shares it, so Team vs. the Skill fields just
     show or hide as whole columns based on the current selection. */
  let queueTypeMode = WC.loadDraft('cgQueueTypeModeV1', 'TEAM_BASED') || 'TEAM_BASED';

  const queuesSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetQueues'),
    draftKey: 'cgDraftV1_queues',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'team', label: 'Team', type: 'text', datalist: 'teamNamesList', visible: () => queueTypeMode === 'TEAM_BASED' || queueTypeMode === 'SKILL_BASED_FLOW' },
      { key: 'skillName', label: 'Skill Name', type: 'select', options: () => opts(org.skills), visible: () => queueTypeMode === 'SKILL_BASED_QUEUE' },
      { key: 'skillRouting', label: 'Skill Routing', type: 'select', default: 'LONGEST_AVAILABLE_AGENT', options: () => ([
        { value: 'LONGEST_AVAILABLE_AGENT', label: 'Longest Available' },
        { value: 'BEST_AVAILABLE_AGENT', label: 'Best Available' }
      ]), visible: () => queueTypeMode === 'SKILL_BASED_FLOW' || queueTypeMode === 'SKILL_BASED_QUEUE' },
      { key: 'skillCondition', label: 'Skill Condition', type: 'select', options: () => ([
        { value: 'IS', label: 'Is' }, { value: 'IS_NOT', label: 'Is Not' }, { value: 'GTE', label: '>=' }, { value: 'LTE', label: '<=' }
      ]), visible: () => queueTypeMode === 'SKILL_BASED_QUEUE' },
      { key: 'skillValue', label: 'Skill Value', type: 'text', visible: () => queueTypeMode === 'SKILL_BASED_QUEUE' }
    ]
  });

  function setQueueTypeMode(mode) {
    queueTypeMode = mode;
    WC.saveDraft('cgQueueTypeModeV1', mode);
    document.querySelectorAll('#cgQueueTypeGrid .queue-type-card').forEach((card) => {
      const active = card.getAttribute('data-queue-type') === mode;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', String(active));
    });
    queuesSheet.render();
  }

  /* Service Level Threshold / Max Time / Music On Hold / Monitoring /
     Recording / Record All Calls are almost always identical across every
     queue in a delivery — a shared "Configure Queue Settings" panel (set
     once, applies to every row) means there's no per-row cell to
     accidentally leave blank across 40 rows. */
  function getQueueSettings() {
    return {
      slt: document.getElementById('cgQueueSlt').value,
      maxTime: document.getElementById('cgQueueMaxTime').value,
      musicOnHold: document.getElementById('cgQueueMusicOnHold').value,
      monitoring: document.getElementById('cgQueueMonitoring').checked,
      recording: document.getElementById('cgQueueRecording').checked,
      recordAll: document.getElementById('cgQueueRecordAll').checked
    };
  }

  function validateQueueSettings() {
    const settings = getQueueSettings();
    if (!settings.slt || Number.isNaN(Number(settings.slt))) return 'Set "Service Level Threshold" in Configure Queue Settings before running.';
    if (!settings.maxTime || Number.isNaN(Number(settings.maxTime))) return 'Set "Max Time In Queue" in Configure Queue Settings before running.';
    if (!settings.musicOnHold) return 'Set "Music On Hold" in Configure Queue Settings before running.';
    return null;
  }

  function persistQueueSettings() {
    WC.saveDraft('cgQueueSettingsV1', getQueueSettings());
  }

  function restoreQueueSettings() {
    const saved = WC.loadDraft('cgQueueSettingsV1', null);
    if (!saved) return;
    if (saved.slt) document.getElementById('cgQueueSlt').value = saved.slt;
    if (saved.maxTime) document.getElementById('cgQueueMaxTime').value = saved.maxTime;
    if (saved.musicOnHold) document.getElementById('cgQueueMusicOnHold').value = saved.musicOnHold;
    document.getElementById('cgQueueMonitoring').checked = !!saved.monitoring;
    document.getElementById('cgQueueRecording').checked = !!saved.recording;
    document.getElementById('cgQueueRecordAll').checked = !!saved.recordAll;
  }

  async function runQueueRow(row) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    const isSkillQueue = queueTypeMode === 'SKILL_BASED_QUEUE';
    const isSkillFlow = queueTypeMode === 'SKILL_BASED_FLOW';
    const settings = getQueueSettings();
    const slt = Number(settings.slt);
    const maxTime = Number(settings.maxTime);

    let teamId = '';
    let skillRequirement = null;
    if (isSkillQueue) {
      const skill = org.skills.find((s) => s.id === row.skillName);
      if (!skill) throw new Error('Select a skill for this skill-based (assign to queue) queue — add it on the Skills tab first if it does not exist yet');
      if (!row.skillCondition) throw new Error('Skill condition is required');
      if (!row.skillValue) throw new Error('Skill value is required');
      skillRequirement = { skillId: skill.id, skillName: skill.name, skillType: skill.skillType, condition: row.skillCondition, skillValue: row.skillValue };
    } else {
      // Team-based and skill-based-flow queues both attach to a team the same
      // way — the flow variant only differs by routingType below (matching
      // the wizard: it never actually wires the flow's skill criteria via
      // the API, so there's nothing else to configure here for that mode).
      if (!row.team) throw new Error('Team is required for this queue type');
      const team = resolveEntity(created.teams, org.teams, row.team);
      if (!team) throw new Error(`Team "${row.team}" not found — add it to the Teams tab or check your org's existing teams`);
      teamId = team.id;
    }

    const payload = {
      name, description: row.description || '', active: true,
      monitoringPermitted: !!settings.monitoring, parkingPermitted: true,
      recordingPermitted: !!settings.recording, recordingAllCallsPermitted: !!settings.recordAll,
      pauseRecordingPermitted: false, recordingPauseDuration: 0,
      queueType: 'INBOUND', channelType: 'TELEPHONY',
      serviceLevelThreshold: slt, maxActiveContacts: 0, maxTimeInQueue: maxTime,
      defaultMusicInQueueMediaFileId: settings.musicOnHold,
      routingType: (isSkillQueue || isSkillFlow) ? 'SKILLS_BASED' : 'LONGEST_AVAILABLE_AGENT',
      queueRoutingType: isSkillQueue ? 'SKILL_BASED' : 'TEAM_BASED'
    };
    if (isSkillQueue || isSkillFlow) payload.skillBasedRoutingType = row.skillRouting || 'LONGEST_AVAILABLE_AGENT';
    if (!isSkillQueue) payload.callDistributionGroups = [{ agentGroups: [{ teamId }], order: 1, duration: 0 }];
    if (isSkillQueue) payload.queueSkillRequirements = [skillRequirement];

    const body = await WC.apiPost('/v2/contact-service-queue', payload);
    const created_ = { id: body?.id || '', name: body?.name || name, musicOnHold: settings.musicOnHold, slt };
    created.queues.set(name.toLowerCase(), created_);
    org.queues.push({ id: created_.id, name: created_.name });
    return created_.name;
  }

  /* ════════════════════════════════════════════════════════════════
     BUSINESS HOURS (+ optional override schedule)
  ════════════════════════════════════════════════════════════════ */
  async function createBusinessHours(payload) {
    for (const path of ['/v2/business-hours', '/business-hours']) {
      try { return await WC.apiPost(path, payload); }
      catch (err) { if (err.message.includes('405') || err.message.toLowerCase().includes('not allowed')) continue; throw err; }
    }
    throw new Error('Business hours creation not supported by this API (HTTP 405 on all endpoints)');
  }

  function decodeWebexId(raw) {
    if (!raw) return '';
    if (/^[0-9a-fA-F-]{30,}$/.test(raw)) return raw;
    if (/^Y2lz/i.test(raw)) {
      try {
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
        const decoded = atob(padded);
        const parts = decoded.split('/');
        return parts[parts.length - 1] || decoded;
      } catch { return raw; }
    }
    return raw;
  }
  const FALLBACK_REGION_ID = '2833f991-c688-43af-b556-490285909385';

  const businessHoursSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetBusinessHours'),
    draftKey: 'cgDraftV1_businesshours',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'timezone', label: 'Timezone', type: 'select', default: 'America/New_York', options: () => TIMEZONE_OPTIONS },
      { key: 'hours', label: 'Hours…', type: 'button', count: (row) => (row.__shifts && row.__shifts.length ? row.__shifts : BH_PRESETS.mf85).length },
      { key: 'holiday', label: 'Holiday List', type: 'select', options: () => opts(org.holidayLists) },
      { key: 'createOverride', label: 'Create Override', type: 'checkbox' }
    ],
    onCellButton(row, key, after) {
      if (key === 'hours') openBhShiftsModal(row, after);
    }
  });

  const BH_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const BH_DAY_LABELS = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };

  function bhShiftRowHtml(shift) {
    const name = shift?.name || 'Business Hours';
    const days = shift?.days || [];
    const startTime = shift?.startTime || '08:00';
    const endTime = shift?.endTime || '16:59';
    return `<div class="bh-shift-row">
      <input type="text" class="bh-shift-name" placeholder="Shift name" value="${WC.escHtml(name)}" autocomplete="off">
      <div class="bh-day-pills">
        ${BH_DAYS.map((d) => `<button type="button" class="bh-day-pill${days.includes(d) ? ' active' : ''}" data-day="${d}">${BH_DAY_LABELS[d]}</button>`).join('')}
      </div>
      <input type="time" class="bh-shift-time bh-shift-start" value="${WC.escHtml(startTime)}">
      <span class="bh-time-sep">to</span>
      <input type="time" class="bh-shift-time bh-shift-end" value="${WC.escHtml(endTime)}">
      <button type="button" class="btn-icon clone" title="Duplicate shift">+</button>
      <button type="button" class="btn-icon remove" title="Remove shift">×</button>
    </div>`;
  }

  function openBhShiftsModal(row, after) {
    const modal = document.getElementById('cgBhShiftsModal');
    const wrap = document.getElementById('cgBhShiftRows');
    document.querySelectorAll('#cgBhShiftsModal .bh-preset-btn').forEach((b) => b.classList.remove('selected'));
    function wireRow(rowEl) {
      rowEl.querySelectorAll('.bh-day-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
          document.querySelectorAll('#cgBhShiftsModal .bh-preset-btn').forEach((b) => b.classList.remove('selected'));
        });
      });
      rowEl.querySelector('.clone').addEventListener('click', () => {
        rowEl.insertAdjacentHTML('afterend', bhShiftRowHtml({
          name: rowEl.querySelector('.bh-shift-name').value,
          days: Array.from(rowEl.querySelectorAll('.bh-day-pill.active')).map((b) => b.getAttribute('data-day')),
          startTime: rowEl.querySelector('.bh-shift-start').value,
          endTime: rowEl.querySelector('.bh-shift-end').value
        }));
        wireRow(rowEl.nextElementSibling);
      });
      rowEl.querySelector('.remove').addEventListener('click', () => rowEl.remove());
    }
    function renderShifts(shifts) {
      wrap.innerHTML = shifts.map(bhShiftRowHtml).join('');
      wrap.querySelectorAll('.bh-shift-row').forEach(wireRow);
    }
    renderShifts(row.__shifts && row.__shifts.length ? row.__shifts : BH_PRESETS.mf85);
    document.getElementById('cgAddBhShiftRow').onclick = () => {
      wrap.insertAdjacentHTML('beforeend', bhShiftRowHtml(null));
      wireRow(wrap.lastElementChild);
    };
    document.querySelectorAll('#cgBhShiftsModal .bh-preset-btn').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('#cgBhShiftsModal .bh-preset-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        renderShifts(BH_PRESETS[btn.getAttribute('data-bh-preset')]);
      };
    });
    modal.classList.add('open');
    modal._save = () => {
      const shifts = Array.from(wrap.querySelectorAll('.bh-shift-row')).map((rowEl) => ({
        name: rowEl.querySelector('.bh-shift-name').value.trim() || 'Business Hours',
        days: Array.from(rowEl.querySelectorAll('.bh-day-pill.active')).map((b) => b.getAttribute('data-day')),
        startTime: rowEl.querySelector('.bh-shift-start').value || '08:00',
        endTime: rowEl.querySelector('.bh-shift-end').value || '16:59'
      })).filter((s) => s.days.length);
      row.__shifts = shifts.length ? shifts : BH_PRESETS.mf85;
      modal.classList.remove('open');
      after();
    };
  }

  /* A default 1-day placeholder window for auto-created overrides — the
     override entry itself is named "Placeholder" (matching the wizard's
     own convention) since it's meant to be edited with real exception
     dates later in Control Hub, not a real closure window set here. */
  function defaultOverrideWindow() {
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: fmt(start), end: fmt(end) };
  }

  async function runBusinessHoursRow(row) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    const timezone = row.timezone || 'America/New_York';
    const shifts = row.__shifts && row.__shifts.length ? row.__shifts : BH_PRESETS.mf85;

    let overridesId = '';
    if (row.createOverride) {
      const { start, end } = defaultOverrideWindow();
      const ovResult = await WC.apiPost('/overrides', {
        name: `${name} Override`, description: row.description || '', timezone,
        overrides: [{ name: 'Placeholder', startDateTime: start, endDateTime: end, workingHours: false }]
      });
      overridesId = ovResult?.id || '';
    }

    const bhPayload = { name, description: row.description || '', timezone, workingHours: shifts };
    if (row.holiday) bhPayload.holidaysId = row.holiday;
    if (overridesId) bhPayload.overridesId = overridesId;
    const bhResult = await createBusinessHours(bhPayload);
    const created_ = { id: bhResult?.id || '', name: bhResult?.name || name };
    created.businessHours.set(name.toLowerCase(), created_);
    org.businessHoursList.push({ id: created_.id, name: created_.name });
    return created_.name;
  }

  /* ════════════════════════════════════════════════════════════════
     FLOWS — clone a bundled static template OR an existing tenant flow
     (picked from the real flow list), re-pointing business hours / queue /
     TTS / menu routing by stable activityId rather than literal text, so
     the same code path works for either source.
  ════════════════════════════════════════════════════════════════ */
  // Same override the standalone Flows page respects — some tenants have
  // more than one flow-store project, and the working page's fetch always
  // reads whichever one was last picked there rather than the hardcoded default.
  const FLOW_STORE_PROJECT = localStorage.getItem('wxccFlowProjectId') || '5e5c9ad6d61f870d6d778c1b';
  const FLOW_PROXY = window.ORBIT_PROXY_BASE + '/flows';
  const FLOW_TEMPLATE_URL = '../../assets/templates/API_Tools_Skills_to_Queue_Template.json';
  const FLOW_OUTDIAL_TEMPLATE_URL = '../../assets/templates/Template_Outdial.json';
  const ACTIVITY_IDS = {
    businessHours: 'business-hours',
    queueContact: '5f114550ef5cfc454fbbf133',
    queueLookup: '5fabaf1f8bf5b65b82f0706f',
    playMessage: '5f114466ef5cfc454fbbf131',
    ivrMenu: '5f1145ceef5cfc454fbbf134',
    blindTransfer: '5faa897107cf954e1147199a',
    setCallerId: '640ae8c41a51567ec6a87000'
  };
  const MENU_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#', '*'];

  let staticTemplateCache = null;
  async function loadStaticTemplate() {
    if (staticTemplateCache) return staticTemplateCache;
    const r = await fetch(FLOW_TEMPLATE_URL);
    if (!r.ok) throw new Error(`Could not load flow template file: HTTP ${r.status}`);
    staticTemplateCache = await r.json();
    return staticTemplateCache;
  }

  let outdialTemplateCache = null;
  async function loadOutdialTemplate() {
    if (outdialTemplateCache) return outdialTemplateCache;
    const r = await fetch(FLOW_OUTDIAL_TEMPLATE_URL);
    if (!r.ok) throw new Error(`Could not load outdial template file: HTTP ${r.status}`);
    outdialTemplateCache = await r.json();
    return outdialTemplateCache;
  }

  /* The outdial template's static Caller ID node is buried inside a nested
     eventFlows.eventsMap.GLOBAL_EVENTS sub-process (not the top-level
     process.activities every other flow patch targets), and is mirrored a
     second time inside that sub-process's own diagram.widgets. Rather than
     hardcode that nesting, walk the whole tree for anything shaped like an
     activity/widget (a "properties" bag) matching the activityId — this
     catches both copies wherever they live. */
  function walkActivityLikeNodes(node, visit) {
    if (Array.isArray(node)) {
      node.forEach((item) => walkActivityLikeNodes(item, visit));
      return;
    }
    if (node && typeof node === 'object') {
      if (node.properties && typeof node.properties === 'object') visit(node.properties);
      Object.values(node).forEach((v) => walkActivityLikeNodes(v, visit));
    }
  }

  function patchOutdialCallerId(flowJson, phoneNumber) {
    let patched = 0;
    walkActivityLikeNodes(flowJson, (props) => {
      if (props.activityId !== ACTIVITY_IDS.setCallerId) return;
      const isStatic = props.callerId_radioName === 'staticCallerId' || props['callerId:radioName'] === 'staticCallerId';
      if (!isStatic) return;
      props.callerId = phoneNumber;
      if ('callerId_name' in props) props.callerId_name = phoneNumber;
      if ('callerId:name' in props) props['callerId:name'] = phoneNumber;
      patched++;
    });
    if (!patched) throw new Error('No static Caller ID node found in the outdial template — cannot set the outbound number');
  }

  /* Mirrors the standalone Flows page's list-fetching exactly (same
     extractFlowList/getTotalPages/getNextPageUrl shapes, same page->offset
     fallback) — this tenant's flow-store apparently doesn't always honor
     page/pageSize, so a naive single-strategy fetch can silently come back
     empty even though flows exist. */
  function extractFlowList(data) {
    return Array.isArray(data) ? data : (data?.items || data?.data || data?.flows || []);
  }
  function getFlowListTotalPages(data, pageSize) {
    const total = data?.total || data?.totalCount || data?.count || data?.meta?.totalCount || data?.meta?.total || 0;
    const size = data?.pageSize || data?.size || data?.meta?.pageSize || pageSize;
    if (!total || !size) return 0;
    return Math.ceil(total / size);
  }
  function getFlowListNextPageUrl(data) {
    return data?.links?.next || data?.next || data?.meta?.next || '';
  }

  let flowListCache = null;
  async function fetchFlowList() {
    if (flowListCache) return flowListCache;
    const pageSize = 200;
    const proxyGet = async (ciscoUrl) => {
      const r = await fetch(`${FLOW_PROXY}?url=${encodeURIComponent(ciscoUrl)}`, { headers: WC.fetchHeaders });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || body?.error?.reason || `Flow list request failed: HTTP ${r.status}`);
      return body;
    };

    let allFlows = [];
    const seenIds = new Set();
    let page = 0;
    let nextUrl = '';
    let totalPages = 0;
    let guard = 0;
    let mode = 'page';

    do {
      const data = nextUrl
        ? await proxyGet(nextUrl)
        : await proxyGet(`https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(WC.ORG_ID)}/project/${encodeURIComponent(FLOW_STORE_PROJECT)}/flows?page=${page}&pageSize=${pageSize}&size=${pageSize}`);
      const items = extractFlowList(data);
      let added = 0;
      items.forEach((f) => {
        const id = f?.id || '';
        if (id && seenIds.has(id)) return;
        if (id) seenIds.add(id);
        allFlows.push(f);
        added++;
      });
      totalPages = totalPages || getFlowListTotalPages(data, pageSize);
      nextUrl = getFlowListNextPageUrl(data);
      page++;
      guard++;

      // No next-page info and nothing new this round means page/pageSize
      // stopped producing results — try offset/limit before giving up
      // entirely (this tenant's page-based fetch returning nothing on the
      // very first call is exactly the case that needs the fallback, so
      // that check has to run before any unconditional break).
      if (!nextUrl && !totalPages && added === 0) {
        if (mode === 'page') {
          mode = 'offset';
          page = 0; guard = 0; nextUrl = ''; totalPages = 0;
          allFlows = []; seenIds.clear();
        }
        break;
      }
    } while ((nextUrl || (totalPages && page < totalPages) || page < 50) && guard < 50);

    if (mode === 'offset') {
      let offset = 0;
      guard = 0;
      while (guard < 50) {
        const data = await proxyGet(`https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(WC.ORG_ID)}/project/${encodeURIComponent(FLOW_STORE_PROJECT)}/flows?offset=${offset}&limit=${pageSize}`);
        const items = extractFlowList(data);
        let added = 0;
        items.forEach((f) => {
          const id = f?.id || '';
          if (id && seenIds.has(id)) return;
          if (id) seenIds.add(id);
          allFlows.push(f);
          added++;
        });
        if (items.length === 0 || added === 0) break;
        offset += pageSize;
        guard++;
      }
    }

    flowListCache = allFlows;
    return flowListCache;
  }

  async function fetchFlowExportJson(flowId) {
    const ciscoUrl = `https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(WC.ORG_ID)}/project/${encodeURIComponent(FLOW_STORE_PROJECT)}/flows/${encodeURIComponent(flowId)}:export`;
    const r = await fetch(`${FLOW_PROXY}?url=${encodeURIComponent(ciscoUrl)}`, { headers: WC.fetchHeaders });
    if (!r.ok) throw new Error(`Could not export flow: HTTP ${r.status}`);
    const text = await r.text();
    try { return JSON.parse(text); } catch { throw new Error('Flow export was not valid JSON'); }
  }

  async function importFlowFromTemplate(payload) {
    const ciscoUrl = `https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(WC.ORG_ID)}/project/${encodeURIComponent(FLOW_STORE_PROJECT)}/flows:import?overwrite=yes&flowType=FLOW`;
    const r = await fetch(`${FLOW_PROXY}?url=${encodeURIComponent(ciscoUrl)}`, {
      method: 'POST', headers: { ...WC.fetchHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.message || body?.error?.reason || r.statusText || `HTTP ${r.status}`);
    return body;
  }

  async function publishFlow(flowId) {
    const ciscoUrl = `https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(WC.ORG_ID)}/project/${encodeURIComponent(FLOW_STORE_PROJECT)}/flows/${encodeURIComponent(flowId)}:publish`;
    const r = await fetch(`${FLOW_PROXY}?url=${encodeURIComponent(ciscoUrl)}&format=json`, {
      method: 'POST', headers: { ...WC.fetchHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Published via Orbit', tagIds: ['Live'] })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.message || body?.error?.reason || r.statusText || `HTTP ${r.status}`);
    return body;
  }

  /* ── Node detection by stable activityId — works identically for the
     static template and any tenant flow, regardless of node names. ── */
  function findActivitiesByType(template, activityId) {
    return Object.values(template?.process?.activities || {}).filter((a) => a.properties?.activityId === activityId);
  }
  function collectTtsNodes(template) {
    if (!template) return [];
    return Object.values(template.process.activities)
      .filter((a) => a.properties?.activityId === ACTIVITY_IDS.playMessage || a.properties?.activityId === ACTIVITY_IDS.ivrMenu)
      .map((a) => ({ activityId: a.id, name: a.name, text: a.properties?.promptsTts?.[0]?.value || '' }));
  }
  function collectTransferNodes(template) {
    if (!template) return [];
    return findActivitiesByType(template, ACTIVITY_IDS.blindTransfer)
      .map((a) => ({ activityId: a.id, name: a.name, number: a.properties?.transfertodn || '' }));
  }

  let flowTemplateMode = 'static';
  let activeFlowTemplate = null;
  function flowTemplateHasMenu() { return !!activeFlowTemplate && findActivitiesByType(activeFlowTemplate, ACTIVITY_IDS.ivrMenu).length > 0; }
  function flowTemplateHasBusinessHours() { return !!activeFlowTemplate && findActivitiesByType(activeFlowTemplate, ACTIVITY_IDS.businessHours).length === 1; }
  function flowTemplateHasTransferNodes() { return !!activeFlowTemplate && !flowTemplateHasMenu() && findActivitiesByType(activeFlowTemplate, ACTIVITY_IDS.blindTransfer).length > 0; }

  /* __tts/__menuOptions/__transfers are keyed by activityId, which only means
     something against the specific template they were collected from — a
     stale value from a previous template still "looks filled in" (count
     shows nonzero) but silently fails to apply. Drop them on every template
     switch so a row always reflects only the currently active template. */
  function clearTemplateDependentRowState() {
    flowsSheet.getRows().forEach((row) => {
      delete row.__tts;
      delete row.__menuOptions;
      delete row.__transfers;
    });
    flowsSheet.persist();
  }

  async function setFlowTemplateMode(mode) {
    flowTemplateMode = mode;
    clearTemplateDependentRowState();
    document.querySelectorAll('#cgFlowTemplateModeGrid .queue-type-card').forEach((card) => {
      card.classList.toggle('active', card.getAttribute('data-template-mode') === mode);
    });
    const picker = document.getElementById('cgFlowCopyPicker');
    const status = document.getElementById('cgFlowTemplateStatus');
    if (mode === 'copy') {
      picker.classList.remove('hidden');
      activeFlowTemplate = null;
      flowsSheet.render();
      status.textContent = 'Loading flow list…';
      try {
        const flows = await fetchFlowList();
        const sel = document.getElementById('cgFlowCopySelect');
        sel.innerHTML = '<option value="">Select a flow…</option>' + flows.map((f) => `<option value="${WC.escHtml(f.id)}">${WC.escHtml(f.name)}</option>`).join('');
        WC.enhanceSelect(sel)();
        status.textContent = `Loaded ${flows.length} flow(s) — pick one to copy from.`;
      } catch (err) {
        status.textContent = `Could not load flow list: ${err.message}`;
      }
      return;
    }
    picker.classList.add('hidden');
    try {
      activeFlowTemplate = await loadStaticTemplate();
      status.textContent = 'Using the bundled static template.';
    } catch (err) {
      activeFlowTemplate = null;
      status.textContent = `Could not load the static template: ${err.message}`;
    }
    flowsSheet.render();
  }

  const flowsSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetFlows'),
    draftKey: 'cgDraftV1_flows',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'queue', label: 'Queue', type: 'select', options: () => opts(org.queues), visible: () => !flowTemplateHasMenu() },
      { key: 'businessHours', label: 'Business Hours', type: 'select', options: () => opts(org.businessHoursList), visible: () => flowTemplateHasBusinessHours() },
      { key: 'tts', label: 'TTS…', type: 'button', count: (row) => Object.keys(row.__tts || {}).length },
      { key: 'menuOptions', label: 'Menu Options…', type: 'button', count: (row) => (row.__menuOptions || []).length, visible: () => flowTemplateHasMenu() },
      { key: 'transferNumbers', label: 'Transfer Numbers…', type: 'button', count: (row) => Object.keys(row.__transfers || {}).length, visible: () => flowTemplateHasTransferNodes() }
    ],
    onCellButton(row, key, after) {
      if (key === 'tts') openFlowTtsModal(row, after);
      if (key === 'menuOptions') openMenuOptionsModal(row, after);
      if (key === 'transferNumbers') openTransferNumbersModal(row, after);
    }
  });

  function openFlowTtsModal(row, after) {
    const nodes = collectTtsNodes(activeFlowTemplate);
    row.__tts = row.__tts || {};
    const modal = document.getElementById('cgFlowTtsModal');
    const wrap = document.getElementById('cgFlowTtsFields');
    wrap.innerHTML = nodes.map((n) => `
      <div class="cg-modal-field">
        <span>${WC.escHtml(n.name)}</span>
        <textarea rows="2" data-activity-id="${WC.escHtml(n.activityId)}">${WC.escHtml(row.__tts[n.activityId] ?? n.text)}</textarea>
      </div>
    `).join('');
    modal.classList.add('open');
    modal._save = () => {
      const edited = {};
      wrap.querySelectorAll('textarea').forEach((ta) => { edited[ta.getAttribute('data-activity-id')] = ta.value; });
      row.__tts = edited;
      modal.classList.remove('open');
      after();
    };
  }

  function menuOptionRowHtml(opt) {
    const digit = opt?.digit || '';
    const type = opt?.type || 'queue';
    const value = opt?.value || '';
    const digitOptionsHtml = MENU_DIGITS.map((d) => `<option value="${d}"${d === digit ? ' selected' : ''}>${d}</option>`).join('');
    const queueOptionsHtml = opts(org.queues).map((o) => `<option value="${WC.escHtml(o.value)}"${o.value === value ? ' selected' : ''}>${WC.escHtml(o.label)}</option>`).join('');
    return `<div class="cg-phone-row cg-menu-option-row">
      <select class="cg-menu-digit"><option value=""></option>${digitOptionsHtml}</select>
      <select class="cg-menu-type">
        <option value="queue"${type === 'queue' ? ' selected' : ''}>Route to Queue</option>
        <option value="transfer"${type === 'transfer' ? ' selected' : ''}>Transfer to Number</option>
      </select>
      <select class="cg-menu-value-queue" style="${type === 'queue' ? '' : 'display:none;'}"><option value=""></option>${queueOptionsHtml}</select>
      <input class="cg-menu-value-number" placeholder="Phone number" value="${type === 'transfer' ? WC.escHtml(value) : ''}" style="${type === 'transfer' ? '' : 'display:none;'}">
      <button type="button" class="btn secondary sm cg-phone-remove">×</button>
    </div>`;
  }

  function openMenuOptionsModal(row, after) {
    row.__menuOptions = row.__menuOptions || [];
    const modal = document.getElementById('cgMenuOptionsModal');
    const wrap = document.getElementById('cgMenuOptionRows');
    function wireRows() {
      wrap.querySelectorAll('.cg-menu-option-row').forEach((rowEl) => {
        rowEl.querySelector('.cg-menu-type').addEventListener('change', (e) => {
          const isQueue = e.target.value === 'queue';
          rowEl.querySelector('.cg-menu-value-queue').style.display = isQueue ? '' : 'none';
          rowEl.querySelector('.cg-menu-value-number').style.display = isQueue ? 'none' : '';
        });
        rowEl.querySelector('.cg-phone-remove').addEventListener('click', () => rowEl.remove());
      });
    }
    wrap.innerHTML = (row.__menuOptions.length ? row.__menuOptions : [null]).map(menuOptionRowHtml).join('');
    wireRows();
    document.getElementById('cgAddMenuOptionRow').onclick = () => {
      wrap.insertAdjacentHTML('beforeend', menuOptionRowHtml(null));
      wireRows();
    };
    modal.classList.add('open');
    modal._save = () => {
      const rows = Array.from(wrap.querySelectorAll('.cg-menu-option-row')).map((r) => {
        const digit = r.querySelector('.cg-menu-digit').value;
        const type = r.querySelector('.cg-menu-type').value;
        const value = type === 'queue' ? r.querySelector('.cg-menu-value-queue').value : r.querySelector('.cg-menu-value-number').value.trim();
        return { digit, type, value };
      }).filter((o) => o.digit && o.value);
      const byDigit = new Map();
      rows.forEach((r) => byDigit.set(r.digit, r)); // last one wins on a duplicate digit
      row.__menuOptions = Array.from(byDigit.values());
      modal.classList.remove('open');
      after();
    };
  }

  function openTransferNumbersModal(row, after) {
    const nodes = collectTransferNodes(activeFlowTemplate);
    row.__transfers = row.__transfers || {};
    const modal = document.getElementById('cgTransferNumbersModal');
    const wrap = document.getElementById('cgTransferNumberFields');
    wrap.innerHTML = nodes.map((n) => `
      <div class="cg-modal-field">
        <span>${WC.escHtml(n.name)}</span>
        <input data-activity-id="${WC.escHtml(n.activityId)}" placeholder="Phone number" value="${WC.escHtml(row.__transfers[n.activityId] ?? n.number)}">
      </div>
    `).join('');
    modal.classList.add('open');
    modal._save = () => {
      const edited = {};
      wrap.querySelectorAll('input').forEach((inp) => { edited[inp.getAttribute('data-activity-id')] = inp.value.trim(); });
      row.__transfers = edited;
      modal.classList.remove('open');
      after();
    };
  }

  /* ── Fresh id generator matching Cisco's own UUID key style ── */
  function generateNodeId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /* Forward-BFS from rootId, refusing to cross into boundarySet — used to
     lift out a reusable "shape template" (e.g. the queue subgraph, or a
     lone transfer node) from the pristine flow before any deletion. */
  function extractSubgraph(activities, links, rootId, boundarySet) {
    const visited = new Set();
    const queue = [rootId];
    const subActivities = [];
    const subLinks = [];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id) || boundarySet.has(id)) continue;
      visited.add(id);
      if (activities[id]) subActivities.push(activities[id]);
      links.forEach((link) => {
        if (link.sourceActivityId === id && !boundarySet.has(link.targetActivityId)) {
          subLinks.push(link);
          if (!visited.has(link.targetActivityId)) queue.push(link.targetActivityId);
        }
      });
    }
    return { activities: subActivities, links: subLinks, rootId };
  }

  /* Deep-clones a subgraph with a fresh id for every activity and link,
     remapping every internal link reference to the new ids. Never rewrites
     properties.activityId — that's the stable type marker, not an instance id. */
  function cloneSubgraph(subgraph) {
    const idMap = new Map();
    subgraph.activities.forEach((a) => idMap.set(a.id, generateNodeId()));
    const activities = subgraph.activities.map((a) => {
      const clone = JSON.parse(JSON.stringify(a));
      clone.id = idMap.get(a.id);
      return clone;
    });
    const links = subgraph.links.map((l) => {
      const clone = JSON.parse(JSON.stringify(l));
      clone.id = generateNodeId();
      clone.sourceActivityId = idMap.get(l.sourceActivityId) || l.sourceActivityId;
      clone.targetActivityId = idMap.get(l.targetActivityId) || l.targetActivityId;
      return clone;
    });
    return { activities, links, rootId: idMap.get(subgraph.rootId) };
  }

  /* Mark-and-sweep delete of everything that becomes unreachable once the
     Menu's links for the digits being reconfigured are removed — safe under
     arbitrary node sharing (unlike walking the overridden branches and
     deleting whatever's touched, which only happens to be safe here because
     those branches are private in this specific flow). */
  function rebuildMenuRouting(flowJson, menuActivityId, digitsBeingReconfigured) {
    const activities = flowJson.process.activities;
    const keepDigits = new Set(digitsBeingReconfigured);
    const removedLinks = flowJson.process.links.filter((l) => l.sourceActivityId === menuActivityId && keepDigits.has(l.conditionExpr));
    flowJson.process.links = flowJson.process.links.filter((l) => !removedLinks.includes(l));

    const roots = new Set([menuActivityId]);
    Object.keys(activities).forEach((id) => { if (activities[id].properties?.activityId === 'start') roots.add(id); });
    const visited = new Set();
    const queue = Array.from(roots);
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      flowJson.process.links.forEach((l) => { if (l.sourceActivityId === id && !visited.has(l.targetActivityId)) queue.push(l.targetActivityId); });
    }

    const deletedActivityIds = Object.keys(activities).filter((id) => !visited.has(id));
    deletedActivityIds.forEach((id) => delete activities[id]);
    const survivingLinks = flowJson.process.links.filter((l) => activities[l.sourceActivityId] && activities[l.targetActivityId]);
    const deletedLinks = flowJson.process.links.filter((l) => !survivingLinks.includes(l));
    flowJson.process.links = survivingLinks;
    survivingLinks.forEach((l) => {
      if (!activities[l.sourceActivityId] || !activities[l.targetActivityId]) throw new Error(`Dangling link after menu rebuild: ${l.id}`);
    });

    // diagram.widgets is keyed by BOTH activity ids and link ids — leaving a
    // widget entry for something no longer in process.activities/links is
    // what actually breaks Flow Designer's loader (confirmed against a real
    // import: it crashes trying to read a property off the now-undefined
    // activity/link the stale widget still points at), not just cosmetic.
    if (flowJson.diagram?.widgets) {
      const widgets = flowJson.diagram.widgets;
      const removedLinkOuterIds = [...removedLinks.map((l) => l.id), ...deletedLinks.map((l) => l.id)];
      // A link widget's OWN `.id` (not the outer key above) is what surviving
      // activity widgets' ports reference via `linkId` — capture those before
      // the widget entries are deleted, so those ports can be dropped too.
      const removedLinkInnerIds = new Set(removedLinkOuterIds.map((id) => widgets[id]?.id).filter(Boolean));
      [...deletedActivityIds, ...removedLinkOuterIds].forEach((id) => delete widgets[id]);
      Object.values(widgets).forEach((w) => {
        if (w.widgetType === 'activity' && Array.isArray(w.ports)) {
          w.ports = w.ports.filter((p) => !p.linkId || !removedLinkInnerIds.has(p.linkId));
        }
      });
    }
  }

  /* Adds a link plus fully-formed widget entries for it and both of its
     endpoint activities (creating the activity widgets too, if they don't
     exist yet) — mirrors the exact shape Cisco's own exports use (ports
     cross-referencing linkId, link widgets cross-referencing port/widget
     ids), which the loader needs to render — a bare activity widget with
     empty ports is not enough. */
  function addDiagramLink(flowJson, sourceActivityId, targetActivityId, linkId, conditionLabel) {
    if (!flowJson.diagram) flowJson.diagram = { widgets: {} };
    if (!flowJson.diagram.widgets) flowJson.diagram.widgets = {};
    const widgets = flowJson.diagram.widgets;
    function ensureActivityWidget(activityId) {
      if (widgets[activityId]) return widgets[activityId];
      const activity = flowJson.process.activities[activityId];
      const w = {
        id: generateNodeId(), type: activity?.group || 'action', widgetType: 'activity',
        label: 'New Activity Widget in Diagram',
        point: { x: 100 + Math.floor(Math.random() * 600), y: 100 + Math.floor(Math.random() * 600) },
        ports: [], properties: activity?.properties || {}
      };
      widgets[activityId] = w;
      return w;
    }
    const sourceWidget = ensureActivityWidget(sourceActivityId);
    const targetWidget = ensureActivityWidget(targetActivityId);
    // `linkId` (the param) is process.links' logical id — the OUTER key
    // this link widget is stored under, same as activity widgets are keyed
    // by their process.activities id. Ports don't reference that outer key
    // though: they reference the link WIDGET's own inner `.id` (a separate
    // value, confirmed against a real export) — generate that once and
    // reuse it for both the widget's `.id` and both ports' `linkId`.
    const linkWidgetId = generateNodeId();
    const sourcePortId = generateNodeId();
    const targetPortId = generateNodeId();
    const label = conditionLabel || 'default';
    // Confirmed against a real export: on an activity widget's own port
    // entries, `isSourcePort` is the OPPOSITE of what its name suggests —
    // the port for the activity's OUTGOING link (labeled by conditionExpr,
    // right-aligned) is isSourcePort:false, and the port for its INCOMING
    // link ("in", left-aligned) is isSourcePort:true.
    sourceWidget.ports.push({
      portId: sourcePortId, isSourcePort: false, linkId: linkWidgetId, type: 'arrow', links: [linkWidgetId],
      properties: { x: sourceWidget.point.x + 175, y: sourceWidget.point.y + 14, name: label, label, alignment: 'right' }
    });
    targetWidget.ports.push({
      portId: targetPortId, isSourcePort: true, linkId: linkWidgetId, type: 'arrow', links: [linkWidgetId],
      properties: { x: targetWidget.point.x - 10, y: targetWidget.point.y + 14, name: 'in', label: 'in', alignment: 'left' }
    });
    const sourcePoint = { x: sourceWidget.point.x + 175, y: sourceWidget.point.y + 14 };
    const targetPoint = { x: targetWidget.point.x - 10, y: targetWidget.point.y + 14 };
    widgets[linkId] = {
      id: linkWidgetId, type: 'arrow', widgetType: 'link', label: '[object Object]',
      // properties.points holds the curve's two bend/anchor points — a real
      // export always has exactly two here; an empty array is what made
      // Flow Designer's renderer crash (it indexes into this expecting a
      // point object to call .setPosition-style methods on).
      properties: {
        curvyness: 50, selected: false, color: 'var(--mds-color-theme-outline-theme-normal)',
        points: [
          { id: generateNodeId(), type: 'point', x: sourcePoint.x, y: sourcePoint.y },
          { id: generateNodeId(), type: 'point', x: targetPoint.x, y: targetPoint.y }
        ],
        width: 2, selectedColor: 'var(--mds-color-theme-outline-theme-normal)'
      },
      points: [],
      sourcePort: { id: sourcePortId, activeWidgetId: sourceWidget.id, point: { x: sourceWidget.point.x + 175, y: sourceWidget.point.y + 14 } },
      targetPort: { id: targetPortId, activeWidgetId: targetWidget.id, point: { x: targetWidget.point.x - 10, y: targetWidget.point.y + 14 } }
    };
  }

  function applyMenuOptions(flowJson, menuActivityId, options) {
    const activities = flowJson.process.activities;
    // menuLinks / menuLinks_input declare which digits the menu accepts at
    // all — a source flow that doesn't already list every digit (unlike
    // the reference flow, which pre-declares all 12) needs a configured
    // digit added to BOTH arrays, or the new link has nothing declaring it
    // as a valid input.
    const menuProps = activities[menuActivityId].properties;
    [menuProps.menuLinks, menuProps.menuLinks_input].forEach((arr) => {
      if (!Array.isArray(arr)) return;
      options.forEach((opt) => { if (!arr.includes(opt.digit)) arr.push(opt.digit); });
    });
    const menuBoundary = new Set([menuActivityId]);
    const transferTemplateNode = Object.values(activities).find((a) => a.properties?.activityId === ACTIVITY_IDS.blindTransfer);
    const queueContactNode = Object.values(activities).find((a) => a.properties?.activityId === ACTIVITY_IDS.queueContact);
    // Extract shape templates from the PRISTINE graph (already TTS-patched
    // by the time this runs) before any deletion.
    const transferShape = transferTemplateNode ? extractSubgraph(activities, flowJson.process.links, transferTemplateNode.id, menuBoundary) : null;
    const queueShape = queueContactNode ? extractSubgraph(activities, flowJson.process.links, queueContactNode.id, menuBoundary) : null;

    rebuildMenuRouting(flowJson, menuActivityId, options.map((o) => o.digit));

    options.forEach((opt) => {
      const shape = opt.type === 'transfer' ? transferShape : queueShape;
      if (!shape) return;
      const clone = cloneSubgraph(shape);
      const digitLabel = opt.digit === '#' ? 'Pound' : opt.digit === '*' ? 'Star' : opt.digit;
      clone.activities.forEach((a) => {
        // Cloned nodes start out with the same name as the shape template
        // (e.g. every "Transfer to Number" option clones "Xfer_Opt1") — tag
        // each with its digit so Flow Designer doesn't show duplicate labels.
        a.name = `${a.name}_Digit${digitLabel}`;
        if (a.properties) a.properties.name = a.name;
        activities[a.id] = a;
        const aid = a.properties?.activityId;
        if (opt.type === 'transfer' && aid === ACTIVITY_IDS.blindTransfer) {
          a.properties.transfertodn = opt.value;
          a.properties['transfertodn:name'] = opt.value;
          a.properties.transfertodn_name = opt.value;
        }
        if (opt.type === 'queue' && (aid === ACTIVITY_IDS.queueContact || aid === ACTIVITY_IDS.queueLookup)) {
          a.properties.destination = opt.value;
          a.properties.destination_name = opt.valueName || opt.value;
          a.properties['destination:name'] = opt.valueName || opt.value;
        }
      });
      clone.links.forEach((l) => {
        flowJson.process.links.push(l);
        addDiagramLink(flowJson, l.sourceActivityId, l.targetActivityId, l.id, l.conditionExpr);
      });
      const menuLinkId = generateNodeId();
      flowJson.process.links.push({ id: menuLinkId, sourceActivityId: menuActivityId, targetActivityId: clone.rootId, conditionExpr: opt.digit, properties: { value: opt.digit } });
      addDiagramLink(flowJson, menuActivityId, clone.rootId, menuLinkId, opt.digit);
    });
  }

  function patchBusinessHours(flowJson, bhId, bhName) {
    const nodes = findActivitiesByType(flowJson, ACTIVITY_IDS.businessHours);
    if (nodes.length !== 1) throw new Error(`Expected exactly 1 business-hours node in this template, found ${nodes.length} — cannot apply Business Hours`);
    Object.assign(nodes[0].properties, { businessHoursId: bhId, 'businessHoursId:name': bhName, businessHoursId_name: bhName });
  }

  function patchStandaloneQueue(flowJson, queueId, queueName) {
    const nodes = [...findActivitiesByType(flowJson, ACTIVITY_IDS.queueContact), ...findActivitiesByType(flowJson, ACTIVITY_IDS.queueLookup)];
    if (!nodes.length) throw new Error('No queue-contact/queue-lookup node found in this template — cannot apply Queue');
    nodes.forEach((n) => Object.assign(n.properties, { destination: queueId, destination_name: queueName, 'destination:name': queueName }));
  }

  /* activityId keys in ttsEdits/transferEdits are only meaningful against the
     template they were collected from (see collectTtsNodes/collectTransferNodes).
     Switching Template Source clears row.__tts/__menuOptions/__transfers for
     exactly this reason (see setFlowTemplateMode) — a key that still doesn't
     resolve here means stale/tampered draft data, not a value to silently drop. */
  function patchTts(flowJson, ttsEdits) {
    Object.entries(ttsEdits || {}).forEach(([activityId, text]) => {
      const node = flowJson.process.activities[activityId];
      if (text == null) return;
      if (!node) throw new Error('A saved TTS entry no longer matches a node in this template — reopen TTS… and re-save it');
      node.properties.promptsTts = [{ type: 'tts', value: text, name: text }];
    });
  }

  function patchStandaloneTransfers(flowJson, transferEdits) {
    Object.entries(transferEdits || {}).forEach(([activityId, number]) => {
      const node = flowJson.process.activities[activityId];
      if (!number) return;
      if (!node) throw new Error('A saved Transfer Number entry no longer matches a node in this template — reopen Transfer Numbers… and re-save it');
      Object.assign(node.properties, { transfertodn: number, 'transfertodn:name': number, transfertodn_name: number });
    });
  }

  async function runFlowRow(row) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    if (!activeFlowTemplate) throw new Error('Select a Template Source before running Flows');

    const flowJson = JSON.parse(JSON.stringify(activeFlowTemplate));
    flowJson.name = name;
    flowJson.description = row.description || '';
    flowJson.id = generateNodeId().replace(/-/g, '').slice(0, 24);
    delete flowJson.flowId; delete flowJson.createdBy; delete flowJson.createdDate;
    delete flowJson.lastModifiedBy; delete flowJson.lastModifiedDate; delete flowJson.validationResults;

    const menuNode = findActivitiesByType(flowJson, ACTIVITY_IDS.ivrMenu)[0];

    if (row.businessHours) {
      const bh = org.businessHoursList.find((b) => b.id === row.businessHours);
      if (!bh) throw new Error('Selected business hours not found');
      patchBusinessHours(flowJson, bh.id, bh.name);
    }
    patchTts(flowJson, row.__tts);

    if (menuNode) {
      const options = (row.__menuOptions || []).map((opt) => {
        if (opt.type !== 'queue') return opt;
        const q = org.queues.find((qq) => qq.id === opt.value);
        if (!q) throw new Error(`Queue not found for menu option "${opt.digit}"`);
        return { ...opt, valueName: q.name };
      });
      applyMenuOptions(flowJson, menuNode.id, options);
    } else {
      if (row.queue) {
        const q = org.queues.find((qq) => qq.id === row.queue);
        if (!q) throw new Error('Selected queue not found');
        patchStandaloneQueue(flowJson, q.id, q.name);
      }
      patchStandaloneTransfers(flowJson, row.__transfers);
    }

    const importResult = await importFlowFromTemplate(flowJson);
    const flowId = importResult?.id || importResult?.flowId || '';
    if (flowId) await publishFlow(flowId);
    const created_ = { id: flowId, name: importResult?.name || name };
    created.flows.set(name.toLowerCase(), created_);
    org.flows.push({ id: created_.id, name: created_.name });
    entryPointsSheet.render();
    return created_.name;
  }

  /* ════════════════════════════════════════════════════════════════
     ENTRY POINTS (name + phone numbers/extension, plus an optional Flow
     to attach — created on the Flows tab)
  ════════════════════════════════════════════════════════════════ */
  const entryPointsSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetEntryPoints'),
    draftKey: 'cgDraftV1_entrypoints',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'flow', label: 'Flow', type: 'select', options: () => opts(org.flows) },
      { key: 'musicOnHold', label: 'Music On Hold', type: 'select', options: () => opts(org.musicFiles) },
      { key: 'phones', label: 'Numbers…', type: 'button', count: (row) => (row.__phones || []).length }
    ],
    onCellButton(row, key, after) {
      if (key === 'phones') openPhoneModal(row, after);
    }
  });

  /* Available (unowned) numbers for a location — same endpoint + owner
     filter the Setup Wizard's phone-number picker uses. */
  /* includeOwned:false (the default, used for Entry Points' dial-in number
     picker) excludes numbers already assigned elsewhere — assigning an
     owned number as a NEW dial-in number would conflict. A Caller ID isn't
     an assignment, it's just what shows on outbound calls, so the same
     number already in use elsewhere (e.g. the org's main published number)
     is normal and often exactly what's wanted — that path passes
     includeOwned:true. */
  async function fetchAvailableNumbersForLocation(locationId, { includeOwned = false } = {}) {
    try {
      const params = new URLSearchParams({ max: '1000' });
      const rawOrgId = (localStorage.getItem('authOrgId') || localStorage.getItem('authOrg') || '').trim();
      if (rawOrgId) params.set('orgId', rawOrgId);
      if (locationId) params.set('locationId', locationId);
      const r = await fetch(`${WC.WEBEX_BASE}/v1/telephony/config/numbers?${params}`, { headers: WC.fetchHeaders });
      if (!r.ok) return [];
      const body = await r.json();
      return (body?.phoneNumbers ?? []).filter((n) => n.phoneNumber && (includeOwned || !n.owner));
    } catch { return []; }
  }

  function phoneRowHtml() {
    return `<div class="cg-phone-row">
      <select class="cg-phone-loc-select"><option value="">Loading…</option></select>
      <select class="cg-phone-num-select" disabled><option value="">Select location first</option></select>
      <input placeholder="Ext" class="cg-phone-ext" style="flex:0 0 70px;">
      <button type="button" class="btn secondary sm cg-phone-remove">×</button>
    </div>`;
  }

  /* Location → available-numbers cascade, matching the Setup Wizard's own
     phone-number picker (S3_Channels.html) instead of free-typed text that
     could silently fail to resolve at run time. */
  function wirePhoneRow(rowEl, saved) {
    const locSel = rowEl.querySelector('.cg-phone-loc-select');
    const numSel = rowEl.querySelector('.cg-phone-num-select');
    const extInput = rowEl.querySelector('.cg-phone-ext');
    if (saved?.extension) extInput.value = saved.extension;

    locSel.innerHTML = '<option value="">Select location</option>' +
      org.locations.map((l) => `<option value="${WC.escHtml(l.id)}">${WC.escHtml(l.name || l.id)}</option>`).join('');
    if (saved?.locationId) locSel.value = saved.locationId;
    const refreshLoc = WC.enhanceSelect(locSel);
    const refreshNum = WC.enhanceSelect(numSel);
    refreshLoc();
    refreshNum();

    async function loadNumbers() {
      const locId = locSel.value;
      if (!locId) {
        numSel.innerHTML = '<option value="">Select location first</option>';
        numSel.disabled = true;
        refreshNum();
        return;
      }
      numSel.innerHTML = '<option value="">Loading…</option>';
      numSel.disabled = true;
      refreshNum();
      const nums = await fetchAvailableNumbersForLocation(locId);
      numSel.disabled = false;
      if (!nums.length) {
        numSel.innerHTML = '<option value="">No numbers found</option>';
        refreshNum();
        return;
      }
      numSel.innerHTML = '<option value="">Select a number</option>' +
        nums.map((n) => `<option value="${WC.escHtml(n.phoneNumber)}">${WC.escHtml(n.phoneNumber)}</option>`).join('');
      if (saved?.pstn) numSel.value = saved.pstn;
      refreshNum();
    }
    locSel.addEventListener('change', loadNumbers);
    if (locSel.value) loadNumbers();
  }

  function openPhoneModal(row, after) {
    row.__phones = row.__phones || [];
    const modal = document.getElementById('cgPhoneModal');
    const wrap = document.getElementById('cgPhoneRows');
    function wireRow(rowEl, saved) {
      wirePhoneRow(rowEl, saved);
      rowEl.querySelector('.cg-phone-remove').addEventListener('click', () => rowEl.remove());
    }
    function renderRows(list) {
      const saved = list.length ? list : [null];
      wrap.innerHTML = saved.map(() => phoneRowHtml()).join('');
      Array.from(wrap.querySelectorAll('.cg-phone-row')).forEach((rowEl, i) => wireRow(rowEl, saved[i]));
    }
    renderRows(row.__phones);
    document.getElementById('cgAddPhoneRow').onclick = () => {
      wrap.insertAdjacentHTML('beforeend', phoneRowHtml());
      wireRow(wrap.lastElementChild, null);
    };
    modal.classList.add('open');
    modal._save = () => {
      const rows = Array.from(wrap.querySelectorAll('.cg-phone-row')).map((r) => ({
        locationId: r.querySelector('.cg-phone-loc-select').value,
        pstn: r.querySelector('.cg-phone-num-select').value,
        extension: r.querySelector('.cg-phone-ext').value.trim()
      })).filter((p) => p.locationId && p.pstn);
      row.__phones = rows;
      modal.classList.remove('open');
      after();
    };
  }

  document.querySelectorAll('.cg-modal-overlay [data-modal-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('.cg-modal-overlay').classList.remove('open'));
  });
  document.querySelectorAll('.cg-modal-overlay [data-modal-save]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.cg-modal-overlay');
      if (modal._save) modal._save();
    });
  });

  async function runEntryPointRow(row, index, sheet) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');

    sheet.setRowStatus(index, 'active', 'Creating entry point…');
    const epPayload = {
      name, description: row.description || '', channelType: 'TELEPHONY', entryPointType: 'INBOUND',
      serviceLevelThreshold: 30, timezone: 'America/New_York', maximumActiveContacts: 0, active: true
    };
    if (row.flow) {
      const flow = org.flows.find((f) => f.id === row.flow);
      if (flow) {
        // Control Hub's own "Create an Entry Point" form only shows/requires
        // Music On Hold + Version Label once a Routing Flow is picked — same
        // condition here.
        if (!row.musicOnHold) throw new Error('Music On Hold is required when a Flow is selected');
        epPayload.flowId = flow.id;
        epPayload.flowTagId = 'Live';
        epPayload.musicOnHoldId = row.musicOnHold;
      }
    }
    const epResult = await WC.apiPost('/entry-point', epPayload);
    const epId = epResult?.id || '';
    created.entryPoints.set(name.toLowerCase(), { id: epId, name: epResult?.name || name });
    org.entryPoints.push({ id: epId, name: epResult?.name || name, entryPointType: 'INBOUND' });

    const phones = row.__phones || [];
    let phoneErrors = 0;
    for (const p of phones) {
      sheet.setRowStatus(index, 'active', `Assigning number ${p.pstn}…`);
      const loc = byNameLower(org.locations, p.location);
      if (!loc) { phoneErrors++; continue; }
      const decodedLocId = decodeWebexId(loc.id);
      const pstn = p.pstn.startsWith('+') ? p.pstn.replace(/\s/g, '') : `+${p.pstn.replace(/\s/g, '')}`;
      try {
        await WC.apiPost('/dial-number', {
          entryPointId: epId, entryPointName: epResult?.name || name,
          location: decodedLocId, regionId: locationRegionMap[decodedLocId] || FALLBACK_REGION_ID,
          dialledNumber: pstn, dialledNumberDigits: pstn.replace(/^\+/, ''),
          ...(p.extension ? { extension: p.extension } : {})
        });
      } catch { phoneErrors++; }
    }
    return phoneErrors ? `${name} (${phoneErrors} number(s) failed)` : name;
  }

  /* ════════════════════════════════════════════════════════════════
     OUTBOUND — clones the bundled outdial flow template (one static
     Caller ID to re-point per row) and publishes it, then creates an
     OUTBOUND entry point named "<Name>_Outbound" wired to that flow.
  ════════════════════════════════════════════════════════════════ */
  /* Caller ID Number's real options depend on which Location is picked in the
     same row (only that location's unowned numbers are valid), fetched from
     the same endpoint the Setup Wizard's own phone picker uses. Cached per
     location since the same location gets picked across many rows. */
  const outboundNumbersCache = new Map();
  function ensureOutboundNumbersLoaded(locationId) {
    if (!locationId) return null;
    const cached = outboundNumbersCache.get(locationId);
    if (cached && cached.status !== 'error') return cached;
    const entry = { status: 'loading', numbers: [] };
    outboundNumbersCache.set(locationId, entry);
    fetchAvailableNumbersForLocation(locationId, { includeOwned: true }).then((nums) => {
      outboundNumbersCache.set(locationId, { status: 'ready', numbers: nums.map((n) => ({ value: n.phoneNumber, label: n.phoneNumber })) });
      outboundSheet.render();
    }).catch(() => outboundNumbersCache.set(locationId, { status: 'error', numbers: [] }));
    return entry;
  }
  function outboundNumberOptions(row) {
    const cached = ensureOutboundNumbersLoaded(row?.callerIdLocation);
    return cached ? cached.numbers : [];
  }

  const outboundSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetOutbound'),
    draftKey: 'cgDraftV1_outbound',
    cols: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'outdialQueue', label: 'Outdial Queue', type: 'select', options: () => opts(outdialQueues()) },
      { key: 'musicOnHold', label: 'Music On Hold', type: 'select', options: () => opts(org.musicFiles) },
      { key: 'callerIdLocation', label: 'Caller ID Location', type: 'select', options: () => opts(org.locations),
        onChange: (row) => { row.callerIdNumber = ''; } },
      {
        key: 'callerIdNumber', label: 'Caller ID Number', type: 'select', options: (row) => outboundNumberOptions(row),
        resolvePaste: async (rawValue, row) => {
          const value = (rawValue || '').trim();
          if (!value) return { value: '', matched: true };
          if (!row.callerIdLocation) return { value: '', matched: false };
          let cached = outboundNumbersCache.get(row.callerIdLocation);
          if (!cached || cached.status !== 'ready') {
            const nums = await fetchAvailableNumbersForLocation(row.callerIdLocation, { includeOwned: true });
            cached = { status: 'ready', numbers: nums.map((n) => ({ value: n.phoneNumber, label: n.phoneNumber })) };
            outboundNumbersCache.set(row.callerIdLocation, cached);
          }
          const normalized = value.startsWith('+') ? value.replace(/\s/g, '') : `+${value.replace(/\s/g, '')}`;
          const match = cached.numbers.find((n) => n.value === value || n.value === normalized);
          return match ? { value: match.value, matched: true } : { value: '', matched: false };
        }
      }
    ]
  });

  async function runOutboundRow(row, index, sheet) {
    const name = (row.name || '').trim();
    if (!name) throw new Error('Name is required');
    if (!row.callerIdLocation) throw new Error('Caller ID Location is required');
    if (!row.callerIdNumber) throw new Error('Caller ID Number is required — pick a valid tenant number');
    if (!row.outdialQueue) throw new Error('Outdial Queue is required');
    if (!row.musicOnHold) throw new Error('Music On Hold is required');

    sheet.setRowStatus(index, 'active', 'Building outdial flow…');
    const flowJson = JSON.parse(JSON.stringify(await loadOutdialTemplate()));
    flowJson.name = name;
    flowJson.description = row.description || '';
    flowJson.id = generateNodeId().replace(/-/g, '').slice(0, 24);
    delete flowJson.flowId; delete flowJson.createdBy; delete flowJson.createdDate;
    delete flowJson.lastModifiedBy; delete flowJson.lastModifiedDate; delete flowJson.validationResults;
    const pstn = row.callerIdNumber.startsWith('+') ? row.callerIdNumber : `+${row.callerIdNumber}`;
    patchOutdialCallerId(flowJson, pstn);

    const importResult = await importFlowFromTemplate(flowJson);
    const flowId = importResult?.id || importResult?.flowId || '';
    if (!flowId) throw new Error('Flow import did not return an id');
    sheet.setRowStatus(index, 'active', 'Publishing outdial flow…');
    await publishFlow(flowId);
    const flowName = importResult?.name || name;
    created.flows.set(flowName.toLowerCase(), { id: flowId, name: flowName });
    org.flows.push({ id: flowId, name: flowName });
    entryPointsSheet.render();

    sheet.setRowStatus(index, 'active', 'Creating outbound entry point…');
    const epName = `${name}_Outbound`;
    const epPayload = {
      name: epName, description: row.description || '', channelType: 'TELEPHONY', entryPointType: 'OUTBOUND',
      serviceLevelThreshold: 30, timezone: 'America/New_York', maximumActiveContacts: 0, active: true,
      flowId, flowTagId: 'Live',
      musicOnHoldId: row.musicOnHold, outdialQueueId: row.outdialQueue
    };
    const epResult = await WC.apiPost('/entry-point', epPayload);
    const epId = epResult?.id || '';
    created.entryPoints.set(epName.toLowerCase(), { id: epId, name: epResult?.name || epName });
    org.entryPoints.push({ id: epId, name: epResult?.name || epName, entryPointType: 'OUTBOUND' });

    return `${flowName} → ${epResult?.name || epName}`;
  }

  /* ════════════════════════════════════════════════════════════════
     DESKTOP PROFILES
  ════════════════════════════════════════════════════════════════ */
  const desktopProfilesSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetDesktopProfiles'),
    draftKey: 'cgDraftV1_desktopprofiles',
    cols: [
      { key: 'name', label: 'Name (optional)', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'team', label: 'Team', type: 'text', datalist: 'teamNamesList' },
      { key: 'screenPop', label: 'Screen Pop', type: 'checkbox', default: true },
      { key: 'autoAnswer', label: 'Auto Answer', type: 'checkbox' },
      { key: 'wrapMode', label: 'Wrap Up Mode', type: 'select', default: 'MANUAL', options: () => ([{ value: 'MANUAL', label: 'Manual' }, { value: 'AUTO', label: 'Auto' }]) },
      { key: 'wrapSeconds', label: 'Auto Wrap Seconds', type: 'number' },
      { key: 'dnEnabled', label: 'DN Login', type: 'checkbox', default: true },
      { key: 'extEnabled', label: 'Extension Login', type: 'checkbox' },
      { key: 'desktopEnabled', label: 'Desktop Login', type: 'checkbox', default: true },
      { key: 'wrapUpCodes', label: 'Wrap-Up Codes', type: 'text' },
      { key: 'idleCodes', label: 'Idle Codes', type: 'text' },
      { key: 'outdialEntryPoint', label: 'Outdial Entry Point', type: 'text' },
      { key: 'dialPlans', label: 'Dial Plans', type: 'text' },
      { key: 'consultChannels', label: 'Consult Channels', type: 'text' },
      { key: 'consultQueues', label: 'Consult Queues', type: 'text' },
      { key: 'buddyTeams', label: 'Buddy Teams', type: 'text' },
      { key: 'addressBook', label: 'Auto-create Address Book', type: 'checkbox' }
    ]
  });

  async function createAddressBook(name) {
    const body = await WC.apiPost('/v3/address-book', { name, description: 'Created by Orbit', parentType: 'ORGANIZATION' });
    return body?.id || '';
  }

  async function runDesktopProfileRow(row) {
    const teamRef = resolveEntity(created.teams, org.teams, row.team);
    if (!teamRef) throw new Error(`Team "${row.team}" not found — add it to the Teams tab or check your org's existing teams`);
    const baseName = (row.name || '').trim() || `${teamRef.name.replace(/\s+/g, '_')}_Profile`;

    const wrapModeValue = row.wrapMode || 'MANUAL';
    const autoWrapUp = wrapModeValue === 'AUTO';
    let autoWrapAfterSeconds;
    if (autoWrapUp) {
      if (!row.wrapSeconds) throw new Error('Auto wrap-up seconds is required when Wrap Up Mode is Auto');
      autoWrapAfterSeconds = Number(row.wrapSeconds);
      if (Number.isNaN(autoWrapAfterSeconds)) throw new Error('Auto wrap-up seconds must be a number');
    }

    const loginVoiceOptions = [];
    if (row.dnEnabled) loginVoiceOptions.push('AGENT_DN');
    if (row.extEnabled) loginVoiceOptions.push('EXTENSION');
    if (row.desktopEnabled) loginVoiceOptions.push('BROWSER');
    if (!loginVoiceOptions.length) throw new Error('At least one login type (DN, Extension, or Desktop) is required');

    const wrapUpAccess = (row.wrapUpCodes || '').trim() ? 'SPECIFIC' : 'ALL';
    let wrapUpCodeIds = [];
    if (wrapUpAccess === 'SPECIFIC') {
      const codes = org.auxCodes.filter((c) => c.workTypeCode === 'WRAP_UP_CODE');
      const { ids, missing } = resolveList(new Map(), codes, row.wrapUpCodes);
      if (missing.length) throw new Error(`Wrap-up code(s) not found: ${missing.join(', ')}`);
      wrapUpCodeIds = ids;
    }
    const idleAccess = (row.idleCodes || '').trim() ? 'SPECIFIC' : 'ALL';
    let idleCodeIds = [];
    if (idleAccess === 'SPECIFIC') {
      const codes = org.auxCodes.filter((c) => c.workTypeCode === 'IDLE_CODE');
      const { ids, missing } = resolveList(new Map(), codes, row.idleCodes);
      if (missing.length) throw new Error(`Idle code(s) not found: ${missing.join(', ')}`);
      idleCodeIds = ids;
    }

    const consultAccess = ((row.consultChannels || '').trim() || (row.consultQueues || '').trim()) ? 'SPECIFIC' : 'ALL';
    let channelTargets = []; let queueTargets = [];
    if (consultAccess === 'SPECIFIC') {
      if ((row.consultChannels || '').trim()) {
        const { ids, missing } = resolveList(created.entryPoints, org.entryPoints.filter((e) => e.entryPointType !== 'OUTBOUND'), row.consultChannels);
        if (missing.length) throw new Error(`Consult channel(s) not found: ${missing.join(', ')}`);
        channelTargets = ids;
      }
      if ((row.consultQueues || '').trim()) {
        const { ids, missing } = resolveList(created.queues, org.queues, row.consultQueues);
        if (missing.length) throw new Error(`Consult queue(s) not found: ${missing.join(', ')}`);
        queueTargets = ids;
      }
    }

    const buddyNames = (row.buddyTeams || '').trim() || teamRef.name;
    const { ids: buddyIds, missing: buddyMissing } = resolveList(created.teams, org.teams, buddyNames);
    if (buddyMissing.length) throw new Error(`Buddy team(s) not found: ${buddyMissing.join(', ')}`);

    const outdialCandidates = org.entryPoints.filter((e) => e.entryPointType === 'OUTBOUND');
    const outdialEp = byNameLower(outdialCandidates, row.outdialEntryPoint);
    if (!outdialEp) throw new Error(`Outdial entry point "${row.outdialEntryPoint}" not found — it must already exist in the org`);

    if (!(row.dialPlans || '').trim()) throw new Error('At least one dial plan is required');
    const { ids: dialPlanIds, missing: dialPlanMissing } = resolveList(new Map(), org.dialPlans, row.dialPlans);
    if (dialPlanMissing.length) throw new Error(`Dial plan(s) not found: ${dialPlanMissing.join(', ')}`);

    const payload = {
      name: baseName, description: row.description || '', parentType: 'ORGANIZATION',
      screenPopup: !!row.screenPop, lastAgentRouting: false, autoWrapUp, autoAnswer: !!row.autoAnswer,
      agentAvailableAfterOutdial: false, allowAutoWrapUpExtension: false,
      accessWrapUpCode: wrapUpAccess, wrapUpCodes: wrapUpCodeIds,
      accessIdleCode: idleAccess, idleCodes: idleCodeIds,
      accessQueue: consultAccess, queues: queueTargets,
      accessEntryPoint: consultAccess, entryPoints: channelTargets,
      accessBuddyTeam: 'SPECIFIC', buddyTeams: buddyIds,
      consultToQueue: false, outdialEnabled: true, outdialEntryPointId: outdialEp.id,
      dialPlanEnabled: true, dialPlans: dialPlanIds, agentDNValidation: 'NONE', loginVoiceOptions,
      viewableStatistics: { agentStats: true, accessQueueStats: 'ALL', contactServiceQueues: [], loggedInTeamStats: true, accessTeamStats: 'ALL', teams: [] },
      active: true, stateSynchronizationMS: true, showUserDetailsWebex: false, stateSynchronizationWebex: false
    };
    if (autoWrapUp) payload.autoWrapAfterSeconds = autoWrapAfterSeconds;

    if (row.addressBook) {
      const addressBookId = await createAddressBook(`${teamRef.name}_AddressBook`);
      if (addressBookId) payload.addressBookId = addressBookId;
    }

    const body = await WC.apiPost('/agent-profile', payload);
    const created_ = { id: body?.id || '', name: body?.name || baseName };
    created.profiles.set(baseName.toLowerCase(), created_);
    return created_.name;
  }

  /* ════════════════════════════════════════════════════════════════
     USERS
  ════════════════════════════════════════════════════════════════ */
  const usersSheet = WC.createSheet({
    tableEl: document.getElementById('cgSheetUsers'),
    draftKey: 'cgDraftV1_users',
    cols: [
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'role', label: 'Role', type: 'select', default: 'agent', options: () => ([{ value: 'agent', label: 'Agent' }, { value: 'supervisor', label: 'Supervisor' }]) },
      { key: 'team', label: 'Team', type: 'text', datalist: 'teamNamesList' },
      { key: 'desktopProfile', label: 'Desktop Profile', type: 'text' },
      { key: 'site', label: 'Site (optional override)', type: 'text' }
    ]
  });

  const WEBEX_PUT_FIELDS = ['emails','displayName','firstName','lastName','avatar','orgId','roles','licenses','department','title','addresses','manager','siteUrls','loginEnabled','pronouns','city','state','country','zipCode'];
  let ccLicenses = [];

  function resolveWebexOrgId() {
    const stored = (localStorage.getItem('authOrgId') || '').trim();
    if (/^Y2lz/i.test(stored)) return stored;
    const raw = (localStorage.getItem('authOrg') || '').trim();
    if (/^Y2lz/i.test(raw)) return raw;
    try { return btoa(`ciscospark://us/ORGANIZATION/${WC.ORG_ID}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
    catch { return WC.ORG_ID; }
  }
  const WEBEX_ORG_ID = resolveWebexOrgId();

  async function loadCcLicenses() {
    try {
      const r = await fetch(`${WC.WEBEX_BASE}/v1/licenses`, { headers: WC.fetchHeaders });
      const d = await r.json().catch(() => ({}));
      const items = Array.isArray(d.items) ? d.items : [];
      ccLicenses = items.filter((l) => {
        const n = (l.name || l.displayName || '').toLowerCase();
        return (n.includes('contact center') || n.includes('wxcc')) && (n.includes('agent') || n.includes('supervisor'));
      }).map((l) => ({ id: l.id, name: l.name || l.displayName || l.id, isSupervisor: /supervisor/i.test(l.name || l.displayName || '') }));
    } catch { ccLicenses = []; }
  }

  function pickCcLicense(role) {
    const wantSupervisor = role === 'supervisor';
    return ccLicenses.find((l) => l.isSupervisor === wantSupervisor) || ccLicenses[0] || null;
  }

  async function provisionUserRow(row) {
    const email = (row.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) throw new Error('A valid email is required');
    const role = row.role || 'agent';

    const siteSelect = document.getElementById('cgUsersSiteSelect');
    let siteId = '';
    if ((row.site || '').trim()) {
      const site = byNameLower(org.sites, row.site);
      if (!site) throw new Error(`Site "${row.site}" not found`);
      siteId = site.id;
    } else {
      siteId = siteSelect?.value || '';
    }

    let teamId = '';
    if ((row.team || '').trim()) {
      const team = resolveEntity(created.teams, org.teams, row.team);
      if (!team) throw new Error(`Team "${row.team}" not found — add it to the Teams tab or check your org's existing teams`);
      teamId = team.id;
    }

    let agentProfileId = '';
    if ((row.desktopProfile || '').trim()) {
      const profile = created.profiles.get(row.desktopProfile.trim().toLowerCase());
      if (!profile) throw new Error(`Desktop Profile "${row.desktopProfile}" not found — create it in this run's Desktop Profiles tab first`);
      agentProfileId = profile.id;
    }

    const ccLic = pickCcLicense(role);

    /* Step 1: look up the Webex person, assign a CC license if missing */
    const pr = await fetch(`${WC.WEBEX_BASE}/v1/people?email=${encodeURIComponent(email)}&max=1`, { headers: WC.fetchHeaders });
    const pd = await pr.json().catch(() => ({}));
    const person = (pd.items || [])[0];
    if (!person) throw new Error('User not found in Webex — check the email address');

    const dr = await fetch(`${WC.WEBEX_BASE}/v1/people/${encodeURIComponent(person.id)}`, { headers: WC.fetchHeaders });
    const dd = await dr.json().catch(() => ({}));
    const existingLicenses = Array.isArray(dd.licenses) ? dd.licenses : [];
    let licenseJustAssigned = false;
    if (ccLic && !existingLicenses.includes(ccLic.id)) {
      const putBody = {};
      WEBEX_PUT_FIELDS.forEach((key) => {
        if (key === 'licenses') { putBody.licenses = [...existingLicenses, ccLic.id]; return; }
        if (Object.prototype.hasOwnProperty.call(dd, key)) putBody[key] = dd[key];
      });
      if (!putBody.orgId) putBody.orgId = dd.orgId || person.orgId || '';
      const lr = await fetch(`${WC.WEBEX_BASE}/v1/people/${encodeURIComponent(person.id)}`, {
        method: 'PUT', headers: { ...WC.fetchHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(putBody)
      });
      if (!lr.ok) {
        const le = await lr.json().catch(() => ({}));
        throw new Error(le?.message || le?.errors?.[0]?.description || `License assignment failed (HTTP ${lr.status})`);
      }
      const lrBody = await lr.json().catch(() => ({}));
      const appliedLicenses = Array.isArray(lrBody.licenses) ? lrBody.licenses : [];
      if (!appliedLicenses.includes(ccLic.id)) {
        throw new Error('Webex did not apply the CC license — the token may lack license-management permissions. Assign it manually in Control Hub, then run again.');
      }
      licenseJustAssigned = true;
    }

    /* Step 2: find/wait for the user in WxCC */
    let wxccUser = null;
    const maxAttempts = licenseJustAssigned ? 6 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
      const wr = await fetch(`${WC.BASE_URL}/v2/user?filter=${encodeURIComponent(`email=="${email}"`)}&page=0&pageSize=1`, { headers: WC.fetchHeaders });
      const wd = await wr.json().catch(() => ({}));
      const wus = Array.isArray(wd) ? wd : (wd?.data ?? []);
      if (wus[0]?.id) { wxccUser = wus[0]; break; }
    }
    if (!wxccUser?.id) {
      throw new Error(licenseJustAssigned
        ? 'License was assigned but WxCC sync is taking longer than expected — try again in a few minutes'
        : 'Not yet in WxCC — assign a CC license first, or check the email');
    }

    /* Step 3: update the WxCC user */
    const updateBody = {
      loginEnabled: true,
      firstName: wxccUser.firstName || person.firstName || '',
      lastName: wxccUser.lastName || person.lastName || ''
    };
    if (wxccUser.userProfileId) updateBody.userProfileId = wxccUser.userProfileId;
    if (agentProfileId) updateBody.agentProfileId = agentProfileId;
    if (teamId) updateBody.teamIds = [teamId];
    if (siteId) updateBody.siteId = siteId;

    const ur = await fetch(`${WC.BASE_URL}/user/${wxccUser.id}`, {
      method: 'PUT', headers: { ...WC.fetchHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(updateBody)
    });
    if (!ur.ok) {
      const ue = await ur.json().catch(() => ({}));
      throw new Error(ue?.error?.message?.[0]?.description || ue?.error?.reason || ue?.message || `WxCC update failed (HTTP ${ur.status})`);
    }
    return email;
  }

  /* ════════════════════════════════════════════════════════════════
     Tab wiring, run buttons, Run All, CSV template/upload, boot
  ════════════════════════════════════════════════════════════════ */
  const TABS = {
    teams: { sheet: teamsSheet, run: (row) => runTeamRow(row), entityLabel: 'team(s)', delayMs: 0 },
    businesshours: { sheet: businessHoursSheet, run: (row) => runBusinessHoursRow(row), entityLabel: 'business hours schedule(s)', delayMs: 0 },
    skills: { sheet: skillsSheet, run: (row) => runSkillRow(row), entityLabel: 'skill(s)', delayMs: 0 },
    queues: { sheet: queuesSheet, run: (row) => runQueueRow(row), entityLabel: 'queue(s)', delayMs: 1400, beforeRun: validateQueueSettings },
    flows: { sheet: flowsSheet, run: (row) => runFlowRow(row), entityLabel: 'flow(s)', delayMs: 1000, beforeRun: () => (activeFlowTemplate ? null : 'Select a Template Source before running Flows.') },
    entrypoints: { sheet: entryPointsSheet, run: (row, i) => runEntryPointRow(row, i, entryPointsSheet), entityLabel: 'inbound entry point(s)', delayMs: 0 },
    outbound: { sheet: outboundSheet, run: (row, i) => runOutboundRow(row, i, outboundSheet), entityLabel: 'outbound flow(s)/entry point(s)', delayMs: 1000 },
    desktopprofiles: { sheet: desktopProfilesSheet, run: (row) => runDesktopProfileRow(row), entityLabel: 'desktop profile(s)', delayMs: 0 },
    users: { sheet: usersSheet, run: (row) => provisionUserRow(row), entityLabel: 'user(s)', delayMs: 0 }
  };
  const TAB_ORDER = ['teams', 'businesshours', 'skills', 'queues', 'flows', 'entrypoints', 'outbound', 'desktopprofiles', 'users'];
  const RESULTS_EL = {
    teams: document.getElementById('cgResultsTeams'),
    businesshours: document.getElementById('cgResultsBusinessHours'),
    skills: document.getElementById('cgResultsSkills'),
    queues: document.getElementById('cgResultsQueues'),
    flows: document.getElementById('cgResultsFlows'),
    entrypoints: document.getElementById('cgResultsEntryPoints'),
    outbound: document.getElementById('cgResultsOutbound'),
    desktopprofiles: document.getElementById('cgResultsDesktopProfiles'),
    users: document.getElementById('cgResultsUsers')
  };

  async function runTab(key) {
    const tab = TABS[key];
    const runnable = tab.sheet.getRunnableRows();
    if (!runnable.length) return;
    if (!WC.authToken) { document.getElementById('cgAuthNote').classList.remove('hidden'); return; }
    if (tab.beforeRun) {
      const err = tab.beforeRun();
      if (err) { await showConfirmModal({ title: 'Missing required setting', body: err, okLabel: 'OK' }); return; }
    }
    const labels = runnable.map(({ row, index }) => row.name || row.email || `Row ${index + 1}`);
    const modal = runProgressModal(`Creating ${tab.entityLabel}…`, labels);
    let pos = -1;
    const results = await WC.runRows(runnable, (row, index) => tab.run(row, index), {
      delayMs: tab.delayMs,
      shouldStop: () => modal.isCancelled(),
      onProgress: (index, state, detail) => {
        tab.sheet.setRowStatus(index, state, detail);
        if (state === 'active') pos++;
        modal.update(pos, state, detail);
      }
    });
    WC.renderResultsBox(RESULTS_EL[key], results, tab.entityLabel);
    modal.finish();
  }

  document.querySelectorAll('[data-run-tab]').forEach((btn) => {
    btn.addEventListener('click', () => { btn.disabled = true; runTab(btn.getAttribute('data-run-tab')).finally(() => { btn.disabled = false; }); });
  });

  document.getElementById('cgRunAllBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    for (const key of TAB_ORDER) await runTab(key);
    e.target.disabled = false;
  });

  document.getElementById('cgClearAllBtn').addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
      title: 'Clear every tab?',
      body: 'Every row on every tab (Teams, Business Hours, Skills, Queues, Entry Points, Desktop Profiles, Users) will be removed. This cannot be undone.',
      okLabel: 'Clear All'
    });
    if (!confirmed) return;
    TAB_ORDER.forEach((key) => TABS[key].sheet.clearAll());
  });

  document.querySelectorAll('[data-download-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-download-template');
      WC.downloadCsvTemplate(sheetCols(key), `bulkimport_${key}_template.csv`);
    });
  });
  document.querySelectorAll('[data-upload-csv]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.getAttribute('data-upload-csv');
      if (!input.files[0]) return;
      // Use the sheet's real column defs (not the label-only sheetCols() map) so
      // select-backed columns (Music On Hold, Skill Name, ...) resolve pasted
      // text against the live option list instead of storing raw text.
      WC.uploadCsv(input.files[0], TABS[key].sheet.cols, (incoming) => {
        const sheet = TABS[key].sheet;
        const existing = sheet.getRows().filter((r) => !sheet.isRowEmpty(r));
        existing.push(...incoming);
        WC.saveDraft(`cgDraftV1_${key}`, existing);
        location.reload();
      });
      input.value = '';
    });
  });
  document.querySelectorAll('[data-clear-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-clear-tab');
      const confirmed = await showConfirmModal({
        title: 'Clear this tab?',
        body: 'Every row on this tab will be removed. This cannot be undone.',
        okLabel: 'Clear All'
      });
      if (!confirmed) return;
      TABS[key].sheet.clearAll();
    });
  });

  function sheetCols(key) {
    const map = {
      teams: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'site', label: 'Site' }, { key: 'desktopLayout', label: 'Desktop Layout' }],
      businesshours: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'timezone', label: 'Timezone' }, { key: 'holiday', label: 'Holiday List' }, { key: 'createOverride', label: 'Create Override' }],
      skills: [{ key: 'name', label: 'Name' }, { key: 'skillType', label: 'Skill Type' }, { key: 'slt', label: 'Service Level Threshold' }, { key: 'description', label: 'Description' }],
      queues: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'team', label: 'Team' }, { key: 'skillName', label: 'Skill Name' }, { key: 'skillRouting', label: 'Skill Routing' }, { key: 'skillCondition', label: 'Skill Condition' }, { key: 'skillValue', label: 'Skill Value' }],
      flows: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'queue', label: 'Queue' }, { key: 'businessHours', label: 'Business Hours' }],
      entrypoints: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'flow', label: 'Flow' }, { key: 'musicOnHold', label: 'Music On Hold' }],
      outbound: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description' }, { key: 'outdialQueue', label: 'Outdial Queue' }, { key: 'musicOnHold', label: 'Music On Hold' }, { key: 'callerIdLocation', label: 'Caller ID Location' }, { key: 'callerIdNumber', label: 'Caller ID Number' }],
      desktopprofiles: [{ key: 'name', label: 'Name (optional)' }, { key: 'description', label: 'Description' }, { key: 'team', label: 'Team' }, { key: 'outdialEntryPoint', label: 'Outdial Entry Point' }, { key: 'dialPlans', label: 'Dial Plans' }],
      users: [{ key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'team', label: 'Team' }, { key: 'desktopProfile', label: 'Desktop Profile' }]
    };
    return map[key] || [];
  }

  document.querySelectorAll('.cg-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.cg-tab').forEach((b) => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      tabBtn.classList.add('active');
      tabBtn.setAttribute('aria-selected', 'true');
      const key = tabBtn.getAttribute('data-tab');
      document.querySelectorAll('.cg-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-panel') === key));
    });
  });

  (async () => {
    if (!WC.authToken) document.getElementById('cgAuthNote').classList.remove('hidden');
    teamsSheet.render();
    businessHoursSheet.render();
    skillsSheet.render();
    queuesSheet.render();
    flowsSheet.render();
    entryPointsSheet.render();
    outboundSheet.render();
    desktopProfilesSheet.render();
    usersSheet.render();
    await loadOrgData();
    await loadCcLicenses();
    refreshTeamNamesDatalist();
    teamsSheet.render();
    businessHoursSheet.render();
    skillsSheet.render();
    queuesSheet.render();
    flowsSheet.render();
    entryPointsSheet.render();
    outboundSheet.render();
    desktopProfilesSheet.render();
    const siteSelect = document.getElementById('cgUsersSiteSelect');
    siteSelect.innerHTML = opts(org.sites).map((o) => `<option value="${o.value}">${WC.escHtml(o.label)}</option>`).join('');
    WC.enhanceSelect(siteSelect);
    const moh = document.getElementById('cgQueueMusicOnHold');
    moh.innerHTML = '<option value=""></option>' + opts(org.musicFiles).map((o) => `<option value="${o.value}">${WC.escHtml(o.label)}</option>`).join('');
    const refreshMoh = WC.enhanceSelect(moh);
    restoreQueueSettings();
    refreshMoh();
    document.querySelectorAll('#cgQueueSettingsPanel input, #cgQueueSettingsPanel select').forEach((el) => {
      el.addEventListener('change', persistQueueSettings);
      el.addEventListener('input', persistQueueSettings);
    });
    document.querySelectorAll('#cgQueueTypeGrid .queue-type-card').forEach((card) => {
      if (card.hasAttribute('disabled')) return;
      card.addEventListener('click', () => setQueueTypeMode(card.getAttribute('data-queue-type')));
    });
    setQueueTypeMode(queueTypeMode);

    document.querySelectorAll('#cgFlowTemplateModeGrid .queue-type-card').forEach((card) => {
      card.addEventListener('click', () => setFlowTemplateMode(card.getAttribute('data-template-mode')));
    });
    document.getElementById('cgFlowCopySelect').addEventListener('change', async (e) => {
      const flowId = e.target.value;
      if (!flowId) return;
      const status = document.getElementById('cgFlowTemplateStatus');
      status.textContent = 'Loading flow…';
      try {
        activeFlowTemplate = await fetchFlowExportJson(flowId);
        clearTemplateDependentRowState();
        status.textContent = `Using "${e.target.selectedOptions[0].textContent}" as the template.`;
        flowsSheet.render();
      } catch (err) { status.textContent = `Could not load flow: ${err.message}`; }
    });
    await setFlowTemplateMode('static');
  })();
})();
