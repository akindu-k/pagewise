# md-to-pdf

A CloudConvert-style **Markdown → PDF** converter. Upload a `.md` file (or paste
Markdown) and download a polished PDF rendered with GitHub styling, syntax
highlighting, tables, and proper page margins.

## Stack

- **Express** — HTTP server + `/api/convert` endpoint
- **markdown-it** (+ **highlight.js**) — Markdown → styled HTML
- **github-markdown-css** — GitHub document styling
- **Puppeteer** — headless Chromium prints the HTML to a real A4 PDF
- **multer** — file upload handling
- Vanilla HTML/CSS/JS frontend (drag-and-drop upload + paste tab)

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

### Chromium system libraries (Linux/WSL)

Puppeteer's Chromium needs a few shared libraries. On Ubuntu/Debian:

```bash
sudo apt-get install -y libnss3 libnspr4 libasound2t64
```

## API

`POST /api/convert`

- **File upload:** `multipart/form-data` with a `file` field (`.md`, up to 10 MB)
- **Raw text:** JSON body `{ "markdown": "# Hello", "filename": "doc.md" }`

Responds with `application/pdf` as a download.
