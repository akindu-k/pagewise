const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const { UserError } = require('./errors');

// Page sizes in PDF points (1/72 inch), portrait.
const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MARGINS = {
  none: 0,
  small: 20,
  big: 50,
};

// Max PDF page dimension allowed by most readers (200 inches).
const MAX_PAGE_PT = 14400;

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif']);

function parseOptions(raw = {}) {
  const pageSize = ['fit', 'a4', 'letter'].includes(raw.pageSize) ? raw.pageSize : 'a4';
  const orientation = raw.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margin = Object.hasOwn(MARGINS, raw.margin) ? raw.margin : 'none';
  return { pageSize, orientation, margin };
}

// Returns bytes pdf-lib can embed directly. JPEGs/PNGs that are already
// upright are passed through untouched (no re-encode, no quality loss);
// everything else is rotated per its EXIF orientation and re-encoded.
async function normalizeImage(buffer, name) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new UserError(`"${name}" is not a readable image.`);
  }
  if (!SUPPORTED_FORMATS.has(meta.format)) {
    throw new UserError(`"${name}" has an unsupported format (${meta.format || 'unknown'}).`);
  }

  // Copy into a standalone Uint8Array: upload Buffers can be views into a
  // larger pooled ArrayBuffer, which pdf-lib would otherwise read from offset 0.
  const upright = !meta.orientation || meta.orientation === 1;
  if (upright && meta.format === 'jpeg') return { kind: 'jpg', bytes: new Uint8Array(buffer) };
  if (upright && meta.format === 'png') return { kind: 'png', bytes: new Uint8Array(buffer) };

  const pipeline = sharp(buffer).rotate();
  if (meta.hasAlpha) {
    return { kind: 'png', bytes: await pipeline.png().toBuffer() };
  }
  return { kind: 'jpg', bytes: await pipeline.jpeg({ quality: 92 }).toBuffer() };
}

function pageDimensions(image, { pageSize, orientation, margin }) {
  const pad = MARGINS[margin];
  if (pageSize === 'fit') {
    // Treat pixels as CSS pixels (96 DPI) so the page matches on-screen size.
    const scale = Math.min(0.75, (MAX_PAGE_PT - 2 * pad) / Math.max(image.width, image.height));
    return [image.width * scale + 2 * pad, image.height * scale + 2 * pad];
  }
  const [w, h] = PAGE_SIZES[pageSize];
  return orientation === 'landscape' ? [h, w] : [w, h];
}

/**
 * @param {{ buffer: Buffer, name: string }[]} files  images, in page order
 * @param {object} rawOptions  { pageSize: fit|a4|letter, orientation: portrait|landscape, margin: none|small|big }
 * @returns {Promise<Uint8Array>} PDF bytes
 */
async function imagesToPdf(files, rawOptions) {
  const options = parseOptions(rawOptions);
  const pad = MARGINS[options.margin];
  const pdf = await PDFDocument.create();

  for (const file of files) {
    const { kind, bytes } = await normalizeImage(file.buffer, file.name);
    const image = kind === 'jpg' ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);

    const [pageW, pageH] = pageDimensions(image, options);
    const page = pdf.addPage([pageW, pageH]);

    // Scale to fit inside the margins, preserving aspect ratio, and center.
    const boxW = pageW - 2 * pad;
    const boxH = pageH - 2 * pad;
    const scale = Math.min(boxW / image.width, boxH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    page.drawImage(image, {
      x: (pageW - drawW) / 2,
      y: (pageH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return pdf.save();
}

module.exports = { imagesToPdf };
