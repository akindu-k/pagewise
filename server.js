const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

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

app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    let markdownSource;
    let baseName = 'document';

    if (req.file) {
      markdownSource = req.file.buffer.toString('utf8');
      baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
    } else if (req.body && typeof req.body.markdown === 'string') {
      markdownSource = req.body.markdown;
      if (req.body.filename) {
        baseName = path.basename(req.body.filename, path.extname(req.body.filename));
      }
    } else {
      return res.status(400).json({ error: 'No markdown provided. Send a "file" upload or "markdown" text field.' });
    }

    if (!markdownSource.trim()) {
      return res.status(400).json({ error: 'Markdown content is empty.' });
    }

    const html = renderHtmlDocument(markdownSource, baseName);
    const pdfBuffer = await htmlToPdfBuffer(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Conversion failed:', err);
    res.status(500).json({ error: `Conversion failed: ${err.message}` });
  }
});

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
