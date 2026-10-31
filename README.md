# Sheets — private PDF merger & 4-up layout

A small web app that replaces the repetitive Online2PDF routine: **drop PDFs → they're merged in order → your saved layout preset is applied → preview → one-click download.**

Everything runs in your browser. Files are never uploaded anywhere; there is no server or backend.

## Features

- Upload many PDFs at once (file picker, or drag-and-drop onto the card or anywhere in the window)
- Reorder by dragging (mouse, touch or keyboard), with ↑/↓ buttons, or by sorting A–Z; remove files one at a time or clear all
- Live preview of the finished sheets (rendered with pdf.js), with a full-size viewer (← → / Esc)
- **Merge & Download** button (also **⌘/Ctrl + Enter**), plus Download and Open-in-new-tab
- Settings are saved to `localStorage` and restored on the next visit, with **Reset to my preset**
- Progress indicator and clear errors for non-PDFs, damaged files, password-protected files and impossible margins
- Responsive light/dark UI

### Default preset

| Setting | Value |
| --- | --- |
| Pages per sheet | 4, arranged 2 × 2 |
| Reading direction | Row by row, left to right |
| Paper | A4, orientation automatic |
| Outer margins | 15 mm on all sides |
| Inner margin | 5 mm |
| Borders | Off |

Everything can be changed: 1/2/4/6/8/9/16 pages or any custom grid up to 8 × 8, four reading directions, A3/A4/A5/Letter/Legal, portrait/landscape/auto, per-side margins, borders and the output file name.

### How the layout works

- Pages are embedded as **vector form XObjects** with pdf-lib, so text and graphics stay sharp and selectable. Nothing is rasterised.
- Each page is scaled uniformly to fit its cell and centred. The **aspect ratio is preserved, with no cropping or distortion**, and mixed page sizes are fine.
- Each page's **crop box** and **/Rotate** are respected, so pages look exactly as they do in a PDF viewer.
- **Auto orientation** picks portrait or landscape for the whole document, whichever renders the pages largest. Portrait pages give portrait A4 sheets; landscape slides give landscape sheets.
- **Incomplete final sheet**: the remaining pages keep the same size and position as on full sheets, and the empty cells stay blank.

## Run locally

Requires Node.js ≥ 22.13.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # PDF output tests (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Tests

`tests/impose.test.ts` generates real PDFs, runs them through the engine, then **parses the output with pdf.js**, a PDF implementation independent of pdf-lib. It verifies:

- sheet dimensions are exactly A4 (210 × 297 mm), and landscape when auto orientation calls for it
- 15 mm outer margins and 5 mm inner gaps, measured in millimetres from the drawn content
- 2 × 2 placement and row-by-row, left-to-right order across several merged files
- uniform scaling (aspect ratio preserved) and no clipped content
- incomplete final sheets, rotated pages (/Rotate 90/180/270), crop boxes and mixed page sizes
- the other reading orders, custom paper/grid/margins, borders on and off, and error cases

`tests/settings.test.ts` covers the default preset, persistence, and recovery from corrupt storage.

## Deploy to Vercel

The app is a static Vite site, and `vercel.json` is included.

**Option A: dashboard**

1. Push this repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Vercel detects Vite automatically (build `npm run build`, output `dist`). Click **Deploy**.

**Option B: CLI**

```bash
npm i -g vercel
vercel          # first run links the project and creates a preview deployment
vercel --prod   # production deployment
```

No environment variables are needed. Because processing happens in the browser, the deployment only serves static files. To keep the site to yourself, turn on **Vercel Authentication** (or password protection) under Project → Settings → Deployment Protection. The page also sends `noindex`.

## Project structure

```
src/
  lib/settings.ts     preset, validation, localStorage persistence
  lib/layout.ts       pure geometry: grid cells, fitting, reading order, orientation
  lib/impose.ts       pdf-lib merge + imposition engine
  lib/pdfjs.ts        pdf.js rendering for previews and thumbnails
  hooks/              files, settings, debounced auto-imposition
  components/         drop zone, sortable file list, settings panel, preview
tests/                vitest suites, PDF fixtures and parsers
```
