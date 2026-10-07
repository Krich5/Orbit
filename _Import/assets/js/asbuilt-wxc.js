// WxC As-Built generator -- catalog of Webex Calling resources the
// implementer can bundle into a single .xlsx for handoff to the customer.
//
// Each resource declares:
//   id             short slug used by the checkbox + selectedResourceIds()
//   label          human name shown in the picker AND used as the sheet tab
//   defaultChecked pre-tick the box (keep the common ones on by default)
//   columns        [{ key, header }] -- controls sheet layout + order
//   fetch()        async -> array of row objects (row keys match column keys)
//
// Endpoints: webexapis.com/v1 -- Bearer + ?orgId=X query param
// (WxC pages historically read orgId from localStorage['authOrg']).

(function () {
  'use strict';
  const BASE = 'https://webexapis.com/v1';
  const { fetchPaginatedWxc, getAuth, generateAsBuilt, renderResourceGrid, log, setStatus } = window.AsBuilt;

  function auth() {
    const a = getAuth();
    if (!a.bearer) throw new Error('Not signed in. Sign in on Home first.');
    if (!a.orgIdWxc) throw new Error('No orgId cached for Webex Calling. Visit a WxC page first to seed it.');
    return { bearer: a.bearer, orgId: a.orgIdWxc };
  }

  const RESOURCES = [
    {
      id: 'locations', label: 'Locations', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'timeZone', header: 'Time Zone' },
        { key: 'preferredLanguage', header: 'Language' },
        { key: 'announcementLanguage', header: 'Announcement Language' },
        { key: 'address_city', header: 'City' },
        { key: 'address_state', header: 'State' },
        { key: 'address_country', header: 'Country' },
        { key: 'address_postalCode', header: 'Postal Code' },
        { key: 'address_address1', header: 'Address' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // /v1/telephony/config/locations only returns calling-specific fields
        // (id, name, a few PSTN attributes) -- no address / timezone / language.
        // Use /v1/locations for the full profile (that's what the standalone
        // Locations page uses too). Response key is `items`.
        const items = await fetchPaginatedWxc(
          `${BASE}/locations?max=500`, bearer, orgId
        );
        return items.map((it) => ({
          id: it.id, name: it.name, timeZone: it.timeZone,
          preferredLanguage: it.preferredLanguage, announcementLanguage: it.announcementLanguage,
          address_city: it.address?.city, address_state: it.address?.state,
          address_country: it.address?.country, address_postalCode: it.address?.postalCode,
          address_address1: it.address?.address1
        }));
      }
    },
    {
      id: 'numbers', label: 'Numbers', defaultChecked: true,
      columns: [
        { key: 'phoneNumber', header: 'Phone Number' },
        { key: 'extension', header: 'Extension' },
        { key: 'state', header: 'State' },
        { key: 'phoneNumberType', header: 'Type' },
        { key: 'mainNumber', header: 'Main Number' },
        { key: 'includedTelephonyType', header: 'Telephony Type' },
        { key: 'locationName', header: 'Location' },
        { key: 'ownerType', header: 'Owner Type' },
        { key: 'ownerName', header: 'Owner' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // /v1/telephony/config/numbers returns { phoneNumbers: [...] }.
        const items = await fetchPaginatedWxc(
          `${BASE}/telephony/config/numbers?max=500`, bearer, orgId,
          { itemsKeys: ['phoneNumbers', 'items'] }
        );
        return items.map((it) => ({
          phoneNumber: it.phoneNumber, extension: it.extension, state: it.state,
          phoneNumberType: it.phoneNumberType, mainNumber: it.mainNumber,
          includedTelephonyType: it.includedTelephonyType,
          locationName: it.location?.name,
          ownerType: it.owner?.type,
          ownerName: [it.owner?.firstName, it.owner?.lastName].filter(Boolean).join(' ') || it.owner?.name
        }));
      }
    },
    {
      id: 'workspaces', label: 'Workspaces', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'displayName', header: 'Name' },
        { key: 'type', header: 'Type' },
        { key: 'capacity', header: 'Capacity' },
        { key: 'locationId', header: 'Location ID' },
        { key: 'created', header: 'Created' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // Match what the standalone Workspaces page uses -- some orgs 403
        // when ?orgId is the ONLY query param on /v1/workspaces; adding
        // ?max=1000 mirrors the working page verbatim.
        const items = await fetchPaginatedWxc(`${BASE}/workspaces?max=1000`, bearer, orgId);
        return items.map((it) => ({
          id: it.id, displayName: it.displayName, type: it.type,
          capacity: it.capacity, locationId: it.workspaceLocationId || it.locationId,
          created: it.created
        }));
      }
    },
    {
      id: 'devices', label: 'Devices', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'displayName', header: 'Display Name' },
        { key: 'product', header: 'Product' },
        { key: 'type', header: 'Type' },
        { key: 'mac', header: 'MAC' },
        { key: 'ip', header: 'IP' },
        { key: 'connectionStatus', header: 'Status' },
        { key: 'personId', header: 'Owner (Person)' },
        { key: 'workspaceId', header: 'Workspace' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // Match the standalone Devices/Workspaces pages -- ?max=500.
        // Webex allows up to ?max=1000 on /v1/devices. Some orgs have
        // thousands of devices; fetchPaginatedWxc follows the Link:
        // rel="next" header to pull the rest.
        const items = await fetchPaginatedWxc(`${BASE}/devices?max=1000`, bearer, orgId, { pageMax: 20 });
        return items.map((it) => ({
          id: it.id, displayName: it.displayName, product: it.product, type: it.type,
          mac: it.mac, ip: it.ip, connectionStatus: it.connectionStatus,
          personId: it.personId, workspaceId: it.workspaceId
        }));
      }
    },
    {
      id: 'virtualLines', label: 'Virtual Lines', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'displayName', header: 'Display Name' },
        { key: 'extension', header: 'Extension' },
        { key: 'phoneNumber', header: 'Phone Number' },
        { key: 'locationName', header: 'Location' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // /v1/telephony/config/virtualLines returns { virtualLines: [...] }.
        const items = await fetchPaginatedWxc(
          `${BASE}/telephony/config/virtualLines?max=500`, bearer, orgId,
          { itemsKeys: ['virtualLines', 'items'] }
        );
        return items.map((it) => ({
          id: it.id, firstName: it.firstName, lastName: it.lastName,
          displayName: it.displayName, extension: it.extension,
          phoneNumber: it.number?.external || it.phoneNumber,
          locationName: it.location?.name
        }));
      }
    },
    {
      id: 'autoAttendants', label: 'Auto Attendants', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'phoneNumber', header: 'Phone Number' },
        { key: 'extension', header: 'Extension' },
        { key: 'locationName', header: 'Location' },
        { key: 'languageCode', header: 'Language' }
      ],
      async fetch() {
        const { bearer, orgId } = auth();
        // /v1/telephony/config/autoAttendants returns { autoAttendants: [...] }.
        const items = await fetchPaginatedWxc(
          `${BASE}/telephony/config/autoAttendants?max=500`, bearer, orgId,
          { itemsKeys: ['autoAttendants', 'items'] }
        );
        return items.map((it) => ({
          id: it.id, name: it.name, firstName: it.firstName, lastName: it.lastName,
          phoneNumber: it.phoneNumber, extension: it.extension,
          locationName: it.locationName, languageCode: it.languageCode
        }));
      }
    },
    {
      id: 'users', label: 'Users', defaultChecked: true,
      columns: [
        { key: 'id', header: 'ID' },
        { key: 'displayName', header: 'Display Name' },
        { key: 'email', header: 'Email' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'department', header: 'Department' },
        { key: 'title', header: 'Title' },
        { key: 'status', header: 'Status' },
        { key: 'created', header: 'Created' }
      ],
      async fetch() {
        // /people is capped -- pull a manageable slice (1000). Bumping
        // pageMax past this is possible if a customer needs the full list.
        const { bearer, orgId } = auth();
        const items = await fetchPaginatedWxc(`${BASE}/people?max=100`, bearer, orgId, { pageMax: 20 });
        return items.map((it) => ({
          id: it.id, displayName: it.displayName,
          email: (it.emails || [])[0],
          firstName: it.firstName, lastName: it.lastName,
          department: it.department, title: it.title,
          status: it.status, created: it.created
        }));
      }
    }
  ];

  // Publish the catalog so the unified "Create As-Built" page can pull
  // it in alongside the WxCC catalog and drive both from a single
  // picker. The standalone wxc.html page stays fully working; the
  // boot() below still wires the grid + Run button when the DOM has
  // the standalone shell (data-asbuilt-page="wxc").
  window.AsBuilt.catalogs = window.AsBuilt.catalogs || {};
  window.AsBuilt.catalogs.wxc = { label: 'Webex Calling', filenameBase: 'WxC', resources: RESOURCES };

  function boot() {
    const grid = document.getElementById('asbuiltResourceGrid');
    // The unified page has data-asbuilt-page="full" and drives its own
    // render + Run wiring. Only auto-boot for the standalone wxc.html.
    if (!grid || grid.getAttribute('data-asbuilt-page') === 'full') return;
    renderResourceGrid(RESOURCES);
    document.getElementById('asbuiltGenerateBtn')?.addEventListener('click', () => {
      generateAsBuilt(RESOURCES, 'WxC');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
