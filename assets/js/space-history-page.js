(function () {
  const KEYS = {
    bearer: 'authBearer',
    user: 'authUserName',
    org: 'authOrg',
    orgName: 'authOrgName'
  };
  const MAX_PAGE_SIZE = 100;
  const PEOPLE_BATCH = 50;
  const TZ_MAP = {
    browser: null,
    PT: 'America/Los_Angeles',
    MST: 'America/Denver',
    CT: 'America/Chicago',
    EST: 'America/New_York'
  };

  const refs = {
    spaceFilterInput: document.getElementById('spaceFilterInput'),
    spaceListWrap: document.getElementById('spaceListWrap'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    loadStatus: document.getElementById('loadStatus'),
    tzSelect: document.getElementById('tzSelect'),
    thTimestamp: document.getElementById('thTimestamp'),
    messageCountValue: document.getElementById('messageCountValue'),
    messageRangeValue: document.getElementById('messageRangeValue'),
    participantCountValue: document.getElementById('participantCountValue'),
    participantPreviewValue: document.getElementById('participantPreviewValue'),
    replyCountValue: document.getElementById('replyCountValue'),
    fileCountValue: document.getElementById('fileCountValue'),
    resultsBody: document.getElementById('resultsBody')
  };

  const state = {
    loading: false,
    room: null,
    rows: [],
    parentMap: {},
    timezone: 'browser',
    sortDir: 'desc',
    allSpaces: [],
    spacesLoaded: false,
    spacesLoading: false,
    selectedSpaceId: null
  };

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

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  function stripHtml(value) {
    if (!value) return '';
    const div = document.createElement('div');
    div.innerHTML = value;
    return normalizeWhitespace(div.textContent || div.innerText || '');
  }

  function parseLinkHeader(value) {
    const links = {};
    String(value || '').split(',').map(p => p.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/i);
      if (m) links[m[2]] = m[1];
    });
    return links;
  }

  function displayLocalTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return String(dateString);
    const tz = TZ_MAP[state.timezone];
    const options = {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true
    };
    if (tz) options.timeZone = tz;
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }

  function setStatus(msg) {
    refs.loadStatus.textContent = msg || '';
  }

  function updateSortHeader() {
    refs.thTimestamp.textContent = `Timestamp ${state.sortDir === 'desc' ? '↓' : '↑'}`;
  }

  function setExportDisabled(disabled) {
    refs.exportBtn.disabled = disabled;
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // ── API ────────────────────────────────────────────────────────────────────

  async function apiFetchJson(url, token) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { message: text }; }
    if (!response.ok) {
      throw new Error(payload?.message || payload?.errors?.[0]?.description || `HTTP ${response.status}`);
    }
    return { payload, response };
  }

  async function fetchRoom(roomId, token) {
    const { payload } = await apiFetchJson(`https://webexapis.com/v1/rooms/${encodeURIComponent(roomId)}`, token);
    return payload;
  }

  async function fetchAllMessages(roomId, token) {
    const all = [];
    const seen = new Set();
    let nextUrl = `https://webexapis.com/v1/messages?roomId=${encodeURIComponent(roomId)}&max=${MAX_PAGE_SIZE}`;
    let page = 0;

    while (nextUrl) {
      page += 1;
      setStatus(`Loading page ${page} — ${all.length} messages so far…`);
      const { payload, response } = await apiFetchJson(nextUrl, token);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      items.forEach(item => {
        if (!item?.id || seen.has(item.id)) return;
        seen.add(item.id);
        all.push(item);
      });

      const links = parseLinkHeader(response.headers.get('Link'));
      if (links.next) { nextUrl = links.next; continue; }
      if (items.length === MAX_PAGE_SIZE) {
        const oldest = items[items.length - 1];
        if (oldest?.id && !nextUrl.includes('beforeMessage=')) {
          nextUrl = `https://webexapis.com/v1/messages?roomId=${encodeURIComponent(roomId)}&max=${MAX_PAGE_SIZE}&beforeMessage=${encodeURIComponent(oldest.id)}`;
          continue;
        }
      }
      nextUrl = '';
    }
    return all;
  }

  async function fetchAllRooms(token) {
    const all = [];
    const seen = new Set();
    let nextUrl = `https://webexapis.com/v1/rooms?max=1000&sortBy=lastactivity`;
    while (nextUrl) {
      const { payload, response } = await apiFetchJson(nextUrl, token);
      (payload?.items || []).forEach(item => {
        if (!item?.id || seen.has(item.id)) return;
        seen.add(item.id);
        all.push(item);
      });
      nextUrl = parseLinkHeader(response.headers.get('Link')).next || '';
    }
    return all;
  }

  async function fetchPeopleDetails(personIds, token) {
    const map = {};
    for (let i = 0; i < personIds.length; i += PEOPLE_BATCH) {
      const batch = personIds.slice(i, i + PEOPLE_BATCH);
      try {
        const { payload } = await apiFetchJson(
          `https://webexapis.com/v1/people?id=${batch.map(encodeURIComponent).join(',')}`,
          token
        );
        (payload?.items || []).forEach(p => {
          map[p.id] = { displayName: p.displayName || '', title: p.title || '' };
        });
      } catch { /* enrichment is optional */ }
    }
    return map;
  }

  // ── Space List ─────────────────────────────────────────────────────────────

  function renderSpaceList(filter) {
    const query = (filter || '').trim().toLowerCase();
    const spaces = query
      ? state.allSpaces.filter(s => (s.title || '').toLowerCase().includes(query))
      : state.allSpaces;

    if (!spaces.length) {
      refs.spaceListWrap.innerHTML = `<div class="spaceLoadingRow">${query ? 'No spaces match that filter.' : 'No spaces found.'}</div>`;
      return;
    }

    refs.spaceListWrap.innerHTML = spaces.map(space => `
      <div class="spaceItem${state.selectedSpaceId === space.id ? ' selected' : ''}" data-id="${escapeHtml(space.id)}">
        <span class="spaceName">${escapeHtml(space.title || space.id)}</span>
        <span class="spaceTypeBadge">${space.type === 'direct' ? 'Direct' : 'Group'}</span>
      </div>
    `).join('');

    refs.spaceListWrap.querySelectorAll('.spaceItem').forEach(item => {
      item.addEventListener('click', () => loadHistory(item.dataset.id));
    });
  }

  async function loadSpaces() {
    if (state.spacesLoading) return;
    const token = getToken();
    if (!token) {
      refs.spaceListWrap.innerHTML = `<div class="spaceLoadingRow">Sign in through Orbit to browse spaces.</div>`;
      return;
    }
    state.spacesLoading = true;
    refs.spaceListWrap.innerHTML = `<div class="spaceLoadingRow">Loading your spaces…</div>`;
    try {
      const spaces = await fetchAllRooms(token);
      spaces.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      state.allSpaces = spaces;
      state.spacesLoaded = true;
      renderSpaceList(refs.spaceFilterInput.value);
    } catch (err) {
      refs.spaceListWrap.innerHTML = `<div class="spaceLoadingRow" style="color:#ef4444">Failed to load spaces: ${escapeHtml(err.message)}</div>`;
    } finally {
      state.spacesLoading = false;
    }
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  function normalizeMessage(item, index, roomMeta) {
    const plainText = normalizeWhitespace(item.text || stripHtml(item.html) || item.markdown || '');
    const sender = item.personDisplayName || item.personEmail || item.personId || 'Unknown';
    const files = Array.isArray(item.files) ? item.files : [];
    return {
      index,
      roomId: roomMeta?.id || item.roomId || '',
      roomTitle: roomMeta?.title || '',
      messageId: item.id || '',
      parentId: item.parentId || '',
      created: item.created || '',
      createdUtc: item.created ? new Date(item.created).toISOString() : '',
      sender,
      senderTitle: '',
      senderEmail: item.personEmail || '',
      personId: item.personId || '',
      roomType: item.roomType || roomMeta?.type || '',
      messageType: item.parentId ? 'Reply' : 'Message',
      text: plainText,
      markdown: normalizeWhitespace(item.markdown || ''),
      hasFiles: files.length ? 'Yes' : 'No',
      files: files.join('\n'),
      mentionedPeople: Array.isArray(item.mentionedPeople) ? item.mentionedPeople.join(', ') : ''
    };
  }

  function buildParentMap() {
    state.parentMap = {};
    state.rows.forEach(row => {
      state.parentMap[row.messageId] = { sender: row.sender, senderTitle: row.senderTitle, text: row.text };
    });
  }

  async function enrichSenders() {
    const token = getToken();
    if (!token || !state.rows.length) return;
    const personIds = [...new Set(state.rows.map(r => r.personId).filter(Boolean))];
    if (!personIds.length) return;

    setStatus('Enriching sender names…');
    const map = await fetchPeopleDetails(personIds, token);
    let updated = false;
    state.rows.forEach(row => {
      const p = map[row.personId];
      if (!p) return;
      if (p.displayName && p.displayName !== row.sender) { row.sender = p.displayName; updated = true; }
      if (p.title && p.title !== row.senderTitle) { row.senderTitle = p.title; updated = true; }
    });
    if (updated) {
      buildParentMap();
      renderRows();
      updateSummary();
    }
    setStatus('');
  }

  function updateSummary() {
    const rows = state.rows;
    const senders = [...new Set(rows.map(r => r.senderEmail || r.sender).filter(Boolean))];
    const replies = rows.filter(r => r.parentId).length;
    const fileRows = rows.filter(r => r.hasFiles === 'Yes').length;
    const first = rows[0];
    const last = rows[rows.length - 1];
    refs.messageCountValue.textContent = String(rows.length);
    refs.messageRangeValue.textContent = rows.length
      ? `${displayLocalTime(first.created)} to ${displayLocalTime(last.created)}`
      : 'No data loaded';
    refs.participantCountValue.textContent = String(senders.length);
    refs.participantPreviewValue.textContent = senders.length ? senders.slice(0, 3).join(' | ') : 'No senders yet';
    refs.replyCountValue.textContent = String(replies);
    refs.fileCountValue.textContent = `${fileRows} messages with files`;
  }

  function fileAttachmentsHtml(filesStr) {
    if (!filesStr) return '';
    const urls = filesStr.split('\n').filter(Boolean);
    const items = urls.map((url, i) => {
      return `<div class="fileAttachment">📎 <a href="#" data-webex-file="${escapeHtml(url)}" data-file-index="${i}">attachment</a></div>`;
    }).join('');
    return `<div class="fileAttachments">${items}</div>`;
  }

  async function handleFileClick(e) {
    const link = e.target.closest('a[data-webex-file]');
    if (!link) return;
    e.preventDefault();
    if (link.dataset.fetching) return;

    const url = link.dataset.webexFile;
    const token = getToken();
    if (!token) return;

    link.dataset.fetching = '1';
    const original = link.textContent;
    link.textContent = 'loading…';
    link.style.opacity = '0.6';

    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const disposition = resp.headers.get('content-disposition') || '';
      const nameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)["']?/i);
      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      const filename = nameMatch ? nameMatch[1].trim() : `attachment-${link.dataset.fileIndex || 0}`;

      const blob = new Blob([await resp.arrayBuffer()], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);

      if (contentType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = blobUrl;
        img.className = 'inlineImage';
        img.title = filename;
        img.addEventListener('click', () => window.open(blobUrl, '_blank'));
        link.parentNode.replaceChild(img, link);
        // blob URL kept alive — img still needs it
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        link.textContent = filename;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      }
    } catch {
      link.textContent = '❌ failed';
      link.style.opacity = '';
    } finally {
      delete link.dataset.fetching;
    }
  }

  // ── Render (threaded) ──────────────────────────────────────────────────────

  function renderRows() {
    const rows = state.rows;

    if (!rows.length) {
      refs.resultsBody.innerHTML = '<tr><td colspan="4" class="emptyState" style="padding:14px 12px">No messages match.</td></tr>';
      return;
    }

    // Build reply groups: parentId → [reply rows] for parents in this history
    const msgIdSet = new Set(rows.map(r => r.messageId));
    const replyMap = {};
    rows.forEach(row => {
      if (row.parentId && msgIdSet.has(row.parentId)) {
        if (!replyMap[row.parentId]) replyMap[row.parentId] = [];
        replyMap[row.parentId].push(row);
      }
    });

    // Replies with a known parent are rendered inside the parent row — skip standalone
    const groupedIds = new Set();
    rows.forEach(row => {
      if (row.parentId && msgIdSet.has(row.parentId)) groupedIds.add(row.messageId);
    });

    // Top-level rows sorted by display direction; replies always chronological within threads
    const topLevel = rows.filter(row => !groupedIds.has(row.messageId));
    topLevel.sort((a, b) => state.sortDir === 'desc'
      ? new Date(b.created) - new Date(a.created)
      : new Date(a.created) - new Date(b.created)
    );

    let html = '';
    topLevel.forEach(row => {
      const replies = (replyMap[row.messageId] || [])
        .slice().sort((a, b) => new Date(a.created) - new Date(b.created));

      // Standalone reply whose parent isn't in loaded history
      let orphanNote = '';
      if (row.parentId && !msgIdSet.has(row.parentId)) {
        orphanNote = `<div style="font-size:11px;color:var(--muted);font-style:italic;margin-bottom:4px">↩ Reply — parent not in loaded history</div>`;
      }

      const threadHtml = replies.length ? `
        <div class="threadBlock">
          <div class="threadBlockLabel">${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}</div>
          ${replies.map(reply => `
            <div class="threadReply">
              <div class="threadReplyMeta">
                <span class="threadReplySender">${escapeHtml(reply.sender)}</span>
                ${reply.senderTitle ? `<span class="threadReplySenderTitle">${escapeHtml(reply.senderTitle)}</span>` : ''}
                <span class="threadReplyTime">${escapeHtml(displayLocalTime(reply.created))}</span>
              </div>
              <div class="threadReplyText">${escapeHtml((reply.text || reply.markdown || '[no text content]').trim())}</div>
              ${fileAttachmentsHtml(reply.files)}
            </div>
          `).join('')}
        </div>` : '';

      html += `<tr>
        <td>${row.index}</td>
        <td style="white-space:nowrap">${escapeHtml(displayLocalTime(row.created))}</td>
        <td style="white-space:nowrap">
          <div class="senderLine">${escapeHtml(row.sender)}</div>
          ${row.senderTitle ? `<div class="senderTitle">${escapeHtml(row.senderTitle)}</div>` : ''}
        </td>
        <td class="messageCell">${orphanNote}${escapeHtml(row.text || row.markdown || '[no text content]')}${fileAttachmentsHtml(row.files)}${threadHtml}</td>
      </tr>`;
    });

    refs.resultsBody.innerHTML = html;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  function buildExportFilename() {
    const slug = (state.room?.title || state.room?.id || 'webex-space')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'webex-space';
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `${slug}-history-${stamp}.txt`;
  }

  function exportTxt() {
    const tzLabel = state.timezone === 'browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : state.timezone;
    const lines = [];
    lines.push(`SPACE: ${state.room?.title || ''}`);
    lines.push(`EXPORTED: ${displayLocalTime(new Date().toISOString())} (${tzLabel})`);
    lines.push(`MESSAGES: ${state.rows.length}`);
    lines.push('='.repeat(70));
    lines.push('');

    const msgIdSet = new Set(state.rows.map(r => r.messageId));
    const replyMap = {};
    state.rows.forEach(row => {
      if (row.parentId && msgIdSet.has(row.parentId)) {
        if (!replyMap[row.parentId]) replyMap[row.parentId] = [];
        replyMap[row.parentId].push(row);
      }
    });
    const groupedIds = new Set();
    state.rows.forEach(row => {
      if (row.parentId && msgIdSet.has(row.parentId)) groupedIds.add(row.messageId);
    });

    state.rows.forEach(row => {
      if (groupedIds.has(row.messageId)) return;

      const titleSuffix = row.senderTitle ? ` · ${row.senderTitle}` : '';
      lines.push(`${row.sender}${titleSuffix}  [${displayLocalTime(row.created)}]`);
      if (row.parentId && !msgIdSet.has(row.parentId)) lines.push(`  (reply — parent not in export)`);
      lines.push(row.text || row.markdown || '[no text content]');
      if (row.files) lines.push(`[attached files: ${row.files.replace(/\n/g, ', ')}]`);

      const replies = replyMap[row.messageId] || [];
      if (replies.length) {
        lines.push('');
        replies.forEach((reply, i) => {
          const rtitle = reply.senderTitle ? ` · ${reply.senderTitle}` : '';
          const prefix = i === replies.length - 1 ? '  └─' : '  ├─';
          const indent = `  ${i === replies.length - 1 ? '   ' : '  │'} `;
          lines.push(`${prefix} ${reply.sender}${rtitle}  [${displayLocalTime(reply.created)}]`);
          (reply.text || reply.markdown || '').split('\n').forEach(l => {
            lines.push(`${indent}${l}`);
          });
          if (reply.files) {
            reply.files.split('\n').filter(Boolean).forEach(url => {
              lines.push(`${indent}📎 ${url}`);
            });
          }
        });
      }

      lines.push('');
      lines.push('─'.repeat(70));
      lines.push('');
    });

    downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' }), buildExportFilename());
  }

  // ── Load History ───────────────────────────────────────────────────────────

  async function loadHistory(roomId) {
    if (state.loading) return;
    const token = getToken();
    if (!token) { setStatus('Sign in through Orbit to load history.'); return; }
    if (!roomId) return;

    state.loading = true;
    state.selectedSpaceId = roomId;
    refs.clearBtn.disabled = true;
    setExportDisabled(true);
    renderSpaceList(refs.spaceFilterInput.value);
    setStatus('Resolving space…');

    try {
      const room = await fetchRoom(roomId, token);
      const items = await fetchAllMessages(roomId, token);
      const rows = items
        .slice()
        .sort((a, b) => new Date(a.created || 0) - new Date(b.created || 0))
        .map((item, i) => normalizeMessage(item, i + 1, room));

      state.room = { id: room.id || roomId, title: room.title || roomId, type: room.type || '', lastActivity: room.lastActivity || '' };
      state.rows = rows;
      buildParentMap();

      updateSummary();
      renderRows();
      setExportDisabled(rows.length === 0);
      setStatus(`Loaded ${rows.length} messages from "${state.room.title}".`);

      enrichSenders();
    } catch (err) {
      state.room = null;
      state.rows = [];
      state.parentMap = {};
      refs.resultsBody.innerHTML = `<tr><td colspan="4" class="emptyState" style="padding:14px 12px;color:#ef4444">${escapeHtml(err.message || 'Failed to load history.')}</td></tr>`;
      setStatus(`Error: ${err.message}`);
    } finally {
      state.loading = false;
      refs.clearBtn.disabled = false;
    }
  }

  // ── Clear ──────────────────────────────────────────────────────────────────

  function clearState() {
    state.room = null;
    state.rows = [];
    state.parentMap = {};
    state.selectedSpaceId = null;
    refs.resultsBody.innerHTML = '<tr><td colspan="4" class="emptyState" style="padding:14px 12px">Select a space above to load its history.</td></tr>';
    refs.messageCountValue.textContent = '0';
    refs.messageRangeValue.textContent = 'No data loaded';
    refs.participantCountValue.textContent = '0';
    refs.participantPreviewValue.textContent = 'No senders yet';
    refs.replyCountValue.textContent = '0';
    refs.fileCountValue.textContent = '0 messages with files';
    setExportDisabled(true);
    setStatus('');
    renderSpaceList(refs.spaceFilterInput.value);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    refs.clearBtn.addEventListener('click', clearState);
    refs.exportBtn.addEventListener('click', exportTxt);
    refs.resultsBody.addEventListener('click', handleFileClick);
    refs.spaceFilterInput.addEventListener('input', () => {
      if (state.spacesLoaded) renderSpaceList(refs.spaceFilterInput.value);
    });
    refs.tzSelect.addEventListener('change', () => {
      state.timezone = refs.tzSelect.value;
      if (state.rows.length) { renderRows(); updateSummary(); }
    });
    refs.thTimestamp.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      updateSortHeader();
      if (state.rows.length) renderRows();
    });

    loadSpaces();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
