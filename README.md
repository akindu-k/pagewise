# md-to-pdf

A small self-hosted PDF toolkit. Pick a tool from the menu at the top of the page:

| Tool | URL | What it does |
| --- | --- | --- |
| Markdown → PDF | `/#md-to-pdf` | Upload a `.md` file (or paste Markdown) and get a PDF with GitHub styling, syntax highlighting and tables. |
| JPG → PDF | `/#jpg-to-pdf` | Up to 30 images (JPG, PNG, WebP, GIF, TIFF, AVIF), drag to reorder, choose page size / orientation / margin. |
| Merge PDF | `/#merge-pdf` | Up to 20 PDFs with page previews, drag to reorder, combined into one PDF. |
| Split PDF | `/#split-pdf` | Split by custom ranges, every N pages, or extract chosen pages; previews which file each page goes to. |

## Stack

- **Express** — HTTP server + `/api/convert` endpoint
- **markdown-it** (+ **highlight.js**) — Markdown → styled HTML
- **github-markdown-css** — GitHub document styling
- **Puppeteer** — headless Chromium prints the HTML to a real A4 PDF
- **pdf-lib** — builds the image PDF (JPEGs are embedded as-is, no re-encoding)
- **sharp** — reads image metadata, fixes EXIF rotation, converts WebP/GIF/TIFF/AVIF
- **pdf.js** (`pdfjs-dist`) — page thumbnails in the browser
- **multer** — file upload handling
- Vanilla HTML/CSS/JS frontend (ES modules, one per tool in `public/js/tools/`)

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

### `POST /api/convert` — Markdown to PDF


- **File upload:** `multipart/form-data` with a `file` field (`.md`, up to 10 MB)
- **Raw text:** JSON body `{ "markdown": "# Hello", "filename": "doc.md" }`

Responds with `application/pdf` as a download.

### `POST /api/images-to-pdf` — images to PDF

`multipart/form-data` with:

| Field         | Values                          | Default    |
| ------------- | ------------------------------- | ---------- |
| `files`       | one or more images, in page order (max 30, 15 MB each) | — |
| `pageSize`    | `a4`, `letter`, `fit` (page = image size) | `a4` |
| `orientation` | `portrait`, `landscape` (ignored for `fit`) | `portrait` |
| `margin`      | `none`, `small`, `big`          | `none`     |

```bash
curl -F files=@a.jpg -F files=@b.png -F pageSize=a4 -F margin=small \
  http://localhost:3000/api/images-to-pdf -o out.pdf
```

Responds with `application/pdf`; invalid or unsupported images return a `400` with a JSON `error`.

### `POST /api/merge` — merge PDFs

`multipart/form-data` with two or more `files` (PDFs, in merge order; max 20, 50 MB each).
Responds with `merged.pdf`. Password-protected or invalid PDFs return a `400` naming the file.

### `POST /api/split` — split a PDF

`multipart/form-data` with one `file` (PDF, max 100 MB) plus:

| Mode | Fields | Example |
| --- | --- | --- |
| `ranges` | `ranges`, optional `merge=true` | `ranges=1-3, 5, 8-` → 3 PDFs (`8-` = page 8 to the end) |
| `fixed` | `every` | `every=4` → pages 1-4, 5-8, … |
| `extract` | `pages` (`all` or a list), optional `merge=true` | `pages=2, 4-6` → one PDF per page |

Returns a single PDF when the result is one file, otherwise a `.zip` of PDFs.
The range parser lives in `lib/shared/page-ranges.mjs` and is also served to the
browser at `/shared/`, so the preview and the server always agree.
