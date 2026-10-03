# Pagewise API

Every tool in the UI is a plain HTTP endpoint, so you can script it with `curl` or call it from another app. All endpoints take `multipart/form-data` (Markdown also accepts JSON), respond with the file as a download, and return `400` with a JSON `{ "error": "..." }` for bad input.

## `POST /api/convert`: Markdown to PDF

- **File upload:** `multipart/form-data` with a `file` field (`.md`, up to 10 MB)
- **Raw text:** JSON body `{ "markdown": "# Hello", "filename": "doc.md" }`

Responds with `application/pdf` as a download.

```bash
curl -H 'Content-Type: application/json' -d '{"markdown": "# Hello"}' \
  http://localhost:3000/api/convert -o hello.pdf
```

## `POST /api/images-to-pdf`: images to PDF

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

## `POST /api/merge`: merge PDFs

`multipart/form-data` with two or more `files` (PDFs, in merge order; max 20, 50 MB each).
Responds with `merged.pdf`. Password-protected or invalid PDFs return a `400` naming the file.

## `POST /api/split`: split a PDF

`multipart/form-data` with one `file` (PDF, max 100 MB) plus:

| Mode | Fields | Example |
| --- | --- | --- |
| `ranges` | `ranges`, optional `merge=true` | `ranges=1-3, 5, 8-` → 3 PDFs (`8-` = page 8 to the end) |
| `fixed` | `every` | `every=4` → pages 1-4, 5-8, … |
| `extract` | `pages` (`all` or a list), optional `merge=true` | `pages=2, 4-6` → one PDF per page |

Returns a single PDF when the result is one file, otherwise a `.zip` of PDFs.
The range parser lives in `lib/shared/page-ranges.mjs` and is also served to the
browser at `/shared/`, so the preview and the server always agree.

## `POST /api/compress`: compress a PDF

`multipart/form-data` with one `file` (PDF, max 100 MB) and `level`:

| `level` | Ghostscript preset | Images |
| --- | --- | --- |
| `extreme` | `/screen` | 72 dpi, JPEG |
| `recommended` (default) | `/ebook` | 150 dpi, JPEG |
| `low` | `/printer` | 300 dpi |

Responds with the compressed PDF plus `X-Original-Size` / `X-Compressed-Size`
headers. If compression wouldn't make the file smaller, the original is returned.

## `POST /api/pdf-to-word`: PDF to Word

`multipart/form-data` with one `file` (PDF, max 50 MB). Responds with a `.docx`.

Notes on output quality:
- Text, headings, bordered tables and images convert well. Borderless tables come through as text
  (guessing them turns ordinary bullet lists into tables).
- Large photos are re-encoded as JPEG inside the `.docx` to keep the file small.
- Scanned PDFs have no text layer, so pages come through as images (no OCR).
