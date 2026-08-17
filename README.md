# Nova — v5.2.1

**Nova** is a fast, private web proxy built on the Vortex engine. Play 200+ games, browse the web unfiltered, and stay stealthy with built-in cloaking tools.

---

## Features

- **Browser** — Full proxy browsing powered by Vortex
- **Games** — 200+ games with ratings, favorites, and a live leaderboard
- **Apps** — 50+ web apps and platforms
- **Tab Cloaking** — Disguise the tab title and favicon (defaults to Google Classroom)
- **About Blank Mode** — Opens Nova inside an `about:blank` tab for extra stealth
- **Panic Button** — One keypress to instantly redirect away
- **Themes** — Dark, Nebula, Midnight Blue, Crimson, Forest, and Light
- **Ad Blocker** — Requires a Nova account to enable

---

## Setup

### Deploy to Cloudflare Pages

1. Clone or download this repo
2. Run `./deploy-pages-d1.sh`
3. Set up a custom domain if you want

Nova currently has no backend database. Accounts and all Nova data are stored
only in the current browser and do not sync between devices or users.

### Run Locally

Use Wrangler to serve the Pages project locally:

```bash
wrangler dev
```

---

## Settings Guide

| Setting | Default | Notes |
|---|---|---|
| Tab Cloaking | OFF | Pre-set to Google Classroom — just toggle on |
| Tab Cloak Title | Google Classroom | Change it to anything |
| Tab Cloak Favicon | classroom.png | Pick from 40+ site favicons |
| Ad Blocker | OFF | Requires a Nova account |
| About Blank Mode | OFF | Wraps Nova in `about:blank` |
| Panic Key | `` ` `` | Press to redirect instantly |
| Panic URL | classroom.google.com | Where the panic key sends you |
| Search Engine | Startpage | Also: DuckDuckGo, Bing, Brave, Google |

---

## Tab Cloaking

Tab cloaking lets you disguise this tab so it looks like something else.

- Toggle is **off by default** — but it's pre-loaded with "Google Classroom" and the Classroom favicon
- Just flip the toggle and it's good to go
- To change the favicon, click **Pick Favicon from Icons** — choose from 40+ real site favicons (Google, Canvas, Schoology, etc.)

---

## Ad Blocker

The built-in ad blocker is **off by default**. To turn it on, you need a Nova account. Click **Sign In** in the top-right corner to create one — it's free and stored locally.

---

## Panic Button

Press your panic key (default: `` ` ``) from anywhere to instantly redirect to your panic URL. You can change both in Settings → Panic Key. Click the **⚠ Panic** button in the nav bar for the same effect.

---

## File Structure

```
/
├── index.html          Main app shell
├── css/
│   └── nova.css        All styles
├── js/
│   ├── nova.js         Main app logic
│   └── nova-proxy.js   Proxy helpers
├── assets/
│   └── media/
│       ├── icons/      Game & app icons (400+)
│       └── favicon/    Site favicons for cloaking (40+)
├── config.js           Config values
├── _worker.js          Static Pages Worker; database routes are disabled
├── wrangler.toml       Cloudflare Pages config (no database binding)
├── store.js            Storage helpers
├── sw.js               Service worker
├── vortex.all.js       Vortex proxy engine
└── README.md           This file
```

---

## Credits

Nova is owned and operated by **[NEXUS](https://nexus.thetechpro3.workers.dev/)**.  
Proxy engine powered by **Vortex** and **Bare Mux**.
