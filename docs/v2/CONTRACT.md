# FlowRead v2: shared contract

Branch `v2/unified` in worktree `OneDrive/Documents/Projects/flowread-access`. This file **extends** `docs/access/CONTRACT.md`, and everything in that file still holds unless this one changes it. The lead owns both files. If you need to change one, put the change in your final report and don't edit the file.

## Product in one line
Upload study material (PDF, DOCX, PPTX, pasted text or a web link). FlowRead rebuilds it as the **same structured document**, with its headings, lists, tables, images and maths, then lets you read it with a reading profile and **download it as an accessible PDF** in that profile. A browser extension applies the same profile to any web page.

## Ownership (edit only your own paths)
| Owner | Paths |
|---|---|
| Lead | `packages/core/**`, `docs/**`, repo-root files, `frontend/vite.config.js`, `frontend/package.json`, `backend/requirements.txt`, `backend/main.py` |
| Backend agent | `backend/**` except `requirements.txt` and `main.py` (list the dependencies and router wiring you need in your report) |
| Web agent | `frontend/src/**`, `frontend/index.html`, `frontend/public/**`, `frontend/tests/**` |
| Extension agent | `extension/**` |

Commit to `v2/unified`, adding only your own paths (`git add <paths>`, never `-A`). **Never push.** Never commit `.env`.

## Shared code: `packages/core` (`@flowread/core`)
Framework-free ESM. The frontend imports it as `@flowread/core` or `@flowread/core/<file>.js` through a Vite alias. The extension must set up the same alias in its WXT/Vite config: `'@flowread/core': '../packages/core/src'`.

| Module | Exports |
|---|---|
| `profiles.js` | `THEMES`, `FONTS` (now includes `lexend`), `DEFAULT_SETTINGS`, `PROFILES`, `PROFILE_ORDER`, `getProfile`, `settingsForProfile`, `resolveSettings`, `settingsToStyle`, `settingsToData` |
| `boldStarts.js` | `boldLength(n)`, `splitWordStart(word) → [pre,bold,rest]`, `boldRanges(text) → [{start,end}]`, `boldSegments(text) → [{text,bold}]` |
| `readingCss.js` | `THEME_COLORS`, `FONT_FAMILIES`, `readingCss(settings, {scope, recolor, boldClass})`, `printCss(settings, {pageSize})` |
| `docModel.js`, `check.js` | the same as before (moved from `frontend/src/access/shared/`, which now re-exports them) |

`fixtures/boldStarts.json` is the parity table. The Python port (`backend/export/bold_starts.py`) **must** pass it, and so must the JS (`node --test packages/core/test/*.test.js`).

**Settings object** = `DEFAULT_SETTINGS` in `profiles.js`. It is the one settings schema used by the reader, the export endpoint, the extension and sync. Theme ids are `light`, `cream`, `dark` and `high-contrast`. The colours are in `THEME_COLORS`; all text pairs reach at least 4.5:1 contrast and the PDF exporter must use the same colours. Font ids are `system`, `atkinson`, `lexend`, `dyslexic` and `serif`.

## AccessDoc additions (all optional and backward compatible)
- `doc.source`: `{ kind: "pdf"|"docx"|"pptx"|"text"|"url", pages: number|null, url: string|null }`.
- `paragraph.marks`: `[{ start, end, type: "bold"|"italic"|"link", href? }]`, using UTF-16 offsets into `text`. Renderers apply marks and **must** sanitise `href` (http, https or mailto only).
- `paragraph.role`: `"notes"` for slide speaker notes, `"caption"` for a figure caption that stands alone. If the role is missing, it is an ordinary paragraph.
- `image.origin`: `"raster"|"vector"|"page"`, where `"page"` means a scanned page shown as an image because OCR was unavailable.
- New report rule `page-needs-ocr` (serious): a scanned page could not be converted to text. It goes in both `check.py` and the lead-owned `packages/core/src/check.js`. **The backend agent adds it to Python and reports it**, and the lead mirrors it in JS.
- PPTX: each slide becomes one section (`heading` = slide title, `level` 2), followed by a `pageMarker` whose `n` is the slide number.

## API additions (FastAPI)
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/access/convert` | as before, now also accepts **`.pptx`** | SSE, as before |
| POST | `/api/access/convert-text` | `{ "text": "...", "title": "optional" }` (max 200k characters) | `AccessDoc` (JSON). Paragraph breaks become paragraphs, and Markdown-style `#` headings and `-`/`1.` lists are recognised. |
| POST | `/api/access/convert-url` | `{ "url": "https://..." }` | `AccessDoc` (JSON) built from the article HTML. Must block private, loopback and link-local IPs (SSRF), follow at most 3 redirects, allow 10 s, cap the response at 5 MB, and accept http(s) only. Responds with a PDF URL converted as a PDF. |
| POST | `/api/access/define` | `{ "term": "...", "context": "sentence" }` | `{ "definition": "one or two plain sentences" }`, or 503 with no API key |
| POST | `/api/export/pdf` | `{ "doc": AccessDoc, "settings": Settings, "options": { "pageSize": "A4"\|"Letter", "includeSummaries": bool, "includePlain": bool, "includePageRefs": bool, "includeToc": bool } }` | `application/pdf` (tagged PDF/UA-1, selectable text, embedded fonts, bookmarks from headings). 413 if the doc JSON is over 30 MB. 422 for an invalid doc. |
| GET | `/api/export/health` | none | `{ "typst": "0.x", "fonts": ["Atkinson Hyperlegible Next", ...] }` |

There is no export rate limiting yet. Every endpoint keeps working without `ANTHROPIC_API_KEY` except plain, summary, define and describe, which return 503. Claude vision for scanned or maths-heavy pages is skipped when there's no key, and the page becomes an `image` block with `origin: "page"` plus a `page-needs-ocr` issue.

## Frontend (web agent)
Routes:
- `/`: landing page with an upload, paste or link box.
- `/library`: documents, with progress and resume.
- `/read/:id`: the reader.
- `/read/:id/edit`: fix structure (StructureEditor, ImageQueue, ReportPanel).
- `/workspace`, `/workspace/new` and `/workspace/review/:id`: the institution mode (the old `/access*` routes; keep redirects from `/access*`).
- `/reader` redirects to `/`.

Storage: `src/access/shared/storage.js` moves to **IndexedDB** (`idb-keyval`) with **async** `listDocs()`, `getDoc(id)`, `saveDoc(doc)`, `deleteDoc(id)`, plus `saveSource(id, Blob)` and `getSource(id)` for the original file. On first load, move any existing localStorage docs across once.

## Extension ↔ web app protocol
The extension has a content script that runs **only** on the FlowRead app origins (`http://localhost:5173/*` and `https://flowread-mu.vercel.app/*`). It bridges between the page and the extension with `window.postMessage`:
- Page to extension: `{ source: "flowread-app", type: "hello" | "setSettings" | "getSettings", settings? }`.
- Extension to page: `{ source: "flowread-ext", type: "ready" | "settings" | "openDoc", settings?, doc? }`. `ready` carries `{ version }`.
- `openDoc` hands the page an AccessDoc that the extension converted (for example a PDF from a tab). The page saves it and goes to `/read/:id`.
- Both sides **must** check `event.source === window` and the `source` field. The extension accepts only `setSettings` and `getSettings` from the page and never runs anything the page asks it to.

The web app works the same whether or not the extension is installed.

## Quality bar (QA tests this)
Everything in the old contract's "Accessibility bar" still applies, plus:
- Exported PDFs: text is selectable, headings appear as bookmarks, and they pass veraPDF PDF/UA-1, or the report lists each failure.
- Extension: toggling off restores the page DOM exactly (same `innerHTML` on a test page). It never touches inputs, textareas, contenteditable, code or pre.
- No `dangerouslySetInnerHTML` anywhere in `frontend/src` except escaped and audited spots, each with a comment.
