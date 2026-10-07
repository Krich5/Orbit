/* Orbit configuration — one place to point the app at your own deployed
   proxy (see /proxy/server.js) once you've deployed it to Railway. */
window.ORBIT_PROXY_BASE = 'https://orbit-proxy-production.up.railway.app';

/* Webex OAuth integration. The Client ID is public (it's safe in
   client-side code — it's just part of the authorize URL). The Client
   Secret is NOT here; it lives only as a Railway service variable
   (see proxy/server.js's /token route). */
window.ORBIT_CLIENT_ID = 'C19a534d8366696294375f2e7cdbd6932642a1f8f84a85567029369c0e142d76d';
window.ORBIT_REDIRECT_URI = 'https://krich5.github.io/Orbit/callback.html';
/* Admin flag — Orbit carried this over from a server-side PHP email
   allow-list. In Orbit this stays off by default (admin pages still
   render; features gated on it just stay hidden until we wire a real
   admin gate). */
window.OPSHUB_IS_ADMIN_USER = window.OPSHUB_IS_ADMIN_USER || false;

window.ORBIT_OAUTH_SCOPES = [
  // Orbit baseline — Contact Center + CJDS (all verified working with the
  // Orbit Webex OAuth app before the OpsHub merge).
  'cjp:config',
  'cjp:config_read',
  'cjp:config_write',
  'cjp:user',
  'cjds:admin_org_read',
  'cjds:admin_org_write',
  'spark-admin:organizations_read',
  'spark-admin:people_read',
  'spark-admin:licenses_read',
  'spark-admin:locations_read',
  'spark-admin:telephony_config_read',
  // WxC read scopes the imported pages need
  'spark-admin:devices_read',
  'spark-admin:workspace_locations_read',
  'spark-admin:places_read',
  // WxC write scopes for wizard / tenant-mutating pages
  'spark-admin:locations_write',
  'spark-admin:workspace_locations_write',
  'spark-admin:places_write',
  'spark-admin:devices_write',
  'spark-admin:telephony_config_write'
  // Dropped from the OpsHub list: `spark:all`, `spark:kms`,
  // `audit:events_read`, `spark:organizations_read`. These were rejected
  // by Webex as invalid_scope for the Orbit OAuth app — add them back
  // one at a time only if you register them with the Orbit integration
  // and need them for a specific page.
].join(' ');
