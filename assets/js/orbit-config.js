/* Orbit configuration — one place to point the app at your own deployed
   proxy (see /proxy/server.js) once you've deployed it to Railway. */
window.ORBIT_PROXY_BASE = 'https://orbit-proxy-production.up.railway.app';

/* Webex OAuth integration. The Client ID is public (it's safe in
   client-side code — it's just part of the authorize URL). The Client
   Secret is NOT here; it lives only as a Railway service variable
   (see proxy/server.js's /token route). */
window.ORBIT_CLIENT_ID = 'C19a534d8366696294375f2e7cdbd6932642a1f8f84a85567029369c0e142d76d';
window.ORBIT_REDIRECT_URI = 'https://krich5.github.io/Orbit/callback.html';
window.ORBIT_OAUTH_SCOPES = [
  'spark-admin:organizations_read',
  'spark-admin:people_read',
  'cjp:config',
  'cjp:config_read',
  'cjp:config_write',
  'cjp:user',
  'spark-admin:licenses_read',
  'spark-admin:locations_read',
  'spark-admin:telephony_config_read',
  'cjds:admin_org_read',
  'cjds:admin_org_write'
].join(' ');
