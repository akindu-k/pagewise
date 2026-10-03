// Generates the social share image and the Apple touch icon in public/,
// rendered with headless Chromium so the IBM Plex web fonts are used.
// Run after changing the branding: node scripts/make-images.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const out = (name) => path.join(__dirname, '..', 'public', name);

function font(pkg, file) {
  const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files');
  return `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, file)).toString('base64')})`;
}

const fonts = `
@font-face { font-family: Plex; font-weight: 400; src: ${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2')}; }
@font-face { font-family: Plex; font-weight: 600; src: ${font('@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2')}; }
@font-face { font-family: PlexMono; src: ${font('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2')}; }
* { margin: 0; box-sizing: border-box; }
body { background: #f4f2ee; color: #1d1c1a; font-family: Plex; }
.mark { width: 64px; height: 78px; background: #c9411f; clip-path: polygon(0 0, 62% 0, 100% 30%, 100% 100%, 0 100%); position: relative; }
.mark::after { content: ""; position: absolute; top: 0; right: 0; width: 38%; height: 30%; background: rgba(255,255,255,.45); clip-path: polygon(0 0, 100% 100%, 0 100%); }
`;

const ogHtml = `<style>${fonts}
body { width: 1200px; height: 630px; padding: 92px 96px; border-left: 14px solid #c9411f; }
.brand { display: flex; align-items: center; gap: 22px; font-size: 52px; font-weight: 600; letter-spacing: -0.01em; }
h1 { margin-top: 92px; font-size: 80px; line-height: 1.08; font-weight: 600; letter-spacing: -0.025em; }
p { margin-top: 56px; font-family: PlexMono; font-size: 28px; color: #5f5b54; }
</style>
<div class="brand"><div class="mark"></div>Pagewise</div>
<h1>Convert, combine and<br>shrink PDFs.</h1>
<p>Merge · Split · Compress · JPG to PDF · PDF to Word</p>`;

const iconHtml = `<style>${fonts}
body { width: 180px; height: 180px; display: grid; place-items: center; }
.mark { width: 92px; height: 112px; }
</style><div class="mark"></div>`;

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const [html, file, width, height] of [[ogHtml, 'og-image.png', 1200, 630], [iconHtml, 'apple-touch-icon.png', 180, 180]]) {
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: out(file), type: 'png' });
    }
  } finally {
    await browser.close();
  }
  console.log('Wrote public/og-image.png and public/apple-touch-icon.png');
})();
