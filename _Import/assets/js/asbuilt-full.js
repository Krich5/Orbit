// Unified "Create As-Built" driver. Pulls the WxC and WxCC catalogs
// that asbuilt-wxc.js / asbuilt-wxcc.js publish into
// window.AsBuilt.catalogs, tags each resource with its platform so the
// shared generator can split the output into per-platform workbooks,
// renders a grouped picker, and drives a single Run.
//
// End result of one Run: a zip named "<Tenant>_As-Built_data_<date>.zip"
// containing two xlsx files (one per platform) and, if Flows was
// picked, a flows/ folder with a PDF per flow.

(function () {
  'use strict';
  const { renderGroupedResourceGrid, generateAsBuilt, catalogs, log } = window.AsBuilt;

  function boot() {
    const grid = document.getElementById('asbuiltResourceGrid');
    if (!grid || grid.getAttribute('data-asbuilt-page') !== 'full') return;

    const wxc = catalogs.wxc;
    const wxcc = catalogs.wxcc;
    if (!wxc || !wxcc) {
      log('As-built catalogs failed to load -- check that asbuilt-wxc.js and asbuilt-wxcc.js loaded before this script.', 'err');
      return;
    }

    // Tag every resource with its platform + a stable id so the shared
    // generator can group them into per-platform workbooks and so the
    // ids don't collide between catalogs (both platforms happen to
    // have a "users" resource, for instance).
    const tag = (platform, filenameBase, resources) => resources.map((r) => ({
      ...r,
      id: `${platform}_${r.id}`,
      platform,
      platformFilenameBase: filenameBase,
      // Label the picker card with the platform-prefixed name so it's
      // obvious which side each row belongs to at a glance in the
      // progress modal too.
      label: r.label
    }));

    const wxcTagged = tag('wxc', wxc.filenameBase, wxc.resources);
    const wxccTagged = tag('wxcc', wxcc.filenameBase, wxcc.resources);
    const all = [...wxcTagged, ...wxccTagged];

    renderGroupedResourceGrid([
      { id: 'wxc', label: wxc.label, resources: wxcTagged },
      { id: 'wxcc', label: wxcc.label, resources: wxccTagged }
    ]);

    document.getElementById('asbuiltGenerateBtn')?.addEventListener('click', () => {
      // filenameBase is only used when the export ships as a single
      // .xlsx (no bundles + single platform). The unified page will
      // ALWAYS have >1 platform, so the generator will ignore this and
      // use the "<Tenant>_As-Built_data" prefix instead.
      generateAsBuilt(all, 'As-Built');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
