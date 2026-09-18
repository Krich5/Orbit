# Orbit

A standalone Webex Contact Center administration toolkit — Queues, Business Hours,
Skills, Flows, Functions, Bulk Import, a guided Setup Wizard, and more.

Orbit's frontend is a static site (served from GitHub Pages): no backend
required to browse it. Sign in by pasting a Webex bearer token (see "Use
Bearer Token" in the header). A handful of endpoints that need CORS relaying
— and eventually the OAuth token exchange — run through a small Express
server deployed to Railway.
