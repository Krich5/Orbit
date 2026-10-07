(function () {
  const KEYS = { bearer: 'authBearer' };
  const SPEAKER_COLORS = ['#f0ad4e', '#2dd4bf', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#34d399', '#fb923c'];

  const refs = {
    rangeSelect: document.getElementById('rangeSelect'),
    refreshBtn: document.getElementById('refreshBtn'),
    loadStatus: document.getElementById('loadStatus'),
    meetingsList: document.getElementById('meetingsList'),
    emptyState: document.getElementById('meetingsEmptyState'),
    detailContent: document.getElementById('meetingsDetailContent'),
    detailTitle: document.getElementById('detailTitle'),
    detailMeta: document.getElementById('detailMeta'),
    generateRecapBtn: document.getElementById('generateRecapBtn'),
    tabTranscriptBtn: document.getElementById('tabTranscriptBtn'),
    tabRecapBtn: document.getElementById('tabRecapBtn'),
    transcriptPanel: document.getElementById('transcriptPanel'),
    recapPanel: document.getElementById('recapPanel'),
    transcriptChat: document.getElementById('transcriptChat')
  };

  const state = { loading: false, rows: [], selectedIndex: -1 };

  // ── Utilities ──────────────────────────────────────────────────────────────

  function getToken() {
    return String(localStorage.getItem(KEYS.bearer) || '').replace(/^Bearer\s+/i, '').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(msg) {
    refs.loadStatus.textContent = msg || '';
  }

  function formatListDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return String(isoString);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function formatFullDateTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return String(isoString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date);
  }

  function defaultRangeDates(days) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  function colorForSpeaker(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
  }

  // ── VTT parsing ────────────────────────────────────────────────────────────

  function vttTimeToSeconds(raw) {
    const m = String(raw || '').trim().match(/(\d+):(\d+):(\d+)[.,](\d+)/);
    if (!m) return 0;
    const [, h, mnt, s, ms] = m;
    return Number(h) * 3600 + Number(mnt) * 60 + Number(s) + Number(ms) / 1000;
  }

  function parseVttStructured(vttText) {
    const entries = [];
    const blocks = String(vttText || '').trim().split(/\n{2,}/);
    blocks.forEach((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) return;
      const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
      const textLines = lines.filter((l) => !l.includes('-->') && !/^\d+$/.test(l) && l !== 'WEBVTT');
      const content = textLines.join(' ');
      const match = content.match(/^<v ([^>]+)>(.*)$/);
      const speaker = match ? match[1].trim() : '';
      const text = match ? match[2].trim() : content.trim();
      if (text) entries.push({ speaker, startSeconds: vttTimeToSeconds(startRaw), endSeconds: vttTimeToSeconds(endRaw), text });
    });
    return entries;
  }

  function groupBySpeaker(entries) {
    const groups = [];
    entries.forEach((entry) => {
      const last = groups[groups.length - 1];
      if (last && last.speaker === entry.speaker) {
        last.lines.push(entry.text);
        last.endSeconds = entry.endSeconds;
      } else {
        groups.push({ speaker: entry.speaker, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds, lines: [entry.text] });
      }
    });
    return groups;
  }

  function wallClockTime(meetingStartIso, offsetSeconds) {
    const base = new Date(meetingStartIso);
    if (Number.isNaN(base.getTime())) return '';
    const t = new Date(base.getTime() + offsetSeconds * 1000);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(t);
  }

  // ── API ────────────────────────────────────────────────────────────────────

  async function fetchTranscripts(fromIso, toIso, token) {
    const params = new URLSearchParams({ max: '100' });
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    const url = `https://webexapis.com/v1/meetingTranscripts?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;charset=UTF-8' }
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
    if (!response.ok) {
      throw new Error(payload?.message || payload?.errors?.[0]?.description || `HTTP ${response.status}`);
    }
    return Array.isArray(payload?.items) ? payload.items : [];
  }

  async function fetchVttText(url, token) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  function renderSidebar() {
    if (!state.rows.length) {
      refs.meetingsList.innerHTML = '<div class="meetingsListEmpty">No meetings found for this range.</div>';
      return;
    }
    refs.meetingsList.innerHTML = state.rows.map((row, index) => `
      <button class="meetingItem${index === state.selectedIndex ? ' selected' : ''}" type="button" data-index="${index}">
        <div class="meetingItemTitle">${escapeHtml(row.meetingTopic || 'Untitled meeting')}</div>
        <div class="meetingItemMeta">${escapeHtml(formatListDate(row.startTime))}</div>
      </button>
    `).join('');
  }

  // ── Detail / transcript ────────────────────────────────────────────────────

  function renderTranscriptChat(row) {
    if (!row.groups || !row.groups.length) {
      refs.transcriptChat.innerHTML = '<p class="helperText">No spoken content found in this transcript.</p>';
      return;
    }
    refs.transcriptChat.innerHTML = row.groups.map((group) => `
      <div class="chatTurn">
        <div class="chatTurnHeader">
          <span class="chatSpeaker" style="color:${colorForSpeaker(group.speaker || 'Unknown')}">${escapeHtml(group.speaker || 'Unknown speaker')}</span>
          <span class="chatTime">${escapeHtml(wallClockTime(row.startTime, group.startSeconds))}</span>
        </div>
        <div class="chatLines">${group.lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      </div>
    `).join('');
  }

  function updateDetailMeta(row) {
    const parts = [escapeHtml(formatFullDateTime(row.startTime))];
    if (typeof row.durationMinutes === 'number') {
      parts.push(`${row.durationMinutes} min`);
    }
    const url = row.txtDownloadLink || row.vttDownloadLink;
    let html = parts.join(' &middot; ');
    if (url) {
      html += ` &middot; <a class="downloadLink" href="#" id="detailDownloadLink">Download</a>`;
    }
    refs.detailMeta.innerHTML = html;
    const downloadLink = document.getElementById('detailDownloadLink');
    if (downloadLink) downloadLink.addEventListener('click', (e) => handleDownloadClick(e, row));
  }

  async function selectMeeting(index) {
    const row = state.rows[index];
    if (!row) return;

    state.selectedIndex = index;
    renderSidebar();

    refs.emptyState.style.display = 'none';
    refs.detailContent.style.display = 'flex';
    refs.detailTitle.textContent = row.meetingTopic || 'Untitled meeting';
    updateDetailMeta(row);
    showTab('transcript');

    if (row.groups) {
      renderTranscriptChat(row);
      return;
    }

    const url = row.vttDownloadLink || row.txtDownloadLink;
    if (!url) {
      refs.transcriptChat.innerHTML = '<p class="helperText">No transcript is available for this meeting.</p>';
      return;
    }

    const token = getToken();
    if (!token) {
      refs.transcriptChat.innerHTML = '<p class="helperText">Sign in through Orbit to view transcripts.</p>';
      return;
    }

    refs.transcriptChat.innerHTML = '<p class="helperText">Loading transcript…</p>';
    try {
      const vttText = await fetchVttText(url, token);
      const entries = parseVttStructured(vttText);
      row.groups = groupBySpeaker(entries);
      if (entries.length) {
        row.durationMinutes = Math.max(0, Math.round((entries[entries.length - 1].endSeconds - entries[0].startSeconds) / 60));
        updateDetailMeta(row);
      }
      if (state.selectedIndex === index) renderTranscriptChat(row);
    } catch (err) {
      refs.transcriptChat.innerHTML = `<p class="helperText" style="color:#ef4444">Failed to load transcript: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function handleDownloadClick(e, row) {
    e.preventDefault();
    const url = row.txtDownloadLink || row.vttDownloadLink;
    if (!url) return;
    const token = getToken();
    if (!token) return;

    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const ext = url.includes('format=vtt') ? 'vtt' : 'txt';
      const slug = (row.meetingTopic || 'transcript')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'transcript';
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${slug}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch { /* silent — a failed download isn't worth blocking the page over */ }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  function showTab(tab) {
    const isTranscript = tab === 'transcript';
    refs.tabTranscriptBtn.classList.toggle('active', isTranscript);
    refs.tabRecapBtn.classList.toggle('active', !isTranscript);
    refs.transcriptPanel.style.display = isTranscript ? '' : 'none';
    refs.recapPanel.style.display = isTranscript ? 'none' : '';
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  async function loadMeetings() {
    if (state.loading) return;
    const token = getToken();
    if (!token) { setStatus('Sign in through Orbit to load meetings.'); return; }

    const { from, to } = defaultRangeDates(Number(refs.rangeSelect.value));

    state.loading = true;
    refs.refreshBtn.disabled = true;
    setStatus('Loading meetings…');

    try {
      const items = await fetchTranscripts(from.toISOString(), to.toISOString(), token);
      state.rows = items
        .slice()
        .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
        .map((item) => ({
          meetingTopic: item.meetingTopic,
          startTime: item.startTime,
          vttDownloadLink: item.vttDownloadLink,
          txtDownloadLink: item.txtDownloadLink
        }));
      state.selectedIndex = -1;
      refs.emptyState.style.display = '';
      refs.detailContent.style.display = 'none';
      renderSidebar();
      setStatus(`Loaded ${state.rows.length} meeting${state.rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      state.rows = [];
      refs.meetingsList.innerHTML = `<div class="meetingsListEmpty" style="color:#ef4444">${escapeHtml(err.message || 'Failed to load meetings.')}</div>`;
      setStatus(`Error: ${err.message}`);
    } finally {
      state.loading = false;
      refs.refreshBtn.disabled = false;
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    refs.refreshBtn.addEventListener('click', loadMeetings);
    refs.rangeSelect.addEventListener('change', loadMeetings);
    refs.meetingsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.meetingItem');
      if (!btn) return;
      selectMeeting(Number(btn.dataset.index));
    });
    refs.tabTranscriptBtn.addEventListener('click', () => showTab('transcript'));
    refs.tabRecapBtn.addEventListener('click', () => showTab('recap'));
    refs.generateRecapBtn.addEventListener('click', () => showTab('recap'));
    loadMeetings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
