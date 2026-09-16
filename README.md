# Orbit

A standalone Webex Contact Center administration toolkit — Queues, Business Hours,
Skills, Flows, Functions, Bulk Import, a guided Setup Wizard, and more.

Orbit's frontend is a static site (served from GitHub Pages): no backend
required to browse it. Sign in by pasting a Webex bearer token (see "Use
Bearer Token" in the header). A handful of endpoints that need CORS relaying
— and eventually the OAuth token exchange — run through a small Express
server deployed to Railway.

## Setup

1. **Deploy the proxy.** From `proxy/`, run `railway up` (requires a
   [Railway](https://railway.app/) account and the Railway CLI). This
   replaces the WxCC Flows/Functions API relays and the Webex status feed.
2. **Point the app at your proxy.** Edit `assets/js/orbit-config.js` and set
   `window.ORBIT_PROXY_BASE` to your deployed Railway URL.
3. **Serve the site.** GitHub Pages, or any static host — no build step.

## Authentication

Orbit ships with bearer-token sign-in only — paste a Webex API access token to
sign in. There is no bundled OAuth app. If you want a "Sign in with Webex"
button that completes a full OAuth flow, register your own Webex integration
in the [Cisco Developer Portal](https://developer.webex.com/my-apps) and wire
it up in `assets/js/index-page.js` (the `#authBtn` click handler currently
opens the bearer-token modal as a placeholder).

## Structure

- `index.html` / `home.html` — landing/sign-in and the tool hub
- `pages/wxcc/` — all Contact Center tool pages
- `pages/wxcc/wizard/` — the guided Setup Wizard
- `assets/js/theme.js` — shared header/nav/auth chrome
- `assets/js/components.js` — the `<api-tools-header>`, `<api-auth-card>`,
  `<api-tools-home>` etc. web components
- `proxy/server.js` — the Express CORS proxy (deployed to Railway)
