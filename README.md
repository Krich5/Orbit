# Orbit

A standalone Webex administration toolkit for Webex Contact Center and Webex Calling. Sign in with your own Webex account and work against your own tenant.

## What's inside

**Webex Contact Center**
- Queues, Business Hours, Skills, Channels (Entry Points), Address Book
- Flows (list, export, visualize), Functions, Function Builder
- Contact Center Users, Desktop Profiles
- Desktop Layout editor with a live preview, header icon toggles, notification timers, and a live JSON view
- Realtime Dashboard, Historical Data, Search API, Outbound Campaign Manager, Epoch Time
- Bulk Import and a guided Setup Wizard (Teams, Queues, Channels, Desktop Profile, Users)

**Webex Calling**
- Workspaces, Locations, Numbers, Usage & Activity, Devices, Users, Virtual Lines, Auto Attendant

**AI Agent**
- AI Bot Visualizer, Call Transcript Summary, AI Utilization setup, Autonomous Instructions Builder, AI Agent Calculator

**Webex Meetings and Messages**
- Meeting Transcriptions, Space History Export

**Admin**
- As-Built documentation generator (Webex Calling, Contact Center, or both)

## Using it

Open the site and choose **Sign in with Webex**. Your session stays in your browser, and nothing is stored on a server. The sidebar groups every tool into folders; the folder for the page you're on opens automatically.

Orbit can also be installed as an app from Chrome (address bar install icon) for its own window and dock icon.

## Layout

```
index.html / home.html   sign-in and home
callback.html            sign-in return page
pages/
  wxcc/                  Contact Center tools (wizard/ holds the setup steps)
  wxc/                   Webex Calling tools
  aiagent/               AI Agent tools
  meetings/ wxmessages/  Meetings and Messages tools
  asbuilt/               As-Built generator
assets/                  scripts, styles, images, flow and template files
```

Some Webex APIs block direct browser calls, so a small hosted relay forwards those requests. It only passes your own token through for that call.

## Status

Orbit is a sandbox that is actively evolving. Some pages carried over from earlier tooling may still be rough around the edges.
