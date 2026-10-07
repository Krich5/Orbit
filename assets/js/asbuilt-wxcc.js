// WxCC As-Built generator -- catalog of Webex Contact Center resources
// the implementer can bundle into a single .xlsx for handoff to the
// customer.
//
// Endpoints: api.wxcc-us1.cisco.com/organization/{orgId}/...
// Auth: Bearer + OrgId header (matches every other WxCC page in the app).

(function () {
  'use strict';
  const BASE = 'https://api.wxcc-us1.cisco.com';
  const { fetchPaginatedWxcc, getAuth, generateAsBuilt, renderResourceGrid } = window.AsBuilt;

  function auth() {
    const a = getAuth();
    if (!a.bearer) throw new Error('Not signed in. Sign in on Home first.');
    if (!a.orgIdWxcc) throw new Error('No orgId cached for Webex Contact Center. Visit a WxCC page first to seed it.');
    return { bearer: a.bearer, orgId: a.orgIdWxcc };
  }

  const orgPath = (orgId) => `${BASE}/organization/${encodeURIComponent(orgId)}`;

  const RESOURCES = [
    {
      id: 'queues', label: 'Queues', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'active', header: 'Active' },
        { key: 'channelType', header: 'Channel Type' },
        { key: 'queueThreshold', header: 'Threshold' },
        { key: 'maxTimeInQueue', header: 'Max Time in Queue' },
        { key: 'serviceLevelThreshold', header: 'Service Level Threshold' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/contact-service-queue?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, active: it.active,
          channelType: it.channelType,
          queueThreshold: it.queueThreshold, maxTimeInQueue: it.maxTimeInQueue,
          serviceLevelThreshold: it.serviceLevelThreshold
        }));
      }
    },
    {
      id: 'businessHours', label: 'Business Hours', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'timezone', header: 'Timezone' },
        { key: 'active', header: 'Active' },
        { key: 'description', header: 'Description' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/business-hours?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 100 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, timezone: it.timezone,
          active: it.active, description: it.description
        }));
      }
    },
    {
      id: 'users', label: 'Users', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'email', header: 'Email' },
        { key: 'active', header: 'Active' },
        { key: 'agentProfileId', header: 'Desktop Profile ID' },
        { key: 'multimediaProfileId', header: 'Multimedia Profile' },
        { key: 'teamIds', header: 'Teams' },
        { key: 'skillProfileId', header: 'Skill Profile' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/user?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 100 }
        );
        return items.map((it) => ({
          id: it.id,
          firstName: it.firstName, lastName: it.lastName,
          email: it.email, active: it.active,
          agentProfileId: it.agentProfileId,
          multimediaProfileId: it.multimediaProfileId,
          teamIds: Array.isArray(it.teamIds) ? it.teamIds.join(', ') : it.teamIds,
          skillProfileId: it.skillProfileId
        }));
      }
    },
    {
      id: 'skills', label: 'Skills', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'serviceLevelThreshold', header: 'Service Level Threshold' },
        { key: 'type', header: 'Type' },
        { key: 'description', header: 'Description' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/skill?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name,
          serviceLevelThreshold: it.serviceLevelThreshold,
          type: it.type, description: it.description
        }));
      }
    },
    {
      id: 'desktopProfiles', label: 'Desktop Profiles', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'active', header: 'Active' },
        { key: 'description', header: 'Description' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/agent-profile?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, active: it.active, description: it.description
        }));
      }
    },
    {
      id: 'entryPoints', label: 'Entry Points (Channels)', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'channelType', header: 'Channel Type' },
        { key: 'active', header: 'Active' },
        { key: 'routingFlow', header: 'Routing Flow' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/entry-point?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name,
          channelType: it.channelType, active: it.active,
          routingFlow: it.routingFlow?.name || it.routingFlow
        }));
      }
    },
    {
      id: 'addressBooks', label: 'Address Books', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'description', header: 'Description' },
        { key: 'active', header: 'Active' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v3/address-book?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, description: it.description, active: it.active
        }));
      }
    },
    {
      id: 'desktopLayouts', label: 'Desktop Layouts', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'defaultLayout', header: 'Default' },
        { key: 'description', header: 'Description' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/desktop-layout?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 100 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name,
          defaultLayout: it.defaultLayout ?? it.isDefault,
          description: it.description
        }));
      }
    },
    {
      // Flows is special: instead of a single sheet, each flow gets its
      // own PDF and the whole export bundles into a .zip. We reuse the
      // existing Flows page viewer by loading it in a hidden iframe and
      // driving the __asbuiltRenderFlowToPdf hook it exposes -- no need
      // to duplicate the diagram-render code here. Uncheck this if you
      // don't want the extra render time (each flow is a few seconds).
      id: 'flows', label: 'Flows', defaultChecked: true,
      type: 'pdf-bundle', bundleDir: 'flows',
      async fetchBundle(progress) {
        // Back-compat: earlier callers passed a single log function. Now
        // it's an object with { log, setSubtotal, advance } so the
        // overall progress bar can step per flow instead of jumping in
        // one big lump at the end.
        const isObj = progress && typeof progress === 'object';
        const logLine = isObj ? (progress.log || function(){}) : (typeof progress === 'function' ? progress : function(){});
        const setSubtotal = isObj && typeof progress.setSubtotal === 'function' ? progress.setSubtotal : function(){};
        const advance = isObj && typeof progress.advance === 'function' ? progress.advance : function(){};
        if (typeof JSZip === 'undefined') throw new Error('JSZip missing');
        // The Flows page lives at /pages/wxcc/flows.html (this file is
        // in /pages/asbuilt/). Same-origin so we can reach into its
        // window directly once it's loaded.
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1400px;height:900px;visibility:hidden;';
        iframe.src = '../wxcc/flows.html';
        document.body.appendChild(iframe);
        try {
          await new Promise((resolve, reject) => {
            iframe.addEventListener('load', resolve, { once: true });
            iframe.addEventListener('error', () => reject(new Error('flows.html failed to load in iframe')), { once: true });
            setTimeout(() => reject(new Error('flows.html iframe load timed out')), 30000);
          });
          const win = iframe.contentWindow;
          if (!win || typeof win.__asbuiltGetFlows !== 'function' || typeof win.__asbuiltRenderFlowToPdf !== 'function') {
            throw new Error('Flows helper hooks not present -- flows.html may not have picked up the new build yet');
          }
          // The Flows page calls fetchFlows() on load; poll until the
          // list populates (or bail after ~30s).
          const start = Date.now();
          let list = [];
          while (Date.now() - start < 30000) {
            list = win.__asbuiltGetFlows();
            if (list.length) break;
            await new Promise((r) => setTimeout(r, 500));
          }
          if (!list.length) throw new Error('No flows loaded in iframe within 30s');
          // Tell the outer progress bar how many units this bundle
          // actually consumes so it can step per-flow instead of
          // sitting at the same percent for the whole batch.
          setSubtotal(list.length);
          logLine(`0/${list.length} rendered`);
          const files = [];
          for (let i = 0; i < list.length; i++) {
            const f = list[i];
            const label = f.name || f.id;
            try {
              const blob = await win.__asbuiltRenderFlowToPdf(f.id);
              const safeName = String(label).replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
              files.push({ filename: `${safeName}.pdf`, blob });
              logLine(`${i + 1}/${list.length} rendered`);
            } catch (err) {
              logLine(`${i + 1}/${list.length} rendered (last failed: ${label})`);
            }
            // Tick the outer bar for every flow (success OR fail).
            advance();
          }
          return files;
        } finally {
          iframe.remove();
        }
      }
    },
    {
      id: 'teams', label: 'Teams', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'active', header: 'Active' },
        { key: 'teamType', header: 'Team Type' },
        { key: 'siteId', header: 'Site' },
        { key: 'agentIds', header: 'Agent IDs' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxcc(
          (page, size) => `${orgPath(orgId)}/v2/team?page=${page}&pageSize=${size}`,
          bearer, orgId, { pageSize: 200 }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, active: it.active,
          teamType: it.teamType, siteId: it.siteId,
          agentIds: Array.isArray(it.agentIds) ? it.agentIds.join(', ') : it.agentIds
        }));
      }
    }
  ];

  // Publish the catalog so the unified "Create As-Built" page can pull
  // it in alongside the WxC catalog and drive both from a single
  // picker. The standalone wxcc.html page stays fully working; the
  // boot() below still wires the grid + Run button when the DOM has
  // the standalone shell (no data-asbuilt-page attribute).
  window.AsBuilt.catalogs = window.AsBuilt.catalogs || {};
  window.AsBuilt.catalogs.wxcc = { label: 'Webex Contact Center', filenameBase: 'WxCC', resources: RESOURCES };

  function boot() {
    const grid = document.getElementById('asbuiltResourceGrid');
    if (!grid || grid.getAttribute('data-asbuilt-page') === 'full') return;
    renderResourceGrid(RESOURCES);
    document.getElementById('asbuiltGenerateBtn')?.addEventListener('click', () => {
      generateAsBuilt(RESOURCES, 'WxCC');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
