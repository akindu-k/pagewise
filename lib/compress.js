const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { UserError } = require('./errors');
const { loadPdf } = require('./pdf-tools');

// Compression levels mapped to Ghostscript presets. These mainly control how
// far embedded images are downsampled (72 / 150 / 300 dpi).
const LEVELS = {
  extreme: '/screen',
  recommended: '/ebook',
  low: '/printer',
};

// Ghostscript otherwise picks the image encoding itself, and for the
// /screen preset it often stores photos losslessly (Flate), which can come
// out several times larger than /ebook. Force JPEG for the smaller presets.
const FORCE_JPEG = [
  '-dAutoFilterColorImages=false',
  '-dColorImageFilter=/DCTEncode',
  '-dAutoFilterGrayImages=false',
  '-dGrayImageFilter=/DCTEncode',
];

const TIMEOUT_MS = 120 * 1000;

function runGhostscript(args) {
  return new Promise((resolve, reject) => {
    execFile('gs', args, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.output = `${stdout}\n${stderr}`;
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Compresses a PDF with Ghostscript.
 *
 * @param {{ buffer: Buffer, name: string }} file
 * @param {string} level  extreme | recommended | low
 * @returns {Promise<{ bytes: Buffer, originalSize: number, compressedSize: number }>}
 *   If Ghostscript can't make the file smaller, the original is returned.
 */
async function compressPdf(file, level) {
  const key = Object.hasOwn(LEVELS, level) ? level : 'recommended';
  // Validates the upload first: Ghostscript turns a password-protected PDF
  // into blank pages instead of failing.
  await loadPdf(file.buffer, file.name);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-'));
  const input = path.join(dir, 'in.pdf');
  const output = path.join(dir, 'out.pdf');

  try {
    await fs.writeFile(input, file.buffer);
    try {
      await runGhostscript([
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.5',
        `-dPDFSETTINGS=${LEVELS[key]}`,
        ...(key === 'low' ? [] : FORCE_JPEG),
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSAFER',
        '-dNOPAUSE',
        '-dBATCH',
        '-dQUIET',
        `-sOutputFile=${output}`,
        input,
      ]);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error('Ghostscript (gs) is not installed on the server.');
      }
      if (err.killed) {
        throw new UserError(`"${file.name}" took too long to compress.`);
      }
      throw new UserError(`"${file.name}" could not be compressed. It may be damaged or not a PDF.`);
    }

    const compressed = await fs.readFile(output);
    const originalSize = file.buffer.length;
    // Already-optimized PDFs can come out bigger; never hand those back.
    const bytes = compressed.length < originalSize ? compressed : file.buffer;
    return { bytes, originalSize, compressedSize: bytes.length };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { compressPdf, LEVELS };
