const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const puppeteer = require('puppeteer');
const { UserError } = require('./lib/errors');
const { imagesToPdf } = require('./lib/images-to-pdf');
const { mergePdfs, splitPdf } = require('./lib/pdf-tools');

const PORT = process.env.PORT || 3000;

const MB = 1024 * 1024;

// Upload middleware for one form field. Limit errors (too large, too many
// files) are reported as JSON 400s with a message the UI can show as-is.
function uploadFiles(field, { maxFiles, maxSizeMB }) {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeMB * MB, files: maxFiles },
  }).array(field, maxFiles);

  return (req, res, next) => {
    parse(req, res, (err) => {
      if (!err) return next();
      if (!(err instanceof multer.MulterError)) return next(err);
      const tooMany = maxFiles === 1 ? 'Upload one file at a time.' : `Too many files (max ${maxFiles}).`;
      const messages = {
        LIMIT_FILE_SIZE: `File is too large (max ${maxSizeMB}MB).`,
        LIMIT_FILE_COUNT: tooMany,
        LIMIT_UNEXPECTED_FILE: tooMany,
      };
      res.status(400).json({ error: messages[err.code] || err.message });
    });
  };
}

// Wraps a route: UserErrors become 400s, anything else a logged 500.
function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof UserError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(`${req.path} failed:`, err);
      res.status(500).json({ error: `Conversion failed: ${err.message}` });
    }
  };
}

function baseNameOf(filename) {
  return path.basename(filename, path.extname(filename));
}

// Sends bytes as a download. The name is made header-safe, since non-ASCII
// characters would make setHeader throw.
function sendDownload(res, bytes, { baseName, ext, type }) {
  const safe = baseName.replace(/[^\w.\- ]+/g, '_').trim() || 'document';
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.${ext}"`);
  res.send(Buffer.from(bytes));
}

function sendPdf(res, bytes, baseName) {
  sendDownload(res, bytes, { baseName, ext: 'pdf', type: 'application/pdf' });
}

function requireFiles(req, what) {
  if (!req.files || req.files.length === 0) {
    throw new UserError(`No ${what} provided.`);
  }
  return req.files.map((f) => ({ buffer: f.buffer, name: f.originalname }));
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch {
        // fall through to escaped output below
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

const markdownCss = fs.readFileSync(
  require.resolve('github-markdown-css/github-markdown-light.css'),
  'utf8'
);
const highlightCss = fs.readFileSync(
  require.resolve('highlight.js/styles/github.css'),
  'utf8'
);

function renderHtmlDocument(markdownSource, title) {
  const body = md.render(markdownSource);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${markdownCss}
${highlightCss}
body {
  margin: 0;
  padding: 2rem 3rem;
}
.markdown-body {
  box-sizing: border-box;
}
.markdown-body pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
@media print {
  body { padding: 0; }
}
</style>
</head>
<body class="markdown-body">
${body}
</body>
</html>`;
}

// Single shared browser instance, launched lazily and reused across requests.
let browserPromise = null;
function launchBrowser() {
  browserPromise = puppeteer
    .launch({
      headless: true,
      // --disable-dev-shm-usage: containers (Render/Docker) give a tiny /dev/shm
      // which crashes Chromium on larger renders; force it to use /tmp instead.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    .catch((err) => {
      // Don't cache a failed launch, otherwise every later request keeps
      // rejecting (e.g. after missing system libs are installed) until restart.
      browserPromise = null;
      throw err;
    });
  return browserPromise;
}

async function getBrowser() {
  if (!browserPromise) return launchBrowser();
  const browser = await browserPromise;
  // The shared browser can crash/disconnect (e.g. OOM on a big render); if so,
  // relaunch instead of handing back a dead instance that fails every request.
  if (!browser.connected) return launchBrowser();
  return browser;
}

async function htmlToPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Cap the wait so an unreachable remote asset can't hang the request; fall
    // back to 'load' if the network never fully settles within the window.
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (err) {
      if (err.name !== 'TimeoutError') throw err;
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/vendor/pdfjs', express.static(path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'build')));

app.use('/shared', express.static(path.join(__dirname, 'lib', 'shared')));

app.post('/api/convert', uploadFiles('file', { maxFiles: 1, maxSizeMB: 10 }), route(async (req, res) => {
  let markdownSource;
  let baseName = 'document';

  const file = req.files && req.files[0];
  if (file) {
    markdownSource = file.buffer.toString('utf8');
    baseName = baseNameOf(file.originalname);
  } else if (req.body && typeof req.body.markdown === 'string') {
    markdownSource = req.body.markdown;
    if (req.body.filename) baseName = baseNameOf(req.body.filename);
  } else {
    throw new UserError('No markdown provided. Send a "file" upload or "markdown" text field.');
  }

  if (!markdownSource.trim()) {
    throw new UserError('Markdown content is empty.');
  }

  const html = renderHtmlDocument(markdownSource, baseName);
  sendPdf(res, await htmlToPdfBuffer(html), baseName);
}));

app.post('/api/images-to-pdf', uploadFiles('files', { maxFiles: 30, maxSizeMB: 15 }), route(async (req, res) => {
  const files = requireFiles(req, 'images');
  const pdfBytes = await imagesToPdf(files, req.body);
  sendPdf(res, pdfBytes, files.length === 1 ? baseNameOf(files[0].name) : 'images');
}));

app.post('/api/merge', uploadFiles('files', { maxFiles: 20, maxSizeMB: 50 }), route(async (req, res) => {
  const files = requireFiles(req, 'PDFs');
  if (files.length < 2) {
    throw new UserError('Add at least two PDFs to merge.');
  }
  sendPdf(res, await mergePdfs(files), 'merged');
}));

app.post('/api/split', uploadFiles('file', { maxFiles: 1, maxSizeMB: 100 }), route(async (req, res) => {
  const [file] = requireFiles(req, 'PDF');
  const result = await splitPdf(file, req.body, baseNameOf(file.name));
  if (result.type === 'pdf') {
    sendPdf(res, result.bytes, result.name);
  } else {
    sendDownload(res, result.bytes, { baseName: result.name, ext: 'zip', type: 'application/zip' });
  }
}));

app.listen(PORT, () => {
  console.log(`md-to-pdf server running at http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  process.exit(0);
});
