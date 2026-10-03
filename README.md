# md-to-pdf

A small PDF converter with two modes, picked from the switcher at the top of the page:

- **Markdown → PDF** (`/#md-to-pdf`) — upload a `.md` file (or paste Markdown) and
  download a polished PDF rendered with GitHub styling, syntax highlighting,
  tables, and proper page margins.
- **JPG → PDF** (`/#jpg-to-pdf`) — upload up to 30 images (JPG, PNG, WebP, GIF,
  TIFF, AVIF), drag to reorder, choose page size / orientation / margin, and
  download them as a single PDF.

## Stack

- **Express** — HTTP server + `/api/convert` endpoint
- **markdown-it** (+ **highlight.js**) — Markdown → styled HTML
- **github-markdown-css** — GitHub document styling
- **Puppeteer** — headless Chromium prints the HTML to a real A4 PDF
- **pdf-lib** — builds the image PDF (JPEGs are embedded as-is, no re-encoding)
- **sharp** — reads image metadata, fixes EXIF rotation, converts WebP/GIF/TIFF/AVIF
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
