const express = require('express');

const ALLOWED_FLOW_HOST = 'https://api.wxcc-us1.cisco.com/';
const PORT = process.env.PORT || 8787;
const { WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_REDIRECT_URI } = process.env;

const app = express();

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use('/functions', express.json());
app.use('/flows', express.text({ type: '*/*' }));
app.use('/token', express.json());
app.use('/user', express.json({ limit: '5mb' }));
app.use('/aiagent', express.json({ limit: '15mb' }));

async function relay(res, url, { method = 'GET', headers = {}, body } = {}) {
  const upstream = await fetch(url, { method, headers, body });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
}

app.all('/flows', async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const targetUrl = req.query.url || '';
  if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });
  if (!targetUrl.startsWith(ALLOWED_FLOW_HOST)) return res.status(403).json({ error: 'URL not allowed' });

  const authorization = req.headers.authorization || '';
  if (!authorization) return res.status(401).json({ error: 'Missing Authorization header' });

  if (req.method === 'GET') {
    return relay(res, targetUrl, { headers: { Authorization: authorization, Accept: 'application/json' } });
  }

  const jsonBody = req.body;
  if (!jsonBody || !String(jsonBody).trim()) return res.status(400).json({ error: 'Missing request body' });

  const format = req.query.format || 'multipart';
  if (format === 'json') {
    return relay(res, targetUrl, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: jsonBody,
    });
  }

  // Multipart file upload — used for flows:import (Cisco rejects a direct
  // JSON POST here with CORS, same reason the whole proxy exists).
  const form = new FormData();
  form.append('file', new Blob([jsonBody], { type: 'application/octet-stream' }), 'flow_template.json');
  return relay(res, targetUrl, {
    method: 'POST',
    headers: { Authorization: authorization, Accept: 'application/json' },
    body: form,
  });
});

app.post('/functions', async (req, res) => {
  const input = req.body;
  const { action, orgId, bearer } = input || {};
  if (!action || !orgId || !bearer) return res.status(400).json({ error: 'Missing action, orgId, or bearer' });

  const token = String(bearer).replace(/^Bearer\s+/i, '').trim();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (action === 'list') {
    const url = `https://fn-store.produs1.ciscoccservice.com/fn-store/v1/${encodeURIComponent(orgId)}/functions?size=100&page=0&sortBy=name&status=Draft,Published`;
    return relay(res, url, { headers });
  }

  if (action === 'detail') {
    const id = input.id || '';
    if (!id) return res.status(400).json({ error: 'Missing function id' });
    const trpcInput = encodeURIComponent(JSON.stringify({ 0: { id, orgId }, 1: { orgId } }));
    const url = `https://fc-bff.produs1.ciscoccservice.com/fc-bff/trpc/function.get,function.options?batch=1&input=${trpcInput}`;
    return relay(res, url, { headers });
  }

  if (action === 'save') {
    const payload = input.payload;
    if (!payload) return res.status(400).json({ error: 'Missing save payload' });
    const url = 'https://fc-bff.produs1.ciscoccservice.com/fc-bff/trpc/function.update?batch=1';
    return relay(res, url, { method: 'POST', headers, body: JSON.stringify(payload) });
  }

  return res.status(400).json({ error: 'Unsupported action' });
});

app.get('/status', async (req, res) => {
  const upstream = await fetch('https://status.webex.com/history.rss', {
    headers: { 'User-Agent': 'Orbit-StatusBanner/1.0' },
  });
  if (!upstream.ok) return res.json({ error: 'fetch failed', items: [] });

  const xml = await upstream.text();
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  const known = ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem', 'in progress', 'scheduled', 'completed'];
  let m;
  while ((m = itemRe.exec(xml))) {
    const chunk = m[1];
    const title = (chunk.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
    const link = (chunk.match(/<link>([\s\S]*?)<\/link>/) || [, ''])[1].trim();
    const desc = (chunk.match(/<description>([\s\S]*?)<\/description>/) || [, ''])[1];

    let firstStatus = '';
    const strongRe = /<strong\s*>\s*([^<]+?)\s*<\/strong\s*>/gi;
    let sm;
    while ((sm = strongRe.exec(desc))) {
      const candidate = sm[1].trim().toLowerCase();
      if (known.includes(candidate)) { firstStatus = candidate; break; }
    }

    let status = 'unknown';
    let type = 'maintenance';
    if (['investigating', 'identified', 'monitoring'].includes(firstStatus)) { status = 'in_progress'; type = 'incident'; }
    else if (['resolved', 'postmortem'].includes(firstStatus)) { status = 'completed'; type = 'incident'; }
    else if (firstStatus === 'in progress') status = 'in_progress';
    else if (firstStatus === 'scheduled') status = 'scheduled';
    else if (firstStatus === 'completed') status = 'completed';

    const regions = [];
    const rm = desc.match(/Regions?[^<]*<\/strong[^>]*>[^<]*<\/font[^>]*>\s*(.*?)\s*<br/i);
    if (rm) {
      rm[1].replace(/<[^>]+>/g, '').split(/,\s*/).forEach((r) => { const t = r.trim(); if (t) regions.push(t); });
    }

    items.push({ title, link, status, type, regions });
  }

  res.json({ items, fetched: new Date().toISOString() });
});

// Resolve either an atlas-a UUID or a Webex base64 org id to the UUID form.
function resolveAtlasOrgId(orgId) {
  if (/^[0-9a-f-]{36}$/i.test(orgId)) return orgId;
  try {
    const normalized = orgId.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const m = decoded.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (m) return m[1];
  } catch (_) {}
  return encodeURIComponent(orgId);
}

app.post('/user', async (req, res) => {
  const input = req.body || {};
  const { action, orgId, bearer } = input;
  if (!action || !orgId || !bearer) return res.status(400).json({ error: 'Missing action, orgId, or bearer' });

  const token = String(bearer).replace(/^Bearer\s+/i, '').trim();
  const atlasOrg = resolveAtlasOrgId(orgId);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // atlas-a.wbx2.com requires a browser-like UA to pass the Cisco WAF.
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  if (action === 'ccRoles' || action === 'adminRoles') {
    const users = input.users;
    if (!users) return res.status(400).json({ error: 'Missing users payload' });
    const path = action === 'ccRoles' ? 'contactCenterRoles' : 'roles';
    const url = `https://atlas-a.wbx2.com/admin/api/v1/organization/${atlasOrg}/users/${path}`;
    const upstream = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ users }) });
    const text = await upstream.text();
    return res.status(upstream.status).set('Content-Type', 'application/json').send(text);
  }

  if (action === 'scimUsers') {
    const pageSize = 100;
    let startIndex = 1;
    const all = [];
    let total = Infinity;
    while (all.length < total) {
      const url = `https://identity-b-us.webex.com/identity/scim/${encodeURIComponent(atlasOrg)}/v2/Users`
                + `?count=${pageSize}&startIndex=${startIndex}&attributes=userName,roles`;
      const upstream = await fetch(url, { headers });
      const text = await upstream.text();
      if (!upstream.ok) return res.status(upstream.status).set('Content-Type', 'application/json').send(text);
      let page;
      try { page = JSON.parse(text); } catch { return res.status(502).json({ error: 'Upstream SCIM returned non-JSON' }); }
      const resources = Array.isArray(page.Resources) ? page.Resources : [];
      all.push(...resources);
      total = Number(page.totalResults) || 0;
      startIndex += pageSize;
      if (resources.length < pageSize) break;
    }
    return res.json({ totalResults: all.length, Resources: all });
  }

  return res.status(400).json({ error: 'Unsupported action' });
});

// AI Agent Studio import relay.
// Studio sends `access-control-allow-origin: https://studio.aiagent-*.cisco.com` only,
// so a browser-origin fetch from the wizard is CORS-blocked. The wizard POSTs
// here with the user's auth-token + user-access-token (grabbed from DevTools on
// their Studio tab) and the fully-built bot body; we relay to Studio and pass
// back the status, body, and Location header (which carries the new bot id).
const ALLOWED_AIAGENT_HOSTS = [
  'https://studio.aiagent-us1.cisco.com/',
  'https://studio.aiagent-eu1.cisco.com/',
  'https://studio.aiagent-apjc1.cisco.com/',
  'https://studio.aiagent-anz1.cisco.com/',
  'https://studio.aiagent-ca1.cisco.com/',
  'https://studio.aiagent-jp1.cisco.com/',
  'https://studio.aiagent-sg1.cisco.com/',
  'https://studio.aiagent-eu2.cisco.com/',
];

app.post('/aiagent', async (req, res) => {
  const input = req.body || {};
  const { url, authToken, userAccessToken, body, method } = input;
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!authToken || !userAccessToken) return res.status(401).json({ error: 'Missing authToken or userAccessToken' });
  if (!ALLOWED_AIAGENT_HOSTS.some(h => url.startsWith(h))) {
    return res.status(403).json({ error: 'URL host not allowed', allowed: ALLOWED_AIAGENT_HOSTS });
  }
  const headers = {
    'auth-token': String(authToken).trim(),
    'user-access-token': String(userAccessToken).trim(),
    'content-type': 'application/json',
    accept: 'application/json',
    origin: new URL(url).origin,
    referer: new URL(url).origin + '/',
  };
  try {
    const upstream = await fetch(url, {
      method: (method || 'POST').toUpperCase(),
      headers,
      body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    const text = await upstream.text();
    const location = upstream.headers.get('location') || '';
    res.set('Access-Control-Expose-Headers', 'X-Upstream-Location');
    if (location) res.set('X-Upstream-Location', location);
    res.status(upstream.status).set('Content-Type', 'application/json').send(text);
  } catch (err) {
    res.status(502).json({ error: 'Proxy fetch failed', detail: String(err && err.message || err) });
  }
});

app.post('/token', async (req, res) => {
  if (!WEBEX_CLIENT_ID || !WEBEX_CLIENT_SECRET || !WEBEX_REDIRECT_URI) {
    return res.status(500).json({ error: 'Proxy is missing WEBEX_CLIENT_ID/WEBEX_CLIENT_SECRET/WEBEX_REDIRECT_URI' });
  }

  const code = (req.body && req.body.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Missing code' });

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: WEBEX_CLIENT_ID,
    client_secret: WEBEX_CLIENT_SECRET,
    code,
    redirect_uri: WEBEX_REDIRECT_URI,
  });

  const upstream = await fetch('https://webexapis.com/v1/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  const text = await upstream.text();
  res.status(upstream.status).set('Content-Type', 'application/json').send(text);
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Orbit proxy listening on port ${PORT}`);
});
