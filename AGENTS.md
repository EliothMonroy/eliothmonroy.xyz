# eliothmonroy.xyz

Personal static website hosted on GitHub Pages at `https://eliothmonroy.xyz` (`CNAME` is `eliothmonroy.xyz`). The homepage is an English resume-style page. Mini-apps live in their own folders.

This file is the source of truth for coding agents. Cursor-specific notes live in `.cursor/rules/`.

## Stack

- Vanilla HTML, CSS, and JavaScript. No bundler, no root `package.json`, no install step.
- GitHub Pages serves files as-is. Paths are relative; do not assume a build output directory.
- **WorldCupSimulator** is the exception: Vue 3 from the unpkg CDN (`vue.global.prod.js`), plus Node’s built-in test runner for `logic.js`.

Do not add a framework, bundler, or package manager unless the user asks.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `styles/styles.css` | Homepage: resume (vanilla HTML/CSS). Dark theme, mobile styles in the same CSS file. |
| `cv/` | PDF resumes. Treat as binary assets; do not rewrite. |
| `moviepicker/` | Vanilla random movie picker (`index.html`, `styles/`, `js/`). |
| `gamepicker/` | Vanilla random game picker (`index.html`, `css/`, `js/`). |
| `WorldCupSimulator/` | FIFA World Cup 2026 simulator. `logic.js` is the pure rules engine (browser + Node); `app.js` is the Vue UI; `tests/logic.test.js` covers `logic.js`. |
| `tiendapp/` | Static privacy policy text only. |

Each mini-app is self-contained. Do not share CSS/JS across apps unless asked. Folder conventions already differ (`styles/` vs `css/`); match the app you are in.

## Commands

There is no lint, format, or build command.

World Cup Simulator unit tests (Node 18+):

```bash
node --test WorldCupSimulator/tests/logic.test.js
```

Serve locally by opening HTML files or using any static file server from the repo root (GitHub Pages uses the root as the site root).

## Conventions

- Keep HTML/CSS/JS readable and small. Prefer existing patterns in the file you are editing over new abstractions.
- In **WorldCupSimulator**, keep tournament rules and simulation in `logic.js`. Keep Vue UI, persistence, and DOM concerns in `app.js`. `logic.js` already exports via `module.exports` for Node tests; preserve that dual browser/Node shape.
- In **moviepicker** / **gamepicker**, the pick lists live as arrays in the JS files. Preserve that data-in-JS style unless asked to move it.
- Prefer vanilla JS. Do not introduce TypeScript, React, or a CSS framework without being asked.
- UI changes: verify in the browser, including related pages that share the same files. The site has no automated UI tests.

## Boundaries

- Do not invent npm scripts, CI, or a build pipeline.
- Do not commit secrets, credentials, or `.env` files.
- Do not rewrite the PDFs in `cv/`.
- Do not change `CNAME` unless the user is changing the domain.
- Commit only when the user asks.
