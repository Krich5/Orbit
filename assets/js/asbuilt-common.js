// Shared helpers for the "Generate As-Built Docs" pages
// (pages/asbuilt/wxc.html and pages/asbuilt/wxcc.html). Both pages have
// the same shell: a checkbox grid, a Generate button, a log area, and
// a Select-all/Clear pair. Only the resource catalog + fetchers differ.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // log/setStatus write into the (hidden) legacy DOM AND into the
  // progress modal's own log element. That way scattered setStatus()
  // calls still have a sink and the user sees everything in the modal.
  function log(html, cls) {
    const targets = [$('asbuiltLog'), $('asbuiltOverlayLog')].filter(Boolean);
    targets.forEach((el) => {
      const line = document.createElement('span');
      if (cls) line.className = cls;
      line.textContent = html + '\n';
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    });
  }
  function clearLog() {
    [$('asbuiltLog'), $('asbuiltOverlayLog')].forEach((el) => { if (el) el.textContent = ''; });
  }
  function setStatus(text) { const el = $('asbuiltStatus'); if (el) el.textContent = text; }

  // ─── Progress modal ────────────────────────────────────────────────
  // Shown for the duration of a Run. Progress bar + step counter fed
  // from the loop below; Cancel flips a shared flag that the loop
  // checks between resources.
  let cancelRequested = false;

  function openOverlay(totalSteps) {
    const ov = $('asbuiltOverlay');
    if (!ov) return;
    cancelRequested = false;
    setOverlayStep(0, totalSteps);
    setOverlaySub('Fetching resources');
    setOverlayTitle('Generating as-built...');
    const cancelBtn = $('asbuiltOverlayCancel');
    const closeBtn = $('asbuiltOverlayClose');
    if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.hidden = false; cancelBtn.textContent = 'Cancel'; }
    if (closeBtn) { closeBtn.hidden = true; }
    const logEl = $('asbuiltOverlayLog');
    if (logEl) logEl.textContent = '';
    const resEl = $('asbuiltOverlayResources');
    if (resEl) resEl.innerHTML = '';
    ov.classList.add('is-open');
    ov.setAttribute('aria-hidden', 'false');
    // Wire cancel every open (idempotent -- addEventListener replaces
    // via onclick assignment instead so re-opening doesn't stack).
    if (cancelBtn) cancelBtn.onclick = () => {
      cancelRequested = true;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
      setOverlaySub('Finishing current step, then stopping...');
    };
    if (closeBtn) closeBtn.onclick = () => closeOverlay();
  }

  // Seed the per-resource status list. Every picked resource gets one
  // row, sorted in the order the user picked them, so nothing can look
  // "skipped" even when parallel fetches finish out of order.
  function primeResourceList(pickedResources) {
    const list = $('asbuiltOverlayResources');
    if (!list) return;
    list.innerHTML = pickedResources.map((r) => `
      <li class="asbuilt-overlay__res" data-state="pending" data-res-id="${r.id}">
        <span class="asbuilt-overlay__res-icon" aria-hidden="true">-</span>
        <span class="asbuilt-overlay__res-label">${r.label}</span>
        <span class="asbuilt-overlay__res-detail">queued</span>
      </li>
    `).join('');
  }
  function updateResourceRow(id, state, detail) {
    const row = document.querySelector(`.asbuilt-overlay__res[data-res-id="${id}"]`);
    if (!row) return;
    row.setAttribute('data-state', state);
    const icon = row.querySelector('.asbuilt-overlay__res-icon');
    const det = row.querySelector('.asbuilt-overlay__res-detail');
    if (icon) icon.textContent = ({ pending: '-', fetching: '/', done: '✓', failed: '✕', cancelled: '○' })[state] || '-';
    if (det && detail != null) det.textContent = detail;
  }
  function closeOverlay() {
    const ov = $('asbuiltOverlay');
    if (!ov) return;
    ov.classList.remove('is-open');
    ov.setAttribute('aria-hidden', 'true');
  }
  function setOverlayTitle(text) { const el = $('asbuiltOverlayTitle'); if (el) el.textContent = text; }
  function setOverlaySub(text)   { const el = $('asbuiltOverlaySub');   if (el) el.textContent = text; }
  function setOverlayStep(cur, total) {
    const stepEl = $('asbuiltOverlayStep');
    const pctEl = $('asbuiltOverlayPct');
    const bar = $('asbuiltOverlayBar');
    const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
    if (stepEl) stepEl.textContent = `${cur} / ${total}`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (bar) bar.style.width = `${pct}%`;
  }
  function finishOverlay(msg, ok) {
    setOverlayTitle(ok ? 'Done.' : (cancelRequested ? 'Cancelled.' : 'Finished with errors.'));
    setOverlaySub(msg || '');
    setOverlayStep(1, 1);
    const cancelBtn = $('asbuiltOverlayCancel');
    const closeBtn = $('asbuiltOverlayClose');
    if (cancelBtn) cancelBtn.hidden = true;
    if (closeBtn) closeBtn.hidden = false;
  }

  // Render the checkbox grid from a resource catalog. Each entry:
  //   { id, label, defaultChecked?: bool }
  // Card click toggles the checkbox; visual highlight follows the state.
  function renderResourceGrid(resources) {
    const grid = $('asbuiltResourceGrid');
    if (!grid) return;
    grid.innerHTML = resources.map(resourceCardHtml).join('');
    wireResourceGrid(grid);
  }

  // Grouped variant used by the unified "Create As-Built" page:
  //   groups = [{ label: 'Webex Calling', resources: [...] }, ...]
  // Renders a header per group with its own inner grid, but keeps the
  // same checkbox contract so selectedResourceIds()/generateAsBuilt
  // work unchanged.
  function renderGroupedResourceGrid(groups) {
    const grid = $('asbuiltResourceGrid');
    if (!grid) return;
    grid.innerHTML = groups.map((g) => `
      <div class="asbuilt-group" data-group-id="${g.id || g.label}">
        <div class="asbuilt-group__head">
          <h3 class="asbuilt-group__title">${g.label}</h3>
          <div class="asbuilt-quick asbuilt-group__quick">
            <button type="button" data-group-select="all">All</button>
            <button type="button" data-group-select="none">None</button>
          </div>
        </div>
        <div class="asbuilt-group__grid">
          ${g.resources.map(resourceCardHtml).join('')}
        </div>
      </div>
    `).join('');
    wireResourceGrid(grid);
    // Per-group select-all/none uses the buttons INSIDE that group's
    // header (each group carries its own pair).
    grid.querySelectorAll('.asbuilt-group').forEach((groupEl) => {
      groupEl.querySelectorAll('button[data-group-select]').forEach((b) => {
        b.addEventListener('click', () => {
          const check = b.dataset.groupSelect === 'all';
          groupEl.querySelectorAll('input[data-asbuilt-resource]').forEach((cb) => {
            cb.checked = check;
            cb.closest('.asbuilt-check')?.classList.toggle('is-selected', check);
          });
        });
      });
    });
  }

  function resourceCardHtml(r) {
    return `
      <label class="asbuilt-check ${r.defaultChecked ? 'is-selected' : ''}" data-resource-id="${r.id}">
        <input type="checkbox" data-asbuilt-resource="${r.id}" ${r.defaultChecked ? 'checked' : ''}>
        <span>${r.label}</span>
      </label>
    `;
  }

  function wireResourceGrid(grid) {
    grid.querySelectorAll('input[data-asbuilt-resource]').forEach((cb) => {
      cb.addEventListener('change', () => {
        cb.closest('.asbuilt-check')?.classList.toggle('is-selected', cb.checked);
      });
    });
    document.querySelectorAll('.asbuilt-quick button[data-select]').forEach((b) => {
      b.addEventListener('click', () => {
        const check = b.dataset.select === 'all';
        grid.querySelectorAll('input[data-asbuilt-resource]').forEach((cb) => {
          cb.checked = check;
          cb.closest('.asbuilt-check')?.classList.toggle('is-selected', check);
        });
      });
    });
  }

  function selectedResourceIds() {
    return Array.from(document.querySelectorAll('input[data-asbuilt-resource]:checked'))
      .map((cb) => cb.dataset.asbuiltResource);
  }

  // Convert an array of row objects into a worksheet. Column order is
  // derived from `columns` (an array of {key, header}) so we can present
  // a clean, ordered layout instead of Object.keys() insertion order.
  function rowsToSheet(rows, columns) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const header = columns.map((c) => c.header);
    const data = [header].concat(safeRows.map((r) => columns.map((c) => {
      const v = r?.[c.key];
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
      try { return JSON.stringify(v); } catch { return String(v); }
    })));
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Auto-ish column widths -- clamp so one huge cell doesn't blow out
    // the whole column.
    ws['!cols'] = columns.map((c) => {
      let max = String(c.header).length;
      safeRows.forEach((r) => {
        const v = r?.[c.key];
        const len = v == null ? 0 : (typeof v === 'string' ? v.length : String(v).length);
        if (len > max) max = len;
      });
      return { wch: Math.min(60, Math.max(10, max + 2)) };
    });
    return ws;
  }

  function excelSheetName(name) {
    // Excel: 31 char max, no []:/\?*
    return String(name).replace(/[\[\]:/\\?*]/g, ' ').slice(0, 31) || 'Sheet';
  }

  function downloadWorkbook(wb, filename) {
    XLSX.writeFile(wb, filename);
  }

  // Write a JSZip archive to disk without ever OOMing the tab. Two
  // paths, both driven by generateInternalStream (JSZip's chunked
  // emitter):
  //
  //   1. File System Access API (Chrome/Edge, WHEN a fresh user gesture
  //      is still active). Streams chunks straight to a file handle
  //      with backpressure; memory stays flat regardless of bundle
  //      size. On big as-builts the fetch phase eats the transient
  //      activation from the Run click, so showSaveFilePicker throws
  //      SecurityError/NotAllowedError -- we treat that as "gesture
  //      gone" and silently drop to path 2 instead of surfacing an
  //      error.
  //   2. Chunked-Blob download (all browsers, no user gesture needed).
  //      Push every emitted chunk into an array of Uint8Arrays, then
  //      hand the array straight to `new Blob(...)`. Blob's backing
  //      store handles paging without forcing a single giant
  //      contiguous allocation -- which is what actually blew up
  //      generateAsync({type:'blob'}) on the 86-flow bundle.
  async function saveZipStreaming(zip, suggestedName, sheetsAdded, fileCount) {
    const zipOpts = {
      type: 'uint8array',
      streamFiles: true,
      // PDFs are already compressed; DEFLATE would burn CPU for <5%
      // gain. Storing is fast and keeps CPU pressure off the main
      // thread.
      compression: 'STORE'
    };

    // Path 1: direct-to-disk via File System Access API.
    if (typeof window.showSaveFilePicker === 'function') {
      let fileHandle = null;
      try {
        fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }]
        });
      } catch (err) {
        const name = err && err.name || '';
        if (name === 'AbortError') {
          log('Save cancelled.', 'warn');
          setOverlaySub('Save cancelled.');
          return;
        }
        // NotAllowedError / SecurityError: the transient user
        // activation from the Run click was consumed during the fetch
        // phase, so the picker refuses. Fall through to the Blob path
        // below -- still saves reliably, just via the browser's normal
        // download flow into ~/Downloads.
        if (name !== 'NotAllowedError' && name !== 'SecurityError') {
          throw err;
        }
        log(`Save dialog needs a fresh click -- downloading via browser instead.`, 'warn');
      }

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        let lastPct = -1;
        try {
          await new Promise((resolve, reject) => {
            const stream = zip.generateInternalStream(zipOpts);
            stream.on('data', function (chunk, meta) {
              // Write each chunk, then wait for the write to land
              // before letting the next chunk through -- otherwise the
              // stream races ahead of disk and OOMs the WritableStream
              // queue.
              stream.pause();
              writable.write(chunk).then(() => {
                const pct = Math.round(meta.percent || 0);
                if (pct !== lastPct) {
                  lastPct = pct;
                  setOverlaySub(`Packaging file... ${pct}%`);
                }
                stream.resume();
              }).catch(reject);
            });
            stream.on('end', resolve);
            stream.on('error', reject);
            stream.resume();
          });
        } finally {
          try { await writable.close(); } catch {}
        }
        log(`Wrote ${sheetsAdded} sheet(s) + ${fileCount} file(s) into .zip.`, 'ok');
        return;
      }
      // fell through: fileHandle is null -> use chunked-Blob path
    }

    // Path 2: chunked-Blob download. Collect Uint8Array chunks as
    // JSZip emits them, then let Blob own them. We never touch a
    // single monster ArrayBuffer, so the tab doesn't OOM.
    const chunks = [];
    let lastPct = -1;
    await new Promise((resolve, reject) => {
      const stream = zip.generateInternalStream(zipOpts);
      stream.on('data', (chunk, meta) => {
        chunks.push(chunk);
        const pct = Math.round(meta.percent || 0);
        if (pct !== lastPct) {
          lastPct = pct;
          setOverlaySub(`Packaging file... ${pct}%`);
        }
      });
      stream.on('end', resolve);
      stream.on('error', reject);
      stream.resume();
    });
    const zipBlob = new Blob(chunks, { type: 'application/zip' });
    // Drop refs so the JS-side arrays can be GC'd while the Blob keeps
    // the data in its own (often disk-backed) store.
    chunks.length = 0;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    log(`Wrote ${sheetsAdded} sheet(s) + ${fileCount} file(s) into .zip.`, 'ok');
  }

  // Simple concurrency pool: run up to `limit` tasks in flight from
  // `items`, calling worker(item, idx). Runs completions as they finish
  // so progress reporting stays smooth. `shouldStop` is polled between
  // starting each task so a Cancel click stops the batch after the
  // in-flight items settle.
  async function runPool(items, limit, worker, shouldStop) {
    const results = new Array(items.length);
    let cursor = 0;
    async function step() {
      while (true) {
        if (shouldStop && shouldStop()) return;
        const idx = cursor++;
        if (idx >= items.length) return;
        try { results[idx] = { ok: true, value: await worker(items[idx], idx) }; }
        catch (err) { results[idx] = { ok: false, err }; }
      }
    }
    const runners = Array.from({ length: Math.min(limit, items.length) }, step);
    await Promise.all(runners);
    return results;
  }

  // Kick off the "generate" flow. Two flavors of resource:
  //   - default (no `type`) -- fetcher returns rows[], appended as a sheet.
  //   - type: 'pdf-bundle'  -- fetcher returns [{filename, blob}] which
  //                            get dropped into a subfolder of a .zip.
  // When any bundle-type resource contributed files, the whole export
  // becomes a .zip containing the .xlsx AND every bundle file. When
  // only sheets exist, we ship the plain .xlsx as before.
  //
  // Runs up to 3 fetches in parallel -- fast enough to feel snappy but
  // polite enough that Webex's rate limiter usually doesn't 429 us.
  // fetchWithRetry handles the ones that do get throttled.
  async function generateAsBuilt(resources, filenameBase) {
    if (typeof XLSX === 'undefined') {
      log('SheetJS did not load -- refusing to generate.', 'err');
      setStatus('Missing xlsx library');
      return;
    }
    clearLog();
    const picked = selectedResourceIds();
    if (!picked.length) {
      alert('No resources selected. Check at least one box.');
      return;
    }
    const btn = $('asbuiltGenerateBtn');
    if (btn) btn.disabled = true;
    setStatus('Generating...');
    openOverlay(picked.length);

    // Build the per-resource status rows in the ORIGINAL user-picked
    // order (not completion order). Everything starts 'pending' and
    // flips to fetching -> done/failed independently as parallel
    // workers pick them up.
    const pickedResources = picked
      .map((id) => resources.find((r) => r.id === id))
      .filter(Boolean);
    primeResourceList(pickedResources);

    // Keyed by resource id so parallel completions don't scramble the
    // final sheet order -- we replay picks[] order at write time.
    const rowsById = {};
    const bundlesById = {};
    // The progress bar tracks WORK UNITS, not resources: every regular
    // resource is 1 unit, every bundle resource is initially 1 unit
    // that gets re-quoted to N once the bundle discovers its item
    // count (setSubtotal). That way a Flows bundle with 83 flows
    // actually moves the bar 83 times instead of jumping from 90% to
    // 100% at the end.
    let totalUnits = picked.length;
    let completedUnits = 0;
    // Track how many units each resource has already added, so the
    // wrap-up tick doesn't double-count against a bundle's per-item
    // advances.
    const bundleAdvanced = {};

    function refreshOverlayCounter(currentLabel) {
      setOverlayStep(completedUnits, totalUnits);
      setOverlaySub(cancelRequested ? 'Cancelling...' : (currentLabel || `${completedUnits} / ${totalUnits} complete`));
    }

    await runPool(picked, 3, async (id) => {
      const res = resources.find((r) => r.id === id);
      if (!res) { log(`Unknown resource id: ${id}`, 'warn'); return; }
      updateResourceRow(id, 'fetching', 'fetching...');
      log(`Fetching ${res.label}...`);
      try {
        if (res.type === 'pdf-bundle') {
          bundleAdvanced[id] = 0;
          const files = await res.fetchBundle({
            log: (msg) => {
              updateResourceRow(id, 'fetching', msg);
              log('  ' + msg);
            },
            setSubtotal: (n) => {
              const add = Math.max(0, n - 1);
              totalUnits += add;
              refreshOverlayCounter(`Rendering ${res.label} (${n})...`);
            },
            advance: () => {
              completedUnits++;
              bundleAdvanced[id]++;
              refreshOverlayCounter(`Rendering ${res.label}...`);
            }
          });
          bundlesById[id] = files || [];
          updateResourceRow(id, 'done', `${bundlesById[id].length} file(s)`);
          log(`  ${res.label}: ${bundlesById[id].length} file(s)`, 'ok');
        } else {
          const rows = await res.fetch();
          rowsById[id] = Array.isArray(rows) ? rows : [];
          updateResourceRow(id, 'done', `${rowsById[id].length.toLocaleString()} row(s)`);
          log(`  ${res.label}: ${rowsById[id].length} row(s)`, 'ok');
        }
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 120);
        updateResourceRow(id, 'failed', msg);
        log(`  ${res.label} failed: ${err?.message || err}`, 'err');
      } finally {
        // For bundles that already ticked per-item via advance(), the
        // 1 unit we reserved up top is already covered (advance>=1) --
        // don't double-count. For a bundle that never advanced (empty
        // list, or old-style fetcher), still consume the reserved unit
        // so the bar hits 100% at the end.
        if (res.type === 'pdf-bundle') {
          if ((bundleAdvanced[id] || 0) === 0) {
            completedUnits++;
          }
        } else {
          completedUnits++;
        }
        refreshOverlayCounter();
      }
    }, () => cancelRequested);

    // Anything still 'pending' after the pool wraps up got skipped by
    // a Cancel click -- mark those rows so the user can see what
    // was and wasn't fetched.
    if (cancelRequested) {
      document.querySelectorAll('.asbuilt-overlay__res[data-state="pending"]').forEach((row) => {
        const id = row.getAttribute('data-res-id');
        updateResourceRow(id, 'cancelled', 'skipped');
      });
    }

    // Build the output. Resources with a `platform` field go into a
    // per-platform workbook; unlabelled resources (the standalone WxC
    // / WxCC pages) go into a single "default" workbook. That way the
    // unified "Create As-Built" page produces one WxC.xlsx AND one
    // WxCC.xlsx (both bundled in the zip), while the legacy standalone
    // pages behave exactly as before.
    const workbooks = {};   // platform -> { wb, sheetsAdded, label, filenameBase }
    const bundleFiles = [];
    picked.forEach((id) => {
      const res = resources.find((r) => r.id === id);
      if (!res) return;
      if (res.type === 'pdf-bundle') {
        const dir = res.bundleDir || res.id;
        (bundlesById[id] || []).forEach((f) => {
          if (f && f.blob) bundleFiles.push({ subdir: dir, filename: f.filename, blob: f.blob });
        });
      } else if (rowsById[id]) {
        const platformKey = res.platform || '_default';
        if (!workbooks[platformKey]) {
          const base = res.platformFilenameBase
            || (platformKey === '_default' ? filenameBase : platformKey);
          workbooks[platformKey] = {
            wb: XLSX.utils.book_new(),
            sheetsAdded: 0,
            filenameBase: base
          };
        }
        const ws = rowsToSheet(rowsById[id], res.columns);
        XLSX.utils.book_append_sheet(workbooks[platformKey].wb, ws, excelSheetName(res.label));
        workbooks[platformKey].sheetsAdded++;
      }
    });
    const totalSheetsAdded = Object.values(workbooks).reduce((s, w) => s + w.sheetsAdded, 0);
    const workbookEntries = Object.entries(workbooks).filter(([, w]) => w.sheetsAdded > 0);
    // A caller that tags any of its resources with `platform` is the
    // unified page. Use the unified naming AND ship as a zip even when
    // only one platform ended up with rows, so filename convention is
    // predictable for the customer handoff.
    const isUnified = resources.some((r) => r.platform);

    if (!totalSheetsAdded && !bundleFiles.length) {
      log('Every resource fetch failed -- nothing to save.', 'err');
      setStatus('Failed.');
      finishOverlay('Nothing to save. See log for details.', false);
      if (btn) btn.disabled = false;
      return;
    }

    setOverlaySub('Packaging file...');
    // Yield to the browser so the "Packaging file..." label actually
    // paints before the zip generation blocks the main thread.
    await new Promise((r) => setTimeout(r, 0));

    // Filename convention:
    //   Unified export (multiple platforms):  <Tenant>_As-Built_data_<date>.zip
    //   Single platform (legacy standalone):  <Tenant>_<Platform>_<date>.xlsx/.zip
    // Tenant comes from localStorage.authOrgName (top-right label in
    // Orbit); missing tenant falls back to a platform-only name.
    const shortDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const tenantRaw = (function () {
      try { return localStorage.getItem('authOrgName') || ''; } catch { return ''; }
    })();
    const tenantSafe = tenantRaw
      .replace(/[\\/:*?"<>|]/g, '')     // strip filesystem-unsafe chars
      .replace(/\s+/g, '_')             // whitespace -> underscore
      .replace(/_+/g, '_')              // collapse repeats
      .replace(/^_|_$/g, '')            // trim edges
      .slice(0, 60);
    const unifiedPrefix = tenantSafe ? `${tenantSafe}_As-Built_data` : 'As-Built_data';
    const legacyPrefix = tenantSafe ? `${tenantSafe}_${filenameBase}` : `${filenameBase}_AsBuilt`;
    const outName = isUnified ? `${unifiedPrefix}_${shortDate}` : `${legacyPrefix}_${shortDate}`;

    // Ship as .zip when there's more than one workbook or when we have
    // bundle files (Flows PDFs). A single-workbook, no-bundle export
    // stays a plain .xlsx download.
    const needsZip = bundleFiles.length > 0 || isUnified;
    if (needsZip) {
      if (typeof JSZip === 'undefined') {
        log('JSZip not loaded -- falling back to first .xlsx only.', 'warn');
        const first = workbookEntries[0];
        if (first) downloadWorkbook(first[1].wb, `${outName}.xlsx`);
      } else {
        const zip = new JSZip();
        workbookEntries.forEach(([platform, w]) => {
          const xlsxBinary = XLSX.write(w.wb, { bookType: 'xlsx', type: 'array' });
          // In a unified zip name each xlsx after its platform;
          // otherwise use the outer outName so the legacy path stays
          // identical.
          const xlsxName = isUnified
            ? `${tenantSafe ? tenantSafe + '_' : ''}${w.filenameBase}_${shortDate}.xlsx`
            : `${outName}.xlsx`;
          zip.file(xlsxName, xlsxBinary);
        });
        bundleFiles.forEach((f) => {
          zip.file(`${f.subdir}/${f.filename}`, f.blob);
        });

        try {
          await saveZipStreaming(zip, `${outName}.zip`, totalSheetsAdded, bundleFiles.length);
        } catch (zipErr) {
          // Real fallback -- if BOTH the streaming save AND the
          // in-memory blob path failed, save every xlsx + PDF loose so
          // nothing is lost.
          log(`Packaging failed: ${zipErr?.message || zipErr}. Falling back to individual files.`, 'err');
          setOverlaySub('Zip failed - saving files individually...');
          workbookEntries.forEach(([platform, w]) => {
            const xlsxName = isUnified
              ? `${tenantSafe ? tenantSafe + '_' : ''}${w.filenameBase}_${shortDate}.xlsx`
              : `${outName}.xlsx`;
            downloadWorkbook(w.wb, xlsxName);
          });
          for (let i = 0; i < bundleFiles.length; i++) {
            const f = bundleFiles[i];
            const url = URL.createObjectURL(f.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = f.filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
            await new Promise((r) => setTimeout(r, 200));
          }
          log(`Saved ${workbookEntries.length} .xlsx + ${bundleFiles.length} individual PDF file(s).`, 'ok');
        }
      }
    } else {
      const only = workbookEntries[0];
      if (only) {
        downloadWorkbook(only[1].wb, `${outName}.xlsx`);
        log(`Wrote ${only[1].sheetsAdded} sheet(s).`, 'ok');
      }
    }
    const finalMsg = cancelRequested
      ? `Stopped early. Partial file saved.`
      : `Wrote ${totalSheetsAdded} sheet(s)${bundleFiles.length ? ` + ${bundleFiles.length} file(s)` : ''}${isUnified ? ` across ${workbookEntries.length} workbook(s)` : ''}.`;
    finishOverlay(finalMsg, true);
    setStatus('Done.');
    if (btn) btn.disabled = false;
  }

  // Minimal auth reader shared by both platforms. WxC uses ?orgId=X query
  // param; WxCC uses OrgId header AND puts orgId inside the URL path --
  // callers pick which they need.
  function getAuth() {
    const bearer = localStorage.getItem('authBearer') || '';
    // WxCC pages historically use 'authOrgId'; WxC pages use 'authOrg'.
    // We surface both so each platform's fetcher can grab the right one.
    return {
      bearer,
      orgIdWxcc: localStorage.getItem('authOrgId') || '',
      orgIdWxc:  localStorage.getItem('authOrg')   || ''
    };
  }

  // Follow HAL-style { next } links -- Webex Calling paginates via a
  // Link header (RFC 5988). This walks the chain and returns every item
  // from whichever array key the endpoint uses. Different WxC endpoints
  // use different keys -- /people uses .items, /telephony/config/numbers
  // uses .phoneNumbers, /telephony/config/locations uses .locations,
  // etc. -- so the caller can pass itemsKeys to say which to look for.
  // Falls back to any array-valued top-level key if none match, since a
  // raw array response is also possible. Cap at pageMax to keep a
  // runaway catalog from locking up the UI.
  async function fetchPaginatedWxc(url, bearer, orgId, opts) {
    const pageMax = (opts && opts.pageMax) || 50;
    const itemsKeys = (opts && opts.itemsKeys) || ['items', 'results'];
    const items = [];
    let next = url + (url.includes('?') ? '&' : '?') + (orgId ? `orgId=${encodeURIComponent(orgId)}` : '');
    let page = 0;
    while (next && page < pageMax) {
      const res = await fetchWithRetry(next, { headers: { Authorization: `Bearer ${bearer}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${next}`);
      const payload = await res.json();
      let chunk = null;
      for (const k of itemsKeys) {
        if (Array.isArray(payload?.[k])) { chunk = payload[k]; break; }
      }
      if (!chunk) {
        // Last-ditch: some endpoints (auto-attendants under a location)
        // return {..., autoAttendants: [...]}, others hand back a bare
        // array. Try both before giving up.
        if (Array.isArray(payload)) chunk = payload;
        else chunk = Object.values(payload || {}).find((v) => Array.isArray(v)) || [];
      }
      items.push(...chunk);
      // Parse Link: <url>; rel="next" -- Webex uses the standard shape.
      const link = res.headers.get('Link') || res.headers.get('link') || '';
      const m = link.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
      next = m ? m[1] : null;
      page++;
    }
    return items;
  }

  // Auto-retry a fetch on HTTP 429. Reads Retry-After (header or body)
  // when the server hints, otherwise backs off 1s, 2s, 4s. Caps at
  // maxRetries so a hard-rate-limited endpoint eventually gives up.
  async function fetchWithRetry(url, init, maxRetries) {
    const cap = typeof maxRetries === 'number' ? maxRetries : 5;
    for (let attempt = 0; attempt <= cap; attempt++) {
      const res = await fetch(url, init);
      if (res.status !== 429) return res;
      if (attempt === cap) return res;
      let waitMs = 0;
      const hdr = res.headers.get('Retry-After');
      if (hdr) waitMs = /^\d+$/.test(hdr) ? Number(hdr) * 1000 : 0;
      if (!waitMs) {
        try {
          const clone = res.clone();
          const j = await clone.json();
          const ra = j?.error?.retryAfter || j?.retryAfter;
          if (typeof ra === 'number' && ra > 0) waitMs = ra * 1000;
        } catch {}
      }
      if (!waitMs) waitMs = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, waitMs + Math.floor(Math.random() * 250)));
    }
    return await fetch(url, init);
  }

  // WxCC paginates with ?page=N&pageSize=M query params. Keep asking
  // for the next page until the server returns fewer than pageSize items.
  async function fetchPaginatedWxcc(pathBuilder, bearer, orgId, opts) {
    const pageSize = (opts && opts.pageSize) || 100;
    const pageMax = (opts && opts.pageMax) || 50;
    const items = [];
    for (let page = 0; page < pageMax; page++) {
      const url = pathBuilder(page, pageSize);
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          OrgId: orgId,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      const payload = await res.json();
      const chunk = payload.data || payload.items || payload || [];
      const arr = Array.isArray(chunk) ? chunk : (chunk.items || chunk.data || []);
      items.push(...arr);
      if (arr.length < pageSize) break;
    }
    return items;
  }

  // Expose to per-platform modules via window.AsBuilt.
  // `catalogs` is a shared registry (populated by asbuilt-wxc.js /
  // asbuilt-wxcc.js as they load) so the unified page can pull both
  // resource lists from a single place.
  window.AsBuilt = {
    log, clearLog, setStatus,
    renderResourceGrid, renderGroupedResourceGrid, selectedResourceIds,
    generateAsBuilt, getAuth,
    fetchPaginatedWxc, fetchPaginatedWxcc,
    catalogs: (window.AsBuilt && window.AsBuilt.catalogs) || {}
  };
})();
