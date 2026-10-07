# Discipline — Daily Tracker

A personal tracking dashboard built with HTML, CSS and vanilla JavaScript. It tracks daily habits, gym, sleep, prayers, study, nutrition, screen time, calendar events, diary entries, money, tasks, routines, and an ERPNext roadmap with CRM, weekly KPIs and a content hub.

## Run locally

Open `index.html` in a modern browser. There is no npm install or build step required to run the app. Alternatively, run `python3 -m http.server 8000` from the project root and open `http://localhost:8000`.

Tailwind CSS loads from a CDN and fonts load from Google Fonts, so a fresh load needs internet for those resources. The app has no service worker or guaranteed offline asset cache. Roadmap data is bundled locally and does not require a fetch.

## Project structure

```text
index.html                    Screens, forms, and ordered script loading
assets/
  css/style.css               Styles, responsive rules, theme variables
  images/icon.png             App icon
js/
  core/                       Storage, auth, navigation, UI, themes, startup
  features/                   Feature-specific application logic
  data/roadmap-days.js         Generated browser roadmap data
data/roadmap_days.json       Canonical roadmap data
docs/                       Reference PDF
scripts/build-roadmap.py     Roadmap generator
```

JavaScript files are classic scripts loaded in order at the end of `index.html`. They share global functions and state because the existing HTML uses inline event handlers. Keep storage first and initialization last. This separates the existing code by responsibility without introducing a framework or changing how the app runs.

Some existing feature files contain related helpers for other features, especially tasks and money. This is an organizational split, not full module isolation.

## Editing roadmap data

Edit `data/roadmap_days.json`, then regenerate the browser copy:

```sh
python3 scripts/build-roadmap.py
```

Commit both the JSON and generated JavaScript. Do not edit `js/data/roadmap-days.js` manually.

## Storage and local login

Application data, user records and sessions are stored in this browser's localStorage with the `disc_` prefix. There is no backend, remote account service or device synchronization. Changing browser or origin may use a different storage area; export a backup from Settings before moving your data.

The login is a local UI gate. Its existing password hash is not cryptographic, and localStorage is accessible through browser tools. Tracking records use shared storage keys rather than separate per-user databases. Treat this as a personal browser app, not secure multi-user authentication.

## Backups and customization

Settings supports JSON export/import, themes, regional preferences and data management. Local-folder backup support depends on the browser's File System Access API.

## Development checks

Check syntax with Node.js:

```sh
find js -name '*.js' -exec node --check {} \;
```

There is currently no automated browser test suite or package-manager setup.
