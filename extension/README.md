# FlowRead browser extension

FlowRead's reading profiles on any web page. Turn it on and the page's text switches to your profile's font, spacing, colours and (optionally) bold word starts. Turn it off and the page goes back to exactly how it was.

Built with [WXT](https://wxt.dev) (Manifest V3) and React. The reading settings schema, profiles, bold-word-starts algorithm and reading CSS all come from `packages/core` (`@flowread/core`), the same code the web app uses.

## Features

- **On/off per tab** from the toolbar button, the `Alt+Shift+F` shortcut or the page context menu.
- **Page transform**: one injected `<style id="flowread-style">` (from `readingCss()`), bundled OFL fonts (Atkinson Hyperlegible Next, Lexend, OpenDyslexic, Literata), and bold word starts on live text. Form fields, code, `pre`, `kbd`, `samp`, SVG, MathML, contenteditable regions and `aria-hidden` content are never touched. Work runs in idle-time chunks, visible text first, and a `MutationObserver` picks up content that single-page apps add later.
- **On-page toolbar** (shadow DOM, keyboard accessible, draggable, snaps to a corner, minimisable, moves aside when it would cover a focused input). It has a profile switch, a focus line (reading ruler), read selection aloud, Simplify selection (plain-language rewrite by the FlowRead API) and Reader view (local article extraction with Readability and DOMPurify, shown with your profile).
- **PDFs**: "Open PDF in FlowRead" on PDF links and PDF tabs, plus a popup button. The extension downloads the PDF, converts it with the FlowRead API (progress shown on the badge) and opens it in the FlowRead web app.
- **Settings sync with the web app** through the bridge on the app origins. Settings live in `storage.sync`, so they follow the browser account.
- **Always on** for chosen sites, or for all sites, after the browser asks for permission.

## Develop

```bash
cd extension
npm install          # also runs `wxt prepare`
npm run fonts        # only needed if public/fonts is missing (copies from frontend/node_modules)
npm run dev          # Chrome with hot reload, uses http://localhost:8000 and http://localhost:5173
npm run dev:firefox
```

| Script | What it does |
|---|---|
| `npm run build` | Production Chrome/Edge build in `.output/chrome-mv3` |
| `npm run build:firefox` | Firefox MV3 build in `.output/firefox-mv3` |
| `npm run zip` / `npm run zip:firefox` | Store-ready zips in `.output/` (not uploaded anywhere) |
| `npm test` | Unit tests (Vitest + jsdom): transform, restoration, mutations, settings validation, SSE parsing |
| `npm run test:e2e` | Builds `.output/chrome-mv3-e2e` and runs Playwright against it in Chromium |
| `npm run compile` | TypeScript type check |

`src/config.ts` holds the API base and app origin. Development and e2e builds use `localhost`; production builds use `https://flowread-backend.onrender.com` and `https://flowread-mu.vercel.app`.

## Load it unpacked

- **Chrome / Edge**: run `npm run build`, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, choose **Load unpacked** and pick `extension/.output/chrome-mv3`.
- **Firefox (140+)**: run `npm run build:firefox`, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and pick `extension/.output/firefox-mv3/manifest.json`. Open the popup once and choose **Allow FlowRead services**, because Firefox does not grant `host_permissions` at install time.

## Keyboard

| Keys | Action |
|---|---|
| `Alt+Shift+F` | Turn FlowRead on or off for the current tab (change it at `chrome://extensions/shortcuts` or in Firefox's add-on shortcut settings) |
| `Tab` / `Shift+Tab` | Move through the toolbar; focus is trapped inside reader view while it is open |
| `Esc` | Close reader view or the plain-language result; otherwise minimise the toolbar |

## Permissions rationale (for store review)

| Permission | Why |
|---|---|
| `activeTab` | Lets the extension change the current tab only after the user clicks the toolbar button, uses the shortcut or picks a context-menu item. No access to other tabs. |
| `scripting` | Injects the reading transform into that tab (`executeScript`) and registers it for sites the user chose to keep "always on" (`registerContentScripts`). |
| `storage` | Saves reading settings (`sync`), extension preferences and the always-on site list (`local`), and per-tab state plus a converted document waiting to be handed to the web app (`session`). |
| `contextMenus` | "Open PDF in FlowRead" and "Turn FlowRead on or off". |
| `host_permissions`: `flowread-backend.onrender.com`, `localhost:8000` | The FlowRead API, used for Simplify selection and PDF conversion. |
| `host_permissions`: `flowread-mu.vercel.app`, `localhost:5173` | The FlowRead web app. A bridge content script there syncs settings and hands over converted documents. |
| `optional_host_permissions`: `<all_urls>` | Requested at runtime, per site, only when the user turns on "Always on for this site" or "All sites". A PDF link pointing to a different site from the current page also prompts for that one site. |
| `web_accessible_resources`: `fonts/*.woff2` | Pages need to load the bundled reading fonts. |

The extension never runs remote code and never evaluates page-provided strings. The bridge accepts only `hello`, `getSettings` and `setSettings` from the page, checks `event.source === window` and the `source` field, and validates settings against the shared schema.

## Privacy

FlowRead changes pages on your device. Page content leaves the device only when you ask for it:

- **Simplify selection** sends the selected text (up to 4,000 characters) and the page title to the FlowRead API.
- **Open PDF in FlowRead** downloads the PDF and sends the file to the FlowRead API for conversion.

Reader view, read aloud (the browser's speech engine), the focus line and the page transform all run locally. The extension has no analytics and no tracking. Settings sync uses the browser's own `storage.sync`.

## How the transform works (and how it is reversed)

`src/lib/transform.ts` is framework-free and covered by unit tests. For each eligible text node it keeps the **original** `Text` node in place, shortens it to its leading non-bold part, and inserts `<b class="fr-b">` elements and text nodes after it. It builds them with `createElement` and `createTextNode`, never `innerHTML`. Nothing is wrapped, so layouts that depend on child elements (flex, grid, `:first-child`) behave as before. Frameworks keep their references to the page's own text nodes, so when React rewrites `nodeValue`, the observer re-applies the change. Turning it off restores each original string and removes the inserted nodes, and tests assert that `document.body.innerHTML` is byte-identical afterwards. Text in scripts whose letters join or shape across a word (Arabic, Indic, South-East Asian) or that does not separate words with spaces (Chinese, Japanese) is left alone.

## Known limitations

- Pages with a strict Content Security Policy may block the injected `<style>` or the extension fonts. The page then keeps its own fonts or styles, and turning FlowRead off still restores it.
- The browser's built-in PDF viewers, `chrome://` pages and extension stores can't be scripted. For PDFs, use the context menu or the popup button, which work without scripting the tab. If a site blocks the download, save the file and upload it in the web app.
- Recolouring makes every element transparent over the theme background, which can hide content on pages that rely on background images to show information. Turn off **Recolour pages** in settings if this happens.
- Content inside iframes and closed shadow roots isn't transformed.

## Fonts

`public/fonts` contains unmodified Fontsource latin subsets licensed under the SIL Open Font License 1.1 (licence texts in `public/fonts/licenses`).
