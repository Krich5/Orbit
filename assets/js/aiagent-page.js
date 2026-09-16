(function () {
  const KEYS = { bearer: 'authBearer', org: 'authOrg', orgName: 'authOrgName', user: 'authUserName' };
  const FLOW_PROXY = window.ORBIT_PROXY_BASE + '/flows';
  const DEFAULT_PROJECT_ID = '5e5c9ad6d61f870d6d778c1b';
  const AI_UTIL_GLOBAL_VARIABLES = [
    {
      name: 'vAgent_Call_Status',
      description: 'Used for AI Agent Utilization',
      active: true,
      variableType: 'String',
      defaultValue: 'null',
      reportable: true,
      agentViewable: false,
      agentEditable: false,
      sensitive: false,
      desktopLabel: '',
      systemDefault: false
    },
    {
      name: 'vAgent_Session_Used',
      description: 'Used for AI Agent Utilization',
      active: true,
      variableType: 'Integer',
      defaultValue: '0',
      reportable: true,
      agentViewable: false,
      agentEditable: false,
      sensitive: false,
      desktopLabel: '',
      systemDefault: false
    },
    {
      name: 'vAgent_Start_Time',
      description: 'Used for AI Agent Utilization',
      active: true,
      variableType: 'Integer',
      defaultValue: '0',
      reportable: false,
      agentViewable: false,
      agentEditable: false,
      sensitive: false,
      desktopLabel: '',
      systemDefault: false
    },
    {
      name: 'vAgent_Total_Duration',
      description: 'Used for AI Agent Utilization',
      active: true,
      variableType: 'Integer',
      defaultValue: '0',
      reportable: true,
      agentViewable: false,
      agentEditable: false,
      sensitive: false,
      desktopLabel: '',
      systemDefault: false
    }
  ];
  const AUTONOMOUS_CHAR_LIMIT = 5120;
  const AI_UTIL_SUBFLOW_KEYS = ['start', 'end', 'contactEnd'];
  const AI_UTIL_SUBFLOW_ASSETS = {
    start: { fileName: 'vAgent_Start_Time_Subflow.json', path: '../../assets/ai_utilization/vAgent_Start_Time_Subflow.json' },
    end: { fileName: 'vAgent_End_Time_Subflow.json', path: '../../assets/ai_utilization/vAgent_End_Time_Subflow.json' },
    contactEnd: { fileName: 'vAgent_ContactEnd_Subflow.json', path: '../../assets/ai_utilization/vAgent_ContactEnd_Subflow.json' }
  };
  const envOptions = [
    { label: 'US Prod (Direct Service)', value: 'https://api-ai-assistant.produs1.ciscoccservice.com/summary/list' },
    { label: 'Canada Prod (Direct Service)', value: 'https://api-ai-assistant.prodca1.ciscoccservice.com/summary/list' },
    { label: 'EU1 Prod (London, Direct Service)', value: 'https://api-ai-assistant.prodeu1.ciscoccservice.com/summary/list' },
    { label: 'EU2 Prod (Frankfurt, Direct Service)', value: 'https://api-ai-assistant.prodeu2.ciscoccservice.com/summary/list' },
    { label: 'Singapore Prod (Direct Service)', value: 'https://api-ai-assistant.prodsg1.ciscoccservice.com/summary/list' },
    { label: 'Japan Prod (Direct Service)', value: 'https://api-ai-assistant.prodjp1.ciscoccservice.com/summary/list' },
    { label: 'Australia Prod (Direct Service)', value: 'https://api-ai-assistant.prodanz1.ciscoccservice.com/summary/list' },
    { label: 'INTG US1 (Non-Prod, Direct Service)', value: 'https://api-ai-assistant.intgus1.ciscoccservice.com/summary/list' },
    { label: 'QA US1 (Non-Prod, Direct Service)', value: 'https://api-ai-assistant.qaus1.ciscoccservice.com/summary/list' },
    { label: 'LOAD US1 (Non-Prod, Direct Service)', value: 'https://api-ai-assistant.loadus1.ciscoccservice.com/summary/list' }
  ];

  let summaryTypeSelect;
  let searchTypeSelect;
  let startInput;
  let endInput;
  let agentIdInput;
  let interactionIdInput;
  let runBtn;
  let responseBox;
  let userNameEl;
  let userOrgEl;
  let signOutBtn;
  let botJsonFileInput;
  let botFileNameDisplay;
  let loadBotBtn;
  let clearBotBtn;
  let botErrorBox;
  let studioListWrap;
  let studioDetailWrap;
  let studioFlowCanvas;
  let studioSplitPanel;
  let studioTabs;
  let modeTabs;
  let modePanels;
  let aiUtilPackageSummary;
  let aiUtilErrorBox;
  let aiUtilLogBox;
  let runAiUtilBtn;
  let aiUtilOverlay;
  let aiUtilOverlayLabel;
  let aiUtilOverlayDetail;
  let aiUtilPhaseGlobals;
  let aiUtilPhaseSubflows;
  let aiUtilPhasePublish;
  let aiUtilTaskLog;
  let autoGoalInput;
  let autoInstructionsInput;
  let autoGoalCounter;
  let autoInstructionsCounter;
  let autoTotalCounter;
  let autoLimitError;
  let autoClearBtn;

  const browserState = {
    botData: null,
    model: null,
    activeTab: 'intents',
    selected: {
      intents: '',
      entities: '',
      responses: ''
    },
    responseViewMode: 'actions',
    responseChannel: 'web',
    responseConditionName: ''
  };

  const pageState = {
    activeMode: 'visualizer',
    aiUtilSubflows: {
      start: null,
      end: null,
      contactEnd: null
    },
    aiUtilAssetsLoaded: false
  };

  function initDomRefs() {
    summaryTypeSelect = document.getElementById('summaryTypeSelect');
    searchTypeSelect = document.getElementById('searchTypeSelect');
    startInput = document.getElementById('startInput');
    endInput = document.getElementById('endInput');
    agentIdInput = document.getElementById('agentIdInput');
    interactionIdInput = document.getElementById('interactionIdInput');
    runBtn = document.getElementById('runBtn');
    responseBox = document.getElementById('responseBox');
    userNameEl = document.getElementById('userName');
    userOrgEl = document.getElementById('userOrg');
    signOutBtn = document.getElementById('signOutBtn');
    botJsonFileInput = document.getElementById('botJsonFileInput');
    botFileNameDisplay = document.getElementById('botFileNameDisplay');
    loadBotBtn = document.getElementById('loadBotBtn');
    clearBotBtn = document.getElementById('clearBotBtn');
    botErrorBox = document.getElementById('botErrorBox');
    studioListWrap = document.getElementById('studioListWrap');
    studioDetailWrap = document.getElementById('studioDetailWrap');
    studioFlowCanvas = document.getElementById('studioFlowCanvas');
    studioSplitPanel = document.getElementById('studioSplitPanel');
    studioTabs = Array.from(document.querySelectorAll('.aiagent-studio-tab'));
    modeTabs = Array.from(document.querySelectorAll('.aiagent-mode-tab'));
    modePanels = Array.from(document.querySelectorAll('[data-mode-panel]'));
    aiUtilPackageSummary = document.getElementById('aiUtilPackageSummary');
    aiUtilErrorBox = document.getElementById('aiUtilErrorBox');
    aiUtilLogBox = document.getElementById('aiUtilLogBox');
    runAiUtilBtn = document.getElementById('runAiUtilBtn');
    aiUtilOverlay = document.getElementById('aiUtilOverlay');
    aiUtilOverlayLabel = document.getElementById('aiUtilOverlayLabel');
    aiUtilOverlayDetail = document.getElementById('aiUtilOverlayDetail');
    aiUtilPhaseGlobals = document.getElementById('aiUtilPhaseGlobals');
    aiUtilPhaseSubflows = document.getElementById('aiUtilPhaseSubflows');
    aiUtilPhasePublish = document.getElementById('aiUtilPhasePublish');
    aiUtilTaskLog = document.getElementById('aiUtilTaskLog');
    autoGoalInput = document.getElementById('autoGoalInput');
    autoInstructionsInput = document.getElementById('autoInstructionsInput');
    autoGoalCounter = document.getElementById('autoGoalCounter');
    autoInstructionsCounter = document.getElementById('autoInstructionsCounter');
    autoTotalCounter = document.getElementById('autoTotalCounter');
    autoLimitError = document.getElementById('autoLimitError');
    autoClearBtn = document.getElementById('autoClearBtn');
  }

  function initializeHeader() {
    if (userNameEl) userNameEl.textContent = localStorage.getItem(KEYS.user) || 'Signed in';
    if (userOrgEl) userOrgEl.textContent = localStorage.getItem(KEYS.orgName) || localStorage.getItem(KEYS.org) || '';

    signOutBtn?.addEventListener('click', () => {
      Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem('authOrgId');
      localStorage.removeItem('authRefreshToken');
      localStorage.removeItem('authExpiresAt');
      window.location.href = '../../index.html';
    });
  }

  function clearDefaultTimes() {
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  }

  function setActiveMode(mode) {
    pageState.activeMode = mode;
    modeTabs.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    modePanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.modePanel !== mode);
    });
    if (mode === 'utilization') ensureAiUtilAssetsLoaded();
  }

  function bindModeEvents() {
    modeTabs.forEach((button) => {
      button.addEventListener('click', () => setActiveMode(button.dataset.mode || 'visualizer'));
    });
  }

  function setStatus(message) {
    if (!responseBox || !message) return;
    responseBox.textContent = message;
  }

  function showBotError(message = '') {
    if (!botErrorBox) return;
    botErrorBox.textContent = message;
    botErrorBox.classList.toggle('hidden', !message);
  }

  function showAiUtilError(message = '') {
    if (!aiUtilErrorBox) return;
    aiUtilErrorBox.textContent = message;
    aiUtilErrorBox.classList.toggle('hidden', !message);
  }

  function showAutonomousLimitError(message = '') {
    if (!autoLimitError) return;
    autoLimitError.textContent = message;
    autoLimitError.classList.toggle('hidden', !message);
  }

  function setAutonomousCounterState(el, length, otherLength) {
    if (!el) return;
    el.textContent = `${length} characters`;
    const combined = length + otherLength;
    el.classList.toggle('is-limit', combined >= AUTONOMOUS_CHAR_LIMIT);
    el.classList.toggle('is-warning', !el.classList.contains('is-limit') && combined >= AUTONOMOUS_CHAR_LIMIT * 0.8);
  }

  function updateAutonomousCounters() {
    const goalLength = autoGoalInput?.value.length || 0;
    const instructionsLength = autoInstructionsInput?.value.length || 0;
    const total = goalLength + instructionsLength;

    setAutonomousCounterState(autoGoalCounter, goalLength, instructionsLength);
    setAutonomousCounterState(autoInstructionsCounter, instructionsLength, goalLength);

    if (autoTotalCounter) {
      autoTotalCounter.textContent = `${total.toLocaleString()} / ${AUTONOMOUS_CHAR_LIMIT.toLocaleString()} characters`;
      autoTotalCounter.classList.toggle('is-limit', total >= AUTONOMOUS_CHAR_LIMIT);
      autoTotalCounter.classList.toggle('is-warning', total < AUTONOMOUS_CHAR_LIMIT && total >= AUTONOMOUS_CHAR_LIMIT * 0.8);
    }
  }

  function enforceAutonomousLimit(changedInput, otherInput) {
    if (!changedInput) return;
    const otherLength = otherInput?.value.length || 0;
    const maxAllowed = Math.max(0, AUTONOMOUS_CHAR_LIMIT - otherLength);
    if (changedInput.value.length > maxAllowed) {
      const cursor = changedInput.selectionStart || 0;
      changedInput.value = changedInput.value.slice(0, maxAllowed);
      changedInput.selectionStart = changedInput.selectionEnd = Math.min(cursor, maxAllowed);
      showAutonomousLimitError('5,120 character limit reached — extra text was trimmed.');
    } else {
      showAutonomousLimitError('');
    }
    updateAutonomousCounters();
  }

  function clearAutonomousInstructions() {
    if (autoGoalInput) autoGoalInput.value = '';
    if (autoInstructionsInput) autoInstructionsInput.value = '';
    showAutonomousLimitError('');
    updateAutonomousCounters();
  }

  function bindAutonomousEvents() {
    autoGoalInput?.addEventListener('input', () => enforceAutonomousLimit(autoGoalInput, autoInstructionsInput));
    autoInstructionsInput?.addEventListener('input', () => enforceAutonomousLimit(autoInstructionsInput, autoGoalInput));
    autoClearBtn?.addEventListener('click', clearAutonomousInstructions);
    updateAutonomousCounters();
  }

  function setAiUtilLog(message) {
    if (aiUtilLogBox) aiUtilLogBox.textContent = message || 'Import log will appear here…';
    if (aiUtilTaskLog) aiUtilTaskLog.textContent = message || 'Task progress will appear here…';
  }

  function appendAiUtilLog(message) {
    if (!aiUtilLogBox) return;
    const current = aiUtilLogBox.textContent === 'Import log will appear here…' ? '' : aiUtilLogBox.textContent;
    aiUtilLogBox.textContent = current ? `${current}\n${message}` : message;
    if (aiUtilTaskLog) {
      const overlayCurrent = aiUtilTaskLog.textContent === 'Task progress will appear here…' ? '' : aiUtilTaskLog.textContent;
      aiUtilTaskLog.textContent = overlayCurrent ? `${overlayCurrent}\n${message}` : message;
      aiUtilTaskLog.scrollTop = aiUtilTaskLog.scrollHeight;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLabel(text) {
    if (!text) return '';
    return String(text)
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatId(id) {
    return !id || typeof id !== 'string' ? '' : id;
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function getTextLines(actionGroup) {
    const groups = Array.isArray(actionGroup) ? actionGroup : [];
    return groups.flatMap((item) => Array.isArray(item?.text) ? item.text : []).filter(Boolean);
  }

  function getPayloadActions(actionGroup) {
    const groups = Array.isArray(actionGroup) ? actionGroup : [];
    return groups.flatMap((item) => Array.isArray(item?.payload) ? item.payload : []).filter(Boolean);
  }

  function getTemplateVariant(template) {
    const variants = template?.variants || {};
    return variants['en-US'] || variants[Object.keys(variants)[0]] || null;
  }

  function summarizePayload(payload) {
    const request = payload?.Execute_Request || {};
    const params = request?.Data?.Params || {};
    return {
      eventName: request?.Event_Name || Object.keys(payload || {})[0] || 'Custom Event',
      params
    };
  }

  function normalizeOperator(value) {
    const map = {
      '==': 'Equals to',
      '===': 'Equals to',
      '=': 'Equals to',
      eq: 'Equals to',
      equals: 'Equals to',
      '!=': 'Not equal to',
      '!==': 'Not equal to',
      ne: 'Not equal to',
      notequals: 'Not equal to',
      contains: 'Contains',
      in: 'In',
      gt: 'Greater than',
      '>': 'Greater than',
      gte: 'Greater than or equal to',
      '>=': 'Greater than or equal to',
      lt: 'Less than',
      '<': 'Less than',
      lte: 'Less than or equal to',
      '<=': 'Less than or equal to'
    };
    const key = String(value || '').toLowerCase().replace(/\s+/g, '');
    return map[key] || toLabel(value || 'Equals to');
  }

  function getRuleLeaf(condition) {
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return null;
    const left = condition.var || condition.left_variable || condition.leftVariable || condition.left || condition.field;
    const right = condition.value || condition.right_variable || condition.rightVariable || condition.right;
    const operator = condition.operator || condition.op || condition.comparator || condition.condition;
    const dataType = condition.data_type || condition.datatype || condition.type || condition.value_type || '';
    if (!left && !right && !operator) return null;
    return {
      left: String(left || '—'),
      operator: normalizeOperator(operator),
      right: String(right || '—'),
      dataType: String(dataType || typeof right || 'string')
    };
  }

  function flattenRuleClauses(condition, joiner = 'IF', clauses = []) {
    if (Array.isArray(condition)) {
      condition.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'AND', clauses));
      return clauses;
    }
    if (!condition || typeof condition !== 'object') return clauses;

    const leaf = getRuleLeaf(condition);
    if (leaf) {
      clauses.push({ joiner, ...leaf });
      return clauses;
    }

    if (Array.isArray(condition.all)) {
      condition.all.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'AND', clauses));
      return clauses;
    }
    if (Array.isArray(condition.and)) {
      condition.and.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'AND', clauses));
      return clauses;
    }
    if (Array.isArray(condition.any)) {
      condition.any.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'OR', clauses));
      return clauses;
    }
    if (Array.isArray(condition.or)) {
      condition.or.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'OR', clauses));
      return clauses;
    }
    if (Array.isArray(condition.conditions)) {
      condition.conditions.forEach((entry, index) => flattenRuleClauses(entry, index === 0 ? joiner : 'AND', clauses));
      return clauses;
    }

    Object.values(condition).forEach((entry) => {
      if (entry && typeof entry === 'object') flattenRuleClauses(entry, joiner, clauses);
    });
    return clauses;
  }

  function getConditionMeta(conditionEntry, index) {
    if (!conditionEntry) {
      return { label: 'Default response', summary: 'Triggered when no condition is added or fulfilled.' };
    }
    const clauses = flattenRuleClauses(conditionEntry.condition);
    if (!clauses.length) {
      return { label: normalizeConditionLabel(conditionEntry, index), summary: 'Conditional branch' };
    }
    const first = clauses[0];
    const left = first.left.replace(/^entity\./, '');
    return {
      label: normalizeConditionLabel(conditionEntry, index),
      summary: `${left} ${first.operator} ${first.right}`
    };
  }

  function extractConditionVars(condition, matches = []) {
    if (Array.isArray(condition)) {
      condition.forEach((entry) => extractConditionVars(entry, matches));
      return matches;
    }
    if (!condition || typeof condition !== 'object') return matches;
    if (typeof condition.var === 'string') matches.push(condition.var);
    Object.values(condition).forEach((entry) => extractConditionVars(entry, matches));
    return matches;
  }

  function parseUtteranceVariant(intent) {
    const variants = intent?.variants || {};
    return variants['en-US'] || variants[Object.keys(variants)[0]] || {};
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(Number(value) || value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function getEntityDefinition(botData, name) {
    const entities = Array.isArray(botData?.entities) ? botData.entities : [];
    return entities.find((entity) => entity?.name === name) || null;
  }

  function getResponseSummary(name, template) {
    const variant = getTemplateVariant(template);
    const defaultActions = variant?.paths?.default?.actions || {};
    const configurable = Array.isArray(variant?.paths?.configurable) ? variant.paths.configurable : [];
    const webTexts = getTextLines(defaultActions.web);
    const voiceTexts = getTextLines(defaultActions.voice);
    const defaultPayloads = [
      ...getPayloadActions(defaultActions.web),
      ...getPayloadActions(defaultActions.voice)
    ];
    return {
      name,
      updatedAt: template?.updated_at || '',
      typeLabel: configurable.length || defaultPayloads.length ? 'Custom' : 'Default',
      configurable,
      variant,
      webTexts,
      voiceTexts,
      defaultPayloads,
      conditionCount: configurable.length
    };
  }

  function buildBrowserModel(botData) {
    const intents = Array.isArray(botData?.intents) ? botData.intents : [];
    const entities = Array.isArray(botData?.entities) ? botData.entities : [];
    const templates = botData?.responses?.templates || {};

    const intentRows = intents.map((intent) => {
      const utteranceVariant = parseUtteranceVariant(intent);
      const utterances = Array.isArray(utteranceVariant?.utterances) ? utteranceVariant.utterances : [];
      return {
        id: intent?.intent_id || intent?.name || `intent-${Math.random()}`,
        name: intent?.name || intent?.intent_id || 'Intent',
        utteranceCount: utterances.length,
        responseName: intent?.template_key || '—',
        lastUpdate: '',
        validation: 'Valid',
        raw: intent
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const entityRows = entities.map((entity) => ({
      id: entity?.name || `entity-${Math.random()}`,
      name: entity?.name || 'Entity',
      entityType: entity?.type === 'custom' ? 'Custom List' : toLabel(entity?.type || 'Unknown'),
      lastUpdate: '',
      raw: entity
    })).sort((a, b) => a.name.localeCompare(b.name));

    const responseRows = Object.entries(templates).map(([name, template]) => {
      const summary = getResponseSummary(name, template);
      return {
        id: name,
        name,
        typeLabel: summary.typeLabel,
        lastUpdate: summary.updatedAt,
        raw: template
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { intents: intentRows, entities: entityRows, responses: responseRows, templates };
  }

  function renderUtteranceWithEntities(item) {
    const utterance = item?.utterance || '';
    const entities = Array.isArray(item?.entities) ? [...item.entities].sort((a, b) => (a.start || 0) - (b.start || 0)) : [];
    if (!entities.length) return escapeHtml(utterance);
    let cursor = 0;
    let html = '';
    entities.forEach((entity) => {
      const start = Math.max(0, Number(entity?.start) || 0);
      const end = Math.max(start, Number(entity?.end) || start);
      html += escapeHtml(utterance.slice(cursor, start));
      html += `<span class="aiagent-entity-pill">${escapeHtml(utterance.slice(start, end + 1) || entity?.value || entity?.entity_name || 'Entity')}</span>`;
      cursor = end + 1;
    });
    html += escapeHtml(utterance.slice(cursor));
    return html;
  }

  function renderStudioList() {
    if (!studioListWrap) return;
    if (!browserState.model) {
      studioListWrap.innerHTML = '<div class="aiagent-empty-state">Load a bot JSON file to browse intents, entities, and responses.</div>';
      return;
    }

    if (browserState.activeTab === 'intents') {
      studioListWrap.innerHTML = `
        <table class="aiagent-studio-table">
          <thead>
            <tr>
              <th>Intent name</th>
              <th>Utterances</th>
              <th>Response name</th>
              <th>Last update</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            ${browserState.model.intents.map((row) => `
              <tr class="${browserState.selected.intents === row.id ? 'is-active' : ''}" data-select-type="intent" data-select-id="${escapeHtml(row.id)}">
                <td>${escapeHtml(row.name)}</td>
                <td>${row.utteranceCount || '—'}</td>
                <td>${escapeHtml(row.responseName)}</td>
                <td>${escapeHtml(formatDateTime(row.lastUpdate))}</td>
                <td><span class="aiagent-valid-pill">${escapeHtml(row.validation)}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      return;
    }

    if (browserState.activeTab === 'entities') {
      studioListWrap.innerHTML = `
        <table class="aiagent-studio-table">
          <thead>
            <tr>
              <th>Entity name</th>
              <th>Entity type</th>
              <th>Last update</th>
            </tr>
          </thead>
          <tbody>
            ${browserState.model.entities.map((row) => `
              <tr class="${browserState.selected.entities === row.id ? 'is-active' : ''}" data-select-type="entity" data-select-id="${escapeHtml(row.id)}">
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.entityType)}</td>
                <td>${escapeHtml(formatDateTime(row.lastUpdate))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      return;
    }

    studioListWrap.innerHTML = `
      <table class="aiagent-studio-table">
        <thead>
          <tr>
            <th>Response name</th>
            <th>Type</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          ${browserState.model.responses.map((row) => `
            <tr class="${browserState.selected.responses === row.id ? 'is-active' : ''}" data-select-type="response" data-select-id="${escapeHtml(row.id)}">
              <td>${escapeHtml(row.name)}</td>
              <td>${escapeHtml(row.typeLabel)}</td>
              <td>${escapeHtml(formatDateTime(row.lastUpdate))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function renderIntentDetail() {
    const row = browserState.model?.intents.find((item) => item.id === browserState.selected.intents) || null;
    if (!row) {
      studioDetailWrap.innerHTML = '<div class="aiagent-empty-state">Select an intent to inspect its settings, utterances, slots, and linked response.</div>';
      return;
    }

    const intent = row.raw;
    const variant = parseUtteranceVariant(intent);
    const utterances = Array.isArray(variant?.utterances) ? variant.utterances : [];
    const entryContexts = Array.isArray(intent?.entry_context) ? intent.entry_context.filter(Boolean) : [];
    const exitContexts = Array.isArray(intent?.exit_context) ? intent.exit_context : [];
    const slots = Array.isArray(intent?.entities) ? intent.entities : [];

    studioDetailWrap.innerHTML = `
      <div class="aiagent-studio-detail-header">
        <h3>${escapeHtml(row.name)}</h3>
        <p>Configure intent recognition for the agent and link a response.</p>
      </div>

      <section class="aiagent-studio-card">
        <h4>General information and settings</h4>
        <div class="aiagent-studio-form-row">
          <div class="aiagent-studio-field aiagent-studio-field--wide">
            <label>Intent name</label>
            <div class="aiagent-studio-input">${escapeHtml(row.name)}</div>
          </div>
        </div>
        <div class="aiagent-studio-toggle-row">
          ${renderStaticToggle('Reset slots after completion', Boolean(intent?.reset_state))}
          ${renderStaticToggle('End conversation', Boolean(intent?.end_conversation))}
        </div>
        <div class="aiagent-studio-form-row">
          <div class="aiagent-studio-field">
            <label>Entry</label>
            <div class="aiagent-studio-pill-field">${entryContexts.length ? entryContexts.map((item) => `<span class="aiagent-context-pill">${escapeHtml(item)}</span>`).join('') : '<span class="aiagent-muted">0 items</span>'}</div>
          </div>
          <div class="aiagent-studio-field">
            <label>Exit</label>
            <div class="aiagent-studio-pill-field">${exitContexts.length ? exitContexts.map((item) => `<span class="aiagent-context-pill">${escapeHtml(item?.name || '')}</span>`).join('') : '<span class="aiagent-muted">0 items</span>'}</div>
          </div>
        </div>
      </section>

      <div class="aiagent-studio-grid-2">
        <section class="aiagent-studio-card">
          <h4>Intent and utterances</h4>
          <div class="aiagent-studio-utterance-list">
            ${utterances.map((item) => `<div class="aiagent-studio-utterance-row">${renderUtteranceWithEntities(item)}</div>`).join('') || '<div class="aiagent-muted">No utterances found.</div>'}
          </div>
        </section>

        <section class="aiagent-studio-card">
          <h4>Slot filling</h4>
          <table class="aiagent-studio-mini-table">
            <thead>
              <tr>
                <th>Entity name</th>
                <th>Required</th>
                <th>Retries</th>
                <th>Response</th>
              </tr>
            </thead>
            <tbody>
              ${slots.map((slot) => `
                <tr>
                  <td>${escapeHtml(slot?.entity_name || slot?.name || '—')}</td>
                  <td>${slot?.required ? 'Yes' : 'No'}</td>
                  <td>${slot?.counter ?? '—'}</td>
                  <td>${escapeHtml(slot?.template_key || '—')}</td>
                </tr>
              `).join('') || '<tr><td colspan="4" class="aiagent-muted">No slots configured.</td></tr>'}
            </tbody>
          </table>
          <div class="aiagent-studio-toggle-row aiagent-studio-toggle-row--compact">
            ${renderStaticToggle('Update slot values', Boolean(intent?.update_slots))}
          </div>
        </section>
      </div>

      <section class="aiagent-studio-card">
        <h4>Response</h4>
        <div class="aiagent-studio-input">${escapeHtml(intent?.template_key || '—')}</div>
      </section>
    `;
  }

  function renderEntityDetail() {
    const row = browserState.model?.entities.find((item) => item.id === browserState.selected.entities) || null;
    if (!row) {
      studioDetailWrap.innerHTML = '<div class="aiagent-empty-state">Select an entity to inspect its values and synonyms.</div>';
      return;
    }

    const entity = row.raw;
    const values = Array.isArray(entity?.data?.values) ? entity.data.values : [];

    studioDetailWrap.innerHTML = `
      <div class="aiagent-studio-detail-header">
        <h3>${escapeHtml(row.name)}</h3>
        <p>Custom entity definition and list values.</p>
      </div>

      <section class="aiagent-studio-card">
        <h4>Entity information</h4>
        <div class="aiagent-studio-grid-3">
          <div class="aiagent-studio-stat">
            <span>Name</span>
            <strong>${escapeHtml(row.name)}</strong>
          </div>
          <div class="aiagent-studio-stat">
            <span>Type</span>
            <strong>${escapeHtml(row.entityType)}</strong>
          </div>
          <div class="aiagent-studio-stat">
            <span>Values</span>
            <strong>${values.length}</strong>
          </div>
        </div>
      </section>

      <section class="aiagent-studio-card">
        <h4>Values and synonyms</h4>
        <table class="aiagent-studio-mini-table">
          <thead>
            <tr>
              <th>Value</th>
              <th>Synonyms</th>
            </tr>
          </thead>
          <tbody>
            ${values.map((item) => `
              <tr>
                <td>${escapeHtml(item?.value || '—')}</td>
                <td>${escapeHtml((item?.synonyms || []).join(', ') || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  function normalizeConditionLabel(rule, index) {
    return rule?.name || `Condition ${index + 1}`;
  }

  function renderConditionRule(condition) {
    if (!condition || typeof condition !== 'object') {
      return '<div class="aiagent-muted">No rule defined.</div>';
    }
    const vars = uniqueStrings(extractConditionVars(condition));
    const clauses = flattenRuleClauses(condition);
    if (clauses.length) {
      return `
        <div class="aiagent-studio-rule-box">
          <div class="aiagent-studio-rule-head">IF</div>
          <div class="aiagent-studio-rule-grid">
            ${clauses.map((clause) => `
              <div class="aiagent-studio-rule-row">
                <div class="aiagent-studio-rule-joiner">${escapeHtml(clause.joiner)}</div>
                <div class="aiagent-studio-rule-cell">
                  <span>Left variable</span>
                  <strong>${escapeHtml(clause.left)}</strong>
                </div>
                <div class="aiagent-studio-rule-cell">
                  <span>Operator</span>
                  <strong>${escapeHtml(clause.operator)}</strong>
                </div>
                <div class="aiagent-studio-rule-cell">
                  <span>Right variable</span>
                  <strong>${escapeHtml(clause.right)}</strong>
                </div>
                <div class="aiagent-studio-rule-cell">
                  <span>Data type</span>
                  <strong>${escapeHtml(clause.dataType)}</strong>
                </div>
              </div>
            `).join('')}
          </div>
          ${vars.length ? `<div class="aiagent-studio-rule-summary">Variables: ${escapeHtml(vars.map((item) => item.replace(/^entity\./, '')).join(', '))}</div>` : ''}
        </div>
      `;
    }
    const text = JSON.stringify(condition, null, 2);
    return `
      <div class="aiagent-studio-rule-box">
        <div class="aiagent-studio-rule-head">IF</div>
        ${vars.length ? `<div class="aiagent-studio-rule-summary">Variables: ${escapeHtml(vars.map((item) => item.replace(/^entity\./, '')).join(', '))}</div>` : ''}
        <pre>${escapeHtml(text)}</pre>
      </div>
    `;
  }

  function collectConditionActions(conditionEntry) {
    const actions = conditionEntry?.actions || {};
    return {
      web: getTextLines(actions.web),
      voice: getTextLines(actions.voice),
      webSettings: collectActionSettings(actions.web),
      voiceSettings: collectActionSettings(actions.voice),
      payloads: [
        ...getPayloadActions(actions.web),
        ...getPayloadActions(actions.voice)
      ]
    };
  }

  function collectActionSettings(actionGroup) {
    const groups = Array.isArray(actionGroup) ? actionGroup : [];
    const settings = {};
    groups.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      Object.entries(item).forEach(([key, value]) => {
        if (key === 'text' || key === 'payload') return;
        if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
          settings[key] = value;
        }
      });
    });
    return settings;
  }

  function renderActionSettings(settings) {
    const entries = Object.entries(settings || {});
    if (!entries.length) return '';
    return `
      <div class="aiagent-studio-action-settings">
        ${entries.map(([key, value]) => `
          <div class="aiagent-studio-setting-chip">
            <span>${escapeHtml(toLabel(key))}</span>
            <strong>${escapeHtml(String(value))}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderResponseActionPanel(conditionEntry, channel) {
    const actions = collectConditionActions(conditionEntry);
    if (channel === 'web' || channel === 'voice') {
      const texts = actions[channel];
      const settings = channel === 'voice' ? actions.voiceSettings : actions.webSettings;
      return `
        <div class="aiagent-studio-action-group">
          <div class="aiagent-studio-channel-tabs">
            <button class="aiagent-channel-tab ${browserState.responseChannel === 'web' ? 'active' : ''}" type="button" data-channel="web">Default (web)</button>
            <button class="aiagent-channel-tab ${browserState.responseChannel === 'voice' ? 'active' : ''}" type="button" data-channel="voice">Voice</button>
            <button class="aiagent-channel-tab ${browserState.responseChannel === 'payload' ? 'active' : ''}" type="button" data-channel="payload">Custom Event</button>
          </div>
          ${renderActionSettings(settings)}
          <div class="aiagent-studio-text-box">
            <div class="aiagent-studio-text-title">Text</div>
            ${texts.length ? texts.map((text, index) => `
              <div class="aiagent-studio-variant-block">
                <div class="aiagent-studio-variant-label">Variant ${index + 1}</div>
                <div class="aiagent-studio-textarea">${escapeHtml(text)}</div>
              </div>
            `).join('') : '<div class="aiagent-muted">No text configured for this channel.</div>'}
          </div>
        </div>
      `;
    }

    return `
      <div class="aiagent-studio-action-group">
        <div class="aiagent-studio-channel-tabs">
          <button class="aiagent-channel-tab ${browserState.responseChannel === 'web' ? 'active' : ''}" type="button" data-channel="web">Default (web)</button>
          <button class="aiagent-channel-tab ${browserState.responseChannel === 'voice' ? 'active' : ''}" type="button" data-channel="voice">Voice</button>
          <button class="aiagent-channel-tab ${browserState.responseChannel === 'payload' ? 'active' : ''}" type="button" data-channel="payload">Custom Event</button>
        </div>
        <div class="aiagent-studio-payload-list">
          ${actions.payloads.length ? actions.payloads.map((payload) => {
            const event = summarizePayload(payload);
            return `
              <div class="aiagent-studio-rule-box">
                <div class="aiagent-studio-rule-summary">${escapeHtml(event.eventName)}</div>
                <pre>${escapeHtml(JSON.stringify(event.params || {}, null, 2))}</pre>
              </div>
            `;
          }).join('') : '<div class="aiagent-muted">No payload actions configured.</div>'}
        </div>
      </div>
    `;
  }

  function renderResponseDetail() {
    const row = browserState.model?.responses.find((item) => item.id === browserState.selected.responses) || null;
    if (!row) {
      studioDetailWrap.innerHTML = '<div class="aiagent-empty-state">Select a response to inspect channels, conditions, and actions.</div>';
      return;
    }

    const summary = getResponseSummary(row.name, row.raw);
    const conditions = [
      { name: 'Default response', condition: null, actions: (summary.variant?.paths?.default?.actions || {}) },
      ...summary.configurable
    ];
    const selectedCondition = conditions.find((item) => item.name === browserState.responseConditionName) || conditions[0];
    if (selectedCondition && browserState.responseConditionName !== selectedCondition.name) {
      browserState.responseConditionName = selectedCondition.name;
    }
    const actionEntry = selectedCondition.name === 'Default response'
      ? { actions: (summary.variant?.paths?.default?.actions || {}) }
      : selectedCondition;

    studioDetailWrap.innerHTML = `
      <div class="aiagent-studio-detail-header">
        <h3>${escapeHtml(row.name)}</h3>
        <p>Configure channel-specific responses. Conditional responses can have rules and actions per branch.</p>
      </div>

      <section class="aiagent-studio-card">
        <div class="aiagent-studio-form-row">
          <div class="aiagent-studio-field aiagent-studio-field--wide">
            <label>Response name</label>
            <div class="aiagent-studio-input">${escapeHtml(row.name)}</div>
          </div>
        </div>
        <div class="aiagent-language-badge">English (en-US)</div>
        <div class="aiagent-studio-toggle-row aiagent-studio-toggle-row--compact">
          <div class="aiagent-studio-stat">
            <span>Response type</span>
            <strong>${escapeHtml(summary.configurable.length ? 'Conditional response' : row.typeLabel)}</strong>
          </div>
          <div class="aiagent-studio-stat">
            <span>Branches</span>
            <strong>${conditions.length}</strong>
          </div>
        </div>
      </section>

      <section class="aiagent-studio-card aiagent-response-editor">
        <div class="aiagent-response-editor-head">
          <div>${escapeHtml(browserState.responseConditionName || 'Default response')} &gt; ${escapeHtml(toLabel(browserState.responseViewMode))}</div>
          <div class="aiagent-response-type-pill">${escapeHtml(summary.configurable.length ? 'Conditional response' : row.typeLabel)}</div>
        </div>
        <div class="aiagent-response-editor-body">
          <aside class="aiagent-response-conditions">
            <div class="aiagent-response-conditions-head">Conditions</div>
            <div class="aiagent-response-condition-list">
              ${conditions.map((conditionEntry, index) => `
                <button class="aiagent-condition-row ${browserState.responseConditionName === conditionEntry.name ? 'active' : ''}" type="button" data-condition-name="${escapeHtml(conditionEntry.name)}">
                  <span class="aiagent-condition-row-title">${escapeHtml(getConditionMeta(index === 0 ? null : conditionEntry, index === 0 ? 0 : index - 1).label)}</span>
                  <span class="aiagent-condition-row-meta">${escapeHtml(getConditionMeta(index === 0 ? null : conditionEntry, index === 0 ? 0 : index - 1).summary)}</span>
                </button>
              `).join('')}
            </div>
          </aside>
          <div class="aiagent-response-workspace">
            <div class="aiagent-response-workspace-tabs">
              <button class="aiagent-workspace-tab ${browserState.responseViewMode === 'rules' ? 'active' : ''}" type="button" data-view-mode="rules">Rules</button>
              <button class="aiagent-workspace-tab ${browserState.responseViewMode === 'actions' ? 'active' : ''}" type="button" data-view-mode="actions">Actions</button>
            </div>
            ${browserState.responseViewMode === 'rules'
              ? renderConditionRule(selectedCondition.condition)
              : renderResponseActionPanel(actionEntry, browserState.responseChannel)
            }
          </div>
        </div>
      </section>
    `;
  }

  function renderStaticToggle(label, enabled) {
    return `
      <div class="aiagent-static-toggle">
        <span>${escapeHtml(label)}</span>
        <span class="aiagent-toggle ${enabled ? 'is-on' : 'is-off'}">
          <span class="aiagent-toggle-knob"></span>
        </span>
      </div>
    `;
  }

  function renderStudioDetail() {
    if (!studioDetailWrap) return;
    if (!browserState.model) {
      studioDetailWrap.innerHTML = '<div class="aiagent-empty-state">Select an item to inspect its details.</div>';
      return;
    }

    if (browserState.activeTab === 'intents') {
      renderIntentDetail();
      return;
    }
    if (browserState.activeTab === 'entities') {
      renderEntityDetail();
      return;
    }
    renderResponseDetail();
  }

  function setActiveTab(tabName) {
    browserState.activeTab = tabName;
    studioTabs.forEach((button) => {
      const active = button.dataset.tab === tabName;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const isFlow = tabName === 'flow';
    studioSplitPanel?.classList.toggle('hidden', isFlow);
    studioFlowCanvas?.classList.toggle('hidden', !isFlow);
    if (isFlow) {
      renderFlowCanvas();
    } else {
      renderStudioList();
      renderStudioDetail();
    }
  }

  // ── Flow tab (SVG graph — same style as flows page) ─────────────────────────

  const BOT_NODE_PALETTES = {
    intent:   { header: '#E2CAFC', body: '#FFFFFF', border: '#B69CD6', font: '#292929', subtitle: '#7B1FA2' },
    entity:   { header: 'rgb(188,227,111)', body: '#FFFFFF', border: '#9EBF5C', font: '#292929', subtitle: '#4B7012' },
    response: { header: '#99DDFF', body: '#FFFFFF', border: '#6CB0E0', font: '#292929', subtitle: '#0277BD' },
    event:    { header: '#FFCE73', body: '#FFFFFF', border: '#E0B055', font: '#292929', subtitle: '#BF6C00' }
  };

  // Node widths by type
  const BOT_COL_W = { intent: 280, entity: 200, response: 300, event: 280 };
  const BOT_LINE_H = 16;
  const BOT_HEADER_H = 38;
  const BOT_BODY_PAD_TOP = 10;
  const BOT_BODY_PAD_BOT = 14;
  const BOT_FONT_BODY = 11;

  function wrapBotText(text, nodeWidth) {
    const charsPerLine = Math.max(10, Math.floor((nodeWidth - 24) / (BOT_FONT_BODY * 0.595)));
    const words = String(text || '').split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (test.length > charsPerLine) {
        if (line) lines.push(line);
        line = word.length > charsPerLine ? `${word.slice(0, charsPerLine - 1)}\u2026` : word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function computeBotNodeHeight(bodyLines, nodeWidth) {
    const wrappedCount = bodyLines.reduce((sum, bl) => sum + wrapBotText(bl, nodeWidth).length, 0);
    return BOT_HEADER_H + BOT_BODY_PAD_TOP + wrappedCount * BOT_LINE_H + BOT_BODY_PAD_BOT;
  }

  function buildBotFlowGraph(botData) {
    const intents = Array.isArray(botData?.intents) ? botData.intents : [];
    const templates = botData?.responses?.templates || {};
    const nodes = [];
    const edges = [];
    let counter = 0;
    const uid = () => `bn-${counter++}`;

    const entryContextMap = {};
    intents.forEach((intent) => {
      (Array.isArray(intent?.entry_context) ? intent.entry_context : []).filter(Boolean)
        .forEach((ctx) => {
          if (!entryContextMap[ctx]) entryContextMap[ctx] = [];
          entryContextMap[ctx].push(intent?.name);
        });
    });

    function templatePayloads(templateKey) {
      const tmpl = templateKey ? templates[templateKey] : null;
      const variant = tmpl ? getTemplateVariant(tmpl) : null;
      const da = variant?.paths?.default?.actions || {};
      return [...getPayloadActions(da.web), ...getPayloadActions(da.voice)];
    }

    // Compute the last col index used by an intent's chain (for sizing follow-up offsets)
    function chainEndCol(intent, startCol) {
      const slots = Array.isArray(intent?.entities) ? intent.entities : [];
      const templateKey = intent?.template_key || '';
      let col = startCol;
      col += slots.length;           // one col per entity slot
      if (templateKey) {
        col += 1;                    // response
        if (templatePayloads(templateKey).length) col += 1; // event
      }
      return col;
    }

    // Build ordered rows with their starting column so follow-ups always appear to the right
    const orderedRows = [];   // [{ intent, startCol, parentIntentName }]
    const usedNames = new Set();

    function addIntentChain(intent, startCol, parentIntentName = null) {
      if (!intent || usedNames.has(intent?.name)) return;
      orderedRows.push({ intent, startCol, parentIntentName });
      usedNames.add(intent?.name);
      const nextCol = chainEndCol(intent, startCol) + 1;
      const exits = (Array.isArray(intent?.exit_context) ? intent.exit_context : [])
        .map((e) => e?.name || e).filter(Boolean);
      exits.forEach((ctx) => {
        (entryContextMap[ctx] || []).forEach((followName) => {
          addIntentChain(intents.find((i) => i?.name === followName), nextCol, intent?.name);
        });
      });
    }

    intents.filter((i) => {
      const entries = (Array.isArray(i?.entry_context) ? i.entry_context : []).filter(Boolean);
      return entries.length === 0;
    }).forEach((i) => addIntentChain(i, 0));
    intents.forEach((i) => addIntentChain(i, 0)); // orphaned follow-ups

    const chainMap = {};

    orderedRows.forEach(({ intent, startCol }, rowIndex) => {
      const name = intent?.name || 'Intent';
      const variant = parseUtteranceVariant(intent);
      const utterances = Array.isArray(variant?.utterances) ? variant.utterances : [];
      const sample = utterances[0]?.utterance || '';
      const slots = Array.isArray(intent?.entities) ? intent.entities : [];
      const templateKey = intent?.template_key || '';
      const exits = (Array.isArray(intent?.exit_context) ? intent.exit_context : []).map((e) => e?.name || e).filter(Boolean);
      const entries = (Array.isArray(intent?.entry_context) ? intent.entry_context : []).filter(Boolean);

      // Intent node
      const iBodyLines = [];
      if (sample) iBodyLines.push(`\u201c${sample}\u201d`);
      if (entries.length) iBodyLines.push(`Entry: ${entries.join(', ')}`);
      if (exits.length) iBodyLines.push(`Exit: ${exits.join(', ')}`);
      const iW = BOT_COL_W.intent;
      const iNodeId = uid();
      nodes.push({
        id: iNodeId, _col: startCol, _row: rowIndex,
        data: { title: name, subtitle: 'Intent', bodyLines: iBodyLines, width: iW, height: computeBotNodeHeight(iBodyLines, iW), palette: BOT_NODE_PALETTES.intent },
        position: { x: 0, y: 0 }
      });
      let lastId = iNodeId;
      let curCol = startCol + 1;

      // Entity (slot filling) nodes — one per slot
      slots.forEach((slot) => {
        const entityName = slot?.entity_name || slot?.name || 'Entity';
        const eW = BOT_COL_W.entity;
        const eBodyLines = [`Required: ${slot?.required !== false ? 'Yes' : 'No'}`];
        const eNodeId = uid();
        nodes.push({
          id: eNodeId, _col: curCol, _row: rowIndex,
          data: { title: entityName, subtitle: 'Entities', bodyLines: eBodyLines, width: eW, height: computeBotNodeHeight(eBodyLines, eW), palette: BOT_NODE_PALETTES.entity },
          position: { x: 0, y: 0 }
        });
        edges.push({ sourceActivityId: lastId, targetActivityId: eNodeId });
        lastId = eNodeId;
        curCol++;
      });

      // Response node
      let rNodeId = null;
      if (templateKey) {
        const tmpl = templates[templateKey];
        const tVariant = tmpl ? getTemplateVariant(tmpl) : null;
        const da = tVariant?.paths?.default?.actions || {};
        const configurable = Array.isArray(tVariant?.paths?.configurable) ? tVariant.paths.configurable : [];
        const webTexts = getTextLines(da.web);
        const payloads = [...getPayloadActions(da.web), ...getPayloadActions(da.voice)];
        const rBodyLines = configurable.length
          ? [`${configurable.length} conditional branches`]
          : (webTexts[0] ? [webTexts[0]] : []);
        const rW = BOT_COL_W.response;
        rNodeId = uid();
        nodes.push({
          id: rNodeId, _col: curCol, _row: rowIndex,
          data: { title: templateKey, subtitle: 'Response', bodyLines: rBodyLines, width: rW, height: computeBotNodeHeight(rBodyLines, rW), palette: BOT_NODE_PALETTES.response },
          position: { x: 0, y: 0 }
        });
        edges.push({ sourceActivityId: lastId, targetActivityId: rNodeId });
        curCol++;

        // Event nodes
        payloads.forEach((payload) => {
          const ev = summarizePayload(payload);
          const evW = BOT_COL_W.event;
          const evBodyLines = Object.entries(ev.params || {}).map(([k, v]) => `${k}: ${String(v)}`);
          const evNodeId = uid();
          nodes.push({
            id: evNodeId, _col: curCol, _row: rowIndex,
            data: { title: ev.eventName, subtitle: 'Custom Event', bodyLines: evBodyLines, width: evW, height: computeBotNodeHeight(evBodyLines, evW), palette: BOT_NODE_PALETTES.event },
            position: { x: 0, y: 0 }
          });
          edges.push({ sourceActivityId: rNodeId, targetActivityId: evNodeId });
        });
      }

      chainMap[name] = { intentNodeId: iNodeId, responseNodeId: rNodeId };
    });

    // Context handoff edges — solid curved line (not dashed) since they now flow right
    orderedRows.forEach(({ intent }) => {
      const name = intent?.name || '';
      const exits = (Array.isArray(intent?.exit_context) ? intent.exit_context : []).map((e) => e?.name || e).filter(Boolean);
      const chain = chainMap[name];
      if (!chain) return;
      const sourceId = chain.responseNodeId || chain.intentNodeId;
      exits.forEach((ctx) => {
        (entryContextMap[ctx] || []).forEach((followName) => {
          const followChain = chainMap[followName];
          if (followChain?.intentNodeId && sourceId) {
            edges.push({ sourceActivityId: sourceId, targetActivityId: followChain.intentNodeId, isContextEdge: true, mappedHandle: ctx });
          }
        });
      });
    });

    // Build row parent map for tree-layout Y centering
    const nameToRowIdx = {};
    orderedRows.forEach(({ intent }, idx) => { nameToRowIdx[intent?.name] = idx; });
    const rowParentMap = {};
    orderedRows.forEach(({ parentIntentName }, idx) => {
      rowParentMap[idx] = (parentIntentName && nameToRowIdx[parentIntentName] !== undefined)
        ? nameToRowIdx[parentIntentName]
        : -1;
    });

    return { nodes, edges, rowParentMap };
  }

  function layoutBotNodes(nodes, rowParentMap) {
    const COL_GAP = 70;
    const ROW_GAP = 24;

    // Max width per numeric column index
    const colMaxW = {};
    nodes.forEach((n) => {
      const c = n._col;
      colMaxW[c] = Math.max(colMaxW[c] || 0, n.data.width);
    });

    // Cumulative X per column
    const colX = {};
    let curX = 0;
    Object.keys(colMaxW).map(Number).sort((a, b) => a - b).forEach((c) => {
      colX[c] = curX;
      curX += colMaxW[c] + COL_GAP;
    });

    // Max height per row
    const rowMaxH = {};
    nodes.forEach((n) => {
      const r = n._row;
      rowMaxH[r] = Math.max(rowMaxH[r] || 0, n.data.height);
    });

    // Build row children map from rowParentMap
    const rowIds = [...new Set(nodes.map((n) => n._row))].sort((a, b) => a - b);
    const rowChildren = {};
    rowIds.forEach((r) => { rowChildren[r] = []; });
    rowIds.forEach((r) => {
      const parentR = rowParentMap ? rowParentMap[r] : -1;
      if (parentR !== undefined && parentR >= 0 && rowChildren[parentR]) {
        rowChildren[parentR].push(r);
      }
    });

    // Tree-layout Y: center parent rows between their first and last child
    const rowY = {};

    function placeRow(rowIdx, topY) {
      const children = rowChildren[rowIdx] || [];
      if (!children.length) {
        rowY[rowIdx] = topY;
        return topY + (rowMaxH[rowIdx] || 0) + ROW_GAP;
      }
      let childY = topY;
      children.forEach((childIdx) => {
        childY = placeRow(childIdx, childY);
      });
      // Center parent vertically between first and last child, but never above topY
      const centered = (rowY[children[0]] + rowY[children[children.length - 1]]) / 2;
      rowY[rowIdx] = Math.max(topY, centered);
      // Return the furthest bottom edge: either after all children, or after this (centered) parent's tallest node
      const parentBottom = rowY[rowIdx] + (rowMaxH[rowIdx] || 0) + ROW_GAP;
      return Math.max(parentBottom, childY);
    }

    const rootRows = rowIds.filter((r) => !rowParentMap || rowParentMap[r] === undefined || rowParentMap[r] < 0);
    let globalY = 0;
    rootRows.forEach((rootIdx) => {
      globalY = placeRow(rootIdx, globalY);
    });

    // Assign positions — X by column, Y centered in row band
    nodes.forEach((n) => {
      const x = colX[n._col] || 0;
      const r = n._row;
      n.position = { x, y: Math.round((rowY[r] || 0) + Math.floor((rowMaxH[r] - n.data.height) / 2)) };
    });
  }

  function botFlowCurvedPath(sx, sy, tx, ty) {
    const dx = tx - sx;
    const hDist = dx < 50 ? Math.max(80, Math.abs(dx) * 0.25 + 60) : Math.max(Math.abs(dx) * 0.45, 60);
    const c1x = sx + hDist;
    const c1y = dx < 50 ? Math.min(sy, ty) - Math.max(60, Math.abs(dx) * 0.15 + 40) : sy;
    const c2x = tx - hDist;
    const c2y = dx < 50 ? c1y : ty;
    return {
      path: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`,
      midX: (sx + 3 * c1x + 3 * c2x + tx) / 8,
      midY: (sy + 3 * c1y + 3 * c2y + ty) / 8
    };
  }

  function renderFlowCanvas() {
    if (!studioFlowCanvas) return;
    if (!browserState.botData) {
      studioFlowCanvas.innerHTML = '<div class="aiagent-empty-state">Load a bot JSON file to see the conversation flow.</div>';
      return;
    }

    const { nodes, edges, rowParentMap } = buildBotFlowGraph(browserState.botData);
    layoutBotNodes(nodes, rowParentMap);

    const pad = 60;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    let edgesSvg = '';
    edges.forEach((edge) => {
      const src = nodeById.get(edge.sourceActivityId);
      const tgt = nodeById.get(edge.targetActivityId);
      if (!src || !tgt) return;
      const sx = src.position.x + pad + src.data.width;
      const sy = src.position.y + pad + src.data.height / 2;
      const tx = tgt.position.x + pad;
      const ty = tgt.position.y + pad + tgt.data.height / 2;
      const { path, midX, midY } = botFlowCurvedPath(sx, sy, tx, ty);
      const stroke = edge.isContextEdge ? '#6366f1' : '#888888';
      const dash = edge.isContextEdge ? 'stroke-dasharray="6 3"' : '';
      edgesSvg += `<path d="${path}" stroke="${stroke}" stroke-width="2" fill="none" marker-end="url(#botArrow)" ${dash}/>`;
      if (edge.mappedHandle) {
        const lbl = escapeHtml(edge.mappedHandle.length > 26 ? `${edge.mappedHandle.slice(0, 26)}\u2026` : edge.mappedHandle);
        const lw = Math.min(lbl.length * 6 + 20, 200);
        edgesSvg += `<rect x="${midX - lw / 2}" y="${midY - 10}" width="${lw}" height="18" rx="9" fill="#e0e7ff" opacity=".95"/>
          <text x="${midX}" y="${midY + 4}" font-size="9" text-anchor="middle" fill="#3730a3">${lbl}</text>`;
      }
    });

    let nodesSvg = '';
    let maxX = 0;
    let maxY = 0;
    nodes.forEach((node) => {
      const x = node.position.x + pad;
      const y = node.position.y + pad;
      const w = node.data.width;
      const h = node.data.height;
      const p = node.data.palette;
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);

      // Title: wrap in header if long
      const titleRaw = String(node.data.title || '');
      const titleChars = Math.floor((w - 24) / (12 * 0.62));
      const titleText = escapeHtml(titleRaw.length > titleChars ? `${titleRaw.slice(0, titleChars)}\u2026` : titleRaw);
      const subtitle = escapeHtml(node.data.subtitle || '');

      // Body lines with word wrap
      let bodyY = y + BOT_HEADER_H + BOT_BODY_PAD_TOP;
      let bodyTextSvg = '';
      (node.data.bodyLines || []).forEach((line) => {
        wrapBotText(String(line), w).forEach((wl) => {
          bodyTextSvg += `<text x="${x + 12}" y="${bodyY + BOT_FONT_BODY}" font-size="${BOT_FONT_BODY}" fill="#444">${escapeHtml(wl)}</text>`;
          bodyY += BOT_LINE_H;
        });
      });

      nodesSvg += `<g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${p.body}" stroke="${p.border}" stroke-width="1.5"/>
        <path d="M ${x + 10} ${y} H ${x + w - 10} Q ${x + w} ${y} ${x + w} ${y + 10} V ${y + BOT_HEADER_H} H ${x} V ${y + 10} Q ${x} ${y} ${x + 10} ${y} Z" fill="${p.header}"/>
        <text x="${x + 12}" y="${y + 21}" font-size="12" font-weight="700" fill="${p.font}">${titleText}</text>
        <text x="${x + 12}" y="${y + 35}" font-size="10" fill="${p.subtitle}">${subtitle}</text>
        ${bodyTextSvg}
      </g>`;
    });

    const totalW = maxX + pad;
    const totalH = maxY + pad;

    studioFlowCanvas.innerHTML = `
      <div class="aiagent-flow-svg-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
          <defs>
            <marker id="botArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#888888"/>
            </marker>
          </defs>
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>`;

    const wrap = studioFlowCanvas.querySelector('.aiagent-flow-svg-wrap');
    if (!wrap) return;
    let panning = false;
    let px = 0;
    let py = 0;
    let sl = 0;
    let st = 0;
    wrap.addEventListener('mousedown', (e) => {
      panning = true;
      px = e.clientX;
      py = e.clientY;
      sl = wrap.scrollLeft;
      st = wrap.scrollTop;
      wrap.style.cursor = 'grabbing';
    });
    document.addEventListener('mouseup', () => { panning = false; if (wrap) wrap.style.cursor = 'grab'; });
    document.addEventListener('mousemove', (e) => {
      if (!panning) return;
      wrap.scrollLeft = sl - (e.clientX - px);
      wrap.scrollTop = st - (e.clientY - py);
    });
  }

  function seedSelections() {
    browserState.selected.intents = browserState.model?.intents[0]?.id || '';
    browserState.selected.entities = browserState.model?.entities[0]?.id || '';
    browserState.selected.responses = browserState.model?.responses[0]?.id || '';
    browserState.responseConditionName = 'Default response';
    browserState.responseViewMode = 'actions';
    browserState.responseChannel = 'web';
  }

  const BOT_STORAGE_KEY = 'aiagentBotJson';
  const BOT_NAME_KEY = 'aiagentBotName';

  function saveBotToStorage(rawText, fileName) {
    try {
      localStorage.setItem(BOT_STORAGE_KEY, rawText);
      localStorage.setItem(BOT_NAME_KEY, fileName || '');
    } catch {
      // Silently ignore quota errors — bot still loads, just won't persist
    }
  }

  function loadBotFromStorage() {
    try {
      const rawText = localStorage.getItem(BOT_STORAGE_KEY);
      if (!rawText) return;
      const fileName = localStorage.getItem(BOT_NAME_KEY) || 'cached bot';
      browserState.botData = JSON.parse(rawText);
      browserState.model = buildBrowserModel(browserState.botData);
      seedSelections();
      showBotError('');
      showCachedBotLabel(fileName);
      if (botFileNameDisplay) botFileNameDisplay.textContent = fileName;
      setActiveTab('intents');
    } catch {
      localStorage.removeItem(BOT_STORAGE_KEY);
      localStorage.removeItem(BOT_NAME_KEY);
    }
  }

  function showCachedBotLabel(fileName) {
    const existing = document.getElementById('botCacheLabel');
    if (existing) { existing.textContent = `Loaded: ${fileName}`; return; }
    const label = document.createElement('div');
    label.id = 'botCacheLabel';
    label.className = 'aiagent-cache-label';
    label.textContent = `Loaded: ${fileName}`;
    botErrorBox?.parentNode?.insertBefore(label, botErrorBox);
  }

  function clearCachedBotLabel() {
    document.getElementById('botCacheLabel')?.remove();
  }

  function clearBotVisualizer() {
    if (botJsonFileInput) botJsonFileInput.value = '';
    if (botFileNameDisplay) botFileNameDisplay.textContent = 'No file chosen';
    localStorage.removeItem(BOT_STORAGE_KEY);
    localStorage.removeItem(BOT_NAME_KEY);
    clearCachedBotLabel();
    browserState.botData = null;
    browserState.model = null;
    browserState.selected = { intents: '', entities: '', responses: '' };
    browserState.responseViewMode = 'actions';
    browserState.responseChannel = 'web';
    browserState.responseConditionName = '';
    showBotError('');
    if (studioFlowCanvas) studioFlowCanvas.innerHTML = '<div class="aiagent-empty-state">Load a bot JSON file to see the conversation flow.</div>';
    renderStudioList();
    renderStudioDetail();
  }

  async function loadSelectedBotJson() {
    const file = botJsonFileInput?.files?.[0];
    if (!file) {
      showBotError('Choose a JSON file first.');
      return;
    }

    try {
      const rawText = await file.text();
      browserState.botData = JSON.parse(rawText);
      browserState.model = buildBrowserModel(browserState.botData);
      seedSelections();
      showBotError('');
      saveBotToStorage(rawText, file.name);
      showCachedBotLabel(file.name);
      setActiveTab('intents');
    } catch (error) {
      clearBotVisualizer();
      showBotError(`Unable to load bot JSON: ${error.message || error}`);
    }
  }

  function bindStudioEvents() {
    studioTabs.forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab || 'intents'));
    });

    studioListWrap?.addEventListener('click', (event) => {
      const row = event.target.closest('[data-select-type]');
      if (!row) return;
      const type = row.getAttribute('data-select-type');
      const id = row.getAttribute('data-select-id') || '';
      if (type === 'intent') browserState.selected.intents = id;
      if (type === 'entity') browserState.selected.entities = id;
      if (type === 'response') {
        browserState.selected.responses = id;
        browserState.responseConditionName = 'Default response';
        browserState.responseViewMode = 'actions';
        browserState.responseChannel = 'web';
      }
      renderStudioList();
      renderStudioDetail();
    });

    studioDetailWrap?.addEventListener('click', (event) => {
      const conditionButton = event.target.closest('[data-condition-name]');
      if (conditionButton) {
        browserState.responseConditionName = conditionButton.getAttribute('data-condition-name') || 'Default response';
        browserState.responseViewMode = 'actions';
        renderStudioDetail();
        return;
      }
      const modeButton = event.target.closest('[data-view-mode]');
      if (modeButton) {
        browserState.responseViewMode = modeButton.getAttribute('data-view-mode') || 'actions';
        renderStudioDetail();
        return;
      }
      const channelButton = event.target.closest('[data-channel]');
      if (channelButton) {
        browserState.responseChannel = channelButton.getAttribute('data-channel') || 'web';
        renderStudioDetail();
      }
    });
  }

  function updateAiUtilPackageSummary() {
    const loadedCount = AI_UTIL_SUBFLOW_KEYS.filter((key) => pageState.aiUtilSubflows[key]).length;
    if (!aiUtilPackageSummary) return;
    if (!pageState.aiUtilAssetsLoaded) {
      aiUtilPackageSummary.textContent = loadedCount ? `Loading bundled assets (${loadedCount}/3)` : 'Preparing bundled assets';
      return;
    }
    aiUtilPackageSummary.textContent = `Built-in assets ready (${loadedCount}/3 subflows loaded)`;
  }

  function clearAiUtilManifest() {
    pageState.aiUtilSubflows = { start: null, end: null, contactEnd: null };
    pageState.aiUtilAssetsLoaded = false;
    updateAiUtilPackageSummary();
    showAiUtilError('');
    setAiUtilLog('Import log will appear here…');
  }

  function normalizeManifestUrl(value, projectId) {
    return String(value || '')
      .replace(/\{\{\s*orgId\s*\}\}/gi, encodeURIComponent(localStorage.getItem('authOrgId') || ''))
      .replace(/\{\{\s*projectId\s*\}\}/gi, encodeURIComponent(projectId || DEFAULT_PROJECT_ID))
      .replace(/\{\{\s*bearer\s*\}\}/gi, encodeURIComponent(localStorage.getItem(KEYS.bearer) || ''));
  }

  function setAiUtilPhaseState(element, state) {
    if (!element) return;
    element.classList.remove('is-pending', 'is-active', 'is-complete');
    element.classList.add(state);
  }

  function resetAiUtilOverlay() {
    if (aiUtilOverlayLabel) aiUtilOverlayLabel.textContent = 'Preparing import…';
    if (aiUtilOverlayDetail) aiUtilOverlayDetail.textContent = 'Connecting to the current tenant.';
    setAiUtilPhaseState(aiUtilPhaseGlobals, 'is-pending');
    setAiUtilPhaseState(aiUtilPhaseSubflows, 'is-pending');
    setAiUtilPhaseState(aiUtilPhasePublish, 'is-pending');
    if (aiUtilTaskLog) aiUtilTaskLog.textContent = 'Task progress will appear here…';
  }

  function showAiUtilOverlay() {
    resetAiUtilOverlay();
    aiUtilOverlay?.classList.remove('hidden');
  }

  function hideAiUtilOverlay() {
    aiUtilOverlay?.classList.add('hidden');
  }

  function setAiUtilOverlayStep(phase, detail) {
    if (aiUtilOverlayLabel) aiUtilOverlayLabel.textContent = phase;
    if (aiUtilOverlayDetail) aiUtilOverlayDetail.textContent = detail;
  }

  async function ensureAiUtilAssetsLoaded() {
    if (pageState.aiUtilAssetsLoaded) {
      updateAiUtilPackageSummary();
      return pageState.aiUtilSubflows;
    }
    updateAiUtilPackageSummary();
    const entries = Object.entries(AI_UTIL_SUBFLOW_ASSETS);
    for (const [slotKey, asset] of entries) {
      const response = await fetch(asset.path, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Unable to load bundled asset ${asset.fileName}.`);
      }
      const rawText = await response.text();
      const payload = JSON.parse(rawText);
      pageState.aiUtilSubflows[slotKey] = {
        fileName: asset.fileName,
        rawText,
        payload,
        id: payload?.id || '',
        name: payload?.name || asset.fileName
      };
      updateAiUtilPackageSummary();
    }
    pageState.aiUtilAssetsLoaded = true;
    updateAiUtilPackageSummary();
    return pageState.aiUtilSubflows;
  }

  async function runProxyRequest({ url, method = 'POST', payload = null, format = 'json', proxy = FLOW_PROXY }) {
    const token = localStorage.getItem(KEYS.bearer) || '';
    if (!token) throw new Error('Missing bearer token. Authenticate first.');

    const requestUrl = `${proxy}?url=${encodeURIComponent(url)}${format ? `&format=${encodeURIComponent(format)}` : ''}`;
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    };
    if (payload !== null) headers['Content-Type'] = 'application/json';

    const response = await fetch(requestUrl, {
      method,
      headers,
      body: payload === null ? null : (typeof payload === 'string' ? payload : JSON.stringify(payload))
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!response.ok) {
      const message = body?.message || body?.error?.reason || body?.error || response.statusText || `HTTP ${response.status}`;
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }

    return body;
  }

  async function runDirectApiRequest({ url, method = 'POST', payload = null }) {
    const token = localStorage.getItem(KEYS.bearer) || '';
    if (!token) throw new Error('Missing bearer token. Authenticate first.');

    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: payload === null ? null : JSON.stringify(payload)
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    if (!response.ok) {
      const message = body?.message || body?.error?.reason || body?.error || response.statusText || `HTTP ${response.status}`;
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }

    return body;
  }

  function buildSubflowImportUrl(projectId, overwriteValue) {
    const orgId = (localStorage.getItem('authOrgId') || '').trim();
    const overwrite = overwriteValue ?? 'yes';
    return `https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(orgId)}/project/${encodeURIComponent(projectId)}/flows:import?overwrite=${encodeURIComponent(overwrite)}&flowType=SUBFLOW`;
  }

  function buildGlobalVariableUrl(orgId) {
    return `https://api.wxcc-us1.cisco.com/organization/${encodeURIComponent(orgId)}/cad-variable`;
  }

  function buildPublishSubflowUrl(orgId, projectId, flowId) {
    return `https://api.wxcc-us1.cisco.com/flow-store/${encodeURIComponent(orgId)}/project/${encodeURIComponent(projectId)}/flows/${encodeURIComponent(flowId)}:publish`;
  }

  function extractImportedFlowId(body, fallbackId = '') {
    return body?.id
      || body?.flowId
      || body?.data?.id
      || body?.resource?.id
      || body?.flow?.id
      || fallbackId
      || '';
  }

  async function createAiUtilGlobalVariables(orgId) {
    const url = buildGlobalVariableUrl(orgId);
    setAiUtilPhaseState(aiUtilPhaseGlobals, 'is-active');
    for (let index = 0; index < AI_UTIL_GLOBAL_VARIABLES.length; index += 1) {
      const variable = AI_UTIL_GLOBAL_VARIABLES[index];
      setAiUtilOverlayStep('Importing Global Variables', `Creating ${variable.name} (${index + 1} of ${AI_UTIL_GLOBAL_VARIABLES.length})`);
      appendAiUtilLog(`[GV ${index + 1}/${AI_UTIL_GLOBAL_VARIABLES.length}] Creating ${variable.name}`);
      await runDirectApiRequest({
        url,
        method: 'POST',
        payload: variable
      });
      appendAiUtilLog(`[GV ${index + 1}/${AI_UTIL_GLOBAL_VARIABLES.length}] Created ${variable.name}`);
    }
    setAiUtilPhaseState(aiUtilPhaseGlobals, 'is-complete');
  }

  async function importAndPublishAiUtilSubflow(subflow, sequenceIndex, totalCount, orgId, projectId, overwriteValue) {
    if (!subflow?.rawText) {
      throw new Error(`Missing subflow file for step ${sequenceIndex}.`);
    }
    setAiUtilPhaseState(aiUtilPhaseSubflows, 'is-active');
    setAiUtilOverlayStep('Importing Subflows', `Importing ${subflow.name} (${sequenceIndex} of ${totalCount})`);
    appendAiUtilLog(`[SF ${sequenceIndex}/${totalCount}] Importing ${subflow.name}`);
    const importBody = await runProxyRequest({
      url: buildSubflowImportUrl(projectId, overwriteValue),
      method: 'POST',
      payload: subflow.rawText,
      format: 'multipart',
      proxy: FLOW_PROXY
    });
    const flowId = extractImportedFlowId(importBody, subflow.id);
    if (!flowId) {
      throw new Error(`Unable to determine flow ID after importing ${subflow.name}.`);
    }
    appendAiUtilLog(`[SF ${sequenceIndex}/${totalCount}] Imported ${subflow.name} (${flowId})`);
    if (sequenceIndex === totalCount) setAiUtilPhaseState(aiUtilPhaseSubflows, 'is-complete');
    setAiUtilPhaseState(aiUtilPhasePublish, 'is-active');
    setAiUtilOverlayStep('Publishing Subflows', `Publishing ${subflow.name} (${sequenceIndex} of ${totalCount})`);
    await runProxyRequest({
      url: buildPublishSubflowUrl(orgId, projectId, flowId),
      method: 'POST',
      payload: { comment: 'Published from Orbit', tagIds: ['Live'] },
      format: 'json',
      proxy: FLOW_PROXY
    });
    appendAiUtilLog(`[SF ${sequenceIndex}/${totalCount}] Published ${subflow.name}`);
    if (sequenceIndex === totalCount) setAiUtilPhaseState(aiUtilPhasePublish, 'is-complete');
  }

  async function runAiUtilImport() {
    const orgId = (localStorage.getItem('authOrgId') || '').trim();
    const projectId = DEFAULT_PROJECT_ID;
    showAiUtilError('');

    if (!orgId) {
      showAiUtilError('Org ID not found. Authenticate to load org context.');
      return;
    }

    localStorage.setItem('wxccFlowProjectId', projectId);
    setAiUtilLog(`Running AI Utilization setup\nTenant org: ${orgId}\nFlow project: ${projectId}`);

    runAiUtilBtn?.setAttribute('disabled', 'disabled');
    showAiUtilOverlay();

    try {
      await ensureAiUtilAssetsLoaded();
      const subflows = [
        pageState.aiUtilSubflows.start,
        pageState.aiUtilSubflows.end,
        pageState.aiUtilSubflows.contactEnd
      ];
      await createAiUtilGlobalVariables(orgId);
      for (let index = 0; index < subflows.length; index += 1) {
        await importAndPublishAiUtilSubflow(subflows[index], index + 1, subflows.length, orgId, projectId, 'yes');
      }
      setAiUtilOverlayStep('Import Complete', 'All global variables and subflows were imported and published.');
      appendAiUtilLog('Import complete.');
    } catch (error) {
      appendAiUtilLog(`Import failed: ${error.message || error}`);
      showAiUtilError(error.message || String(error));
      setAiUtilOverlayStep('Import Failed', error.message || String(error));
    } finally {
      runAiUtilBtn?.removeAttribute('disabled');
      setTimeout(hideAiUtilOverlay, 700);
    }
  }

  function bindAiUtilEvents() {
    runAiUtilBtn?.addEventListener('click', runAiUtilImport);
  }

  function renderSummaryResponse(data) {
    if (!data || typeof data !== 'object' || !data.summaries) return null;

    const container = document.createElement('div');
    const summaries = data.summaries || {};

    Object.entries(summaries).forEach(([summaryType, sessions]) => {
      const section = document.createElement('div');
      section.className = 'aiagent-summary-section';

      const title = document.createElement('div');
      title.className = 'aiagent-summary-section-title';
      title.textContent = summaryType;
      section.appendChild(title);

      if (!sessions || typeof sessions !== 'object') {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No sessions returned.';
        section.appendChild(empty);
        container.appendChild(section);
        return;
      }

      Object.entries(sessions).forEach(([sessionId, summary]) => {
        const card = document.createElement('div');
        card.className = 'aiagent-summary-card';

        if (typeof sessionId === 'string' && sessionId.includes(':')) {
          const parts = sessionId.split(':');
          if (parts.length >= 3) {
            const [, interactionPart, agentPart] = parts;
            const meta = document.createElement('div');
            meta.className = 'aiagent-summary-meta';
            meta.innerHTML = `
              <div title="${interactionPart}"><strong>Interaction ID</strong><br>${formatId(interactionPart)}</div>
              <div title="${agentPart}"><strong>Agent ID</strong><br>${formatId(agentPart)}</div>
            `;
            card.appendChild(meta);
          }
        }

        const body = document.createElement('div');
        body.className = 'aiagent-summary-body';

        if (summary && typeof summary === 'object') {
          const entries = Object.entries(summary);
          const transcriptEntry = entries.find(([key]) => /transcript|transcription/i.test(key));
          const otherEntries = entries.filter(([key]) => !/transcript|transcription/i.test(key));

          otherEntries.forEach(([key, value]) => {
            const row = document.createElement('div');
            const label = document.createElement('div');
            label.className = 'aiagent-summary-label';
            label.textContent = toLabel(key).toUpperCase();

            const content = document.createElement('div');
            content.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

            row.appendChild(label);
            row.appendChild(content);
            body.appendChild(row);
          });

          if (transcriptEntry) {
            const [key, value] = transcriptEntry;
            const row = document.createElement('div');
            const label = document.createElement('div');
            label.className = 'aiagent-summary-label';
            label.textContent = toLabel(key).toUpperCase();

            const content = document.createElement('pre');
            content.className = 'aiagent-summary-pre';
            content.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

            row.appendChild(label);
            row.appendChild(content);
            body.appendChild(row);
          }
        } else {
          const content = document.createElement('div');
          content.textContent = String(summary);
          body.appendChild(content);
        }

        card.appendChild(body);
        section.appendChild(card);
      });

      container.appendChild(section);
    });

    return container;
  }

  async function runSummary() {
    const token = localStorage.getItem(KEYS.bearer) || '';
    if (!token) {
      setStatus('Missing bearer token. Authenticate first.');
      return;
    }

    const env = envOptions[0]?.value;
    const startValue = startInput?.value || '';
    const endValue = endInput?.value || '';
    const summaryType = summaryTypeSelect?.value || '';
    const searchType = searchTypeSelect?.value || '';
    const orgId = (localStorage.getItem('authOrgId') || '').trim();
    const agentId = agentIdInput?.value.trim() || '';
    const interactionId = interactionIdInput?.value.trim() || '';

    if (!orgId) {
      setStatus('Org ID not found. Authenticate to load org context.');
      return;
    }

    if (searchType === 'AGENT' && !agentId) {
      setStatus('Agent CI User ID is required for AGENT search.');
      return;
    }

    if (searchType === 'INTERACTION' && !interactionId) {
      setStatus('Interaction ID is required for INTERACTION search.');
      return;
    }

    const payload = { orgId };
    const mappedSearchType = searchType === 'AGENT' ? 'ORGANIZATION' : searchType;
    if (mappedSearchType) payload.searchType = mappedSearchType;
    if (summaryType) payload.summaryType = summaryType;
    if (startValue) payload.startTime = new Date(startValue).toISOString();
    if (endValue) payload.endTime = new Date(endValue).toISOString();
    if (searchType === 'AGENT') payload.agentCiUserId = agentId;
    if (searchType === 'INTERACTION') payload.interactionId = interactionId;

    setStatus('Calling Summaries API...');

    try {
      const res = await fetch(env, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }

      if (!responseBox) return;
      responseBox.innerHTML = '';
      const rendered = renderSummaryResponse(parsed);
      if (rendered) {
        responseBox.appendChild(rendered);
      } else {
        responseBox.textContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
      }

      if (!res.ok) setStatus(`Error (${res.status})`);
    } catch (err) {
      if (responseBox) responseBox.textContent = String(err);
      setStatus('Request failed. Check console for details.');
    }
  }

  function updateSearchFields() {
    const type = searchTypeSelect?.value || '';
    agentIdInput?.closest('.aiagent-agent-field')?.classList.toggle('hidden', type !== 'AGENT');
    interactionIdInput?.closest('.aiagent-interaction-field')?.classList.toggle('hidden', type !== 'INTERACTION');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initDomRefs();
    initializeHeader();
    clearDefaultTimes();
    bindModeEvents();
    clearBotVisualizer();
    clearAiUtilManifest();
    loadBotFromStorage();
    updateSearchFields();
    bindStudioEvents();
    bindAiUtilEvents();
    bindAutonomousEvents();
    setActiveMode(pageState.activeMode);
    ensureAiUtilAssetsLoaded().catch((error) => {
      showAiUtilError(error.message || String(error));
      updateAiUtilPackageSummary();
    });

    searchTypeSelect?.addEventListener('change', updateSearchFields);
    runBtn?.addEventListener('click', runSummary);
    loadBotBtn?.addEventListener('click', loadSelectedBotJson);
    clearBotBtn?.addEventListener('click', clearBotVisualizer);
    botJsonFileInput?.addEventListener('change', () => {
      if (botFileNameDisplay) {
        botFileNameDisplay.textContent = botJsonFileInput.files?.[0]?.name || 'No file chosen';
      }
    });
  });
})();
