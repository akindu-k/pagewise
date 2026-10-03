// Generates the favicons, app icons and social share image in public/.
// The share image is rendered with headless Chromium so the IBM Plex web
// fonts are used; icons are plain shapes, rendered with sharp.
// Run after changing the branding: node scripts/make-images.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');

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
.mark { width: 76px; height: 76px; display: block; }
`;

const ogHtml = `<style>${fonts}
body { width: 1200px; height: 630px; padding: 92px 96px; border-left: 14px solid #c9411f; }
.brand { display: flex; align-items: center; gap: 22px; font-size: 52px; font-weight: 600; letter-spacing: -0.01em; }
h1 { margin-top: 92px; font-size: 80px; line-height: 1.08; font-weight: 600; letter-spacing: -0.025em; }
p { margin-top: 56px; font-family: PlexMono; font-size: 28px; color: #5f5b54; }
</style>
<div class="brand"><img class="mark" src="data:image/svg+xml;base64,${Buffer.from(iconSvg()).toString('base64')}" alt="">Pagewise</div>
<h1>Convert, combine and<br>shrink PDFs.</h1>
<p>Merge · Split · Compress · JPG to PDF · PDF to Word</p>`;

// The app icon: a white page with a folded corner on a vermilion tile.
// `lines` adds the text lines, which only read at 32px and up.
// `radius` 0 gives a full-bleed square (Apple and maskable Android icons
// are rounded by the OS).
function iconSvg({ lines = true, radius = 14 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="#c9411f"/>
  <path fill="#fff" d="M17 10h20l11 11v33H17z"/>
  <path fill="#f3b9a7" d="M37 10v11h11z"/>${lines ? `
  <path fill="#c9411f" d="M23 30h19v4H23zm0 8h19v4H23zm0 8h12v4H23z"/>` : ''}
</svg>`;
}

// Glyph scaled into the central 80% "safe zone" for maskable icons.
function maskableSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#c9411f"/>
  <g transform="translate(6.4 6.4) scale(0.8)">
    <path fill="#fff" d="M17 10h20l11 11v33H17z"/>
    <path fill="#f3b9a7" d="M37 10v11h11z"/>
    <path fill="#c9411f" d="M23 30h19v4H23zm0 8h19v4H23zm0 8h12v4H23z"/>
  </g>
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 72 * (size / 64) * 4 })
  .resize(size, size)
  .png({ compressionLevel: 9 })
  .toBuffer();

// .ico holding PNG images (supported by every current browser).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function makeIcons() {
  fs.writeFileSync(out('favicon.svg'), `${iconSvg()}\n`);
  fs.writeFileSync(out('favicon.ico'), ico([
    { size: 16, data: await png(iconSvg({ lines: false }), 16) },
    { size: 32, data: await png(iconSvg(), 32) },
    { size: 48, data: await png(iconSvg(), 48) },
  ]));
  fs.writeFileSync(out('apple-touch-icon.png'), await png(iconSvg({ radius: 0 }), 180));
  fs.writeFileSync(out('icon-192.png'), await png(iconSvg(), 192));
  fs.writeFileSync(out('icon-512.png'), await png(iconSvg(), 512));
  fs.writeFileSync(out('icon-maskable-512.png'), await png(maskableSvg(), 512));
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630 });
    await page.setContent(ogHtml, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out('og-image.png'), type: 'png' });
  } finally {
    await browser.close();
  }
  await makeIcons();
  console.log('Wrote og-image.png, favicon.svg, favicon.ico, apple-touch-icon.png and app icons in public/');
})();
