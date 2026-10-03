const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');
const { UserError } = require('./errors');

// The page-range planner is an ES module shared with the browser.
const pageRanges = import('./shared/page-ranges.mjs');

// Parses an uploaded PDF, turning pdf-lib's errors into messages for the user.
async function loadPdf(buffer, name) {
  let pdf;
  try {
    // Copy into a standalone Uint8Array: upload Buffers can be views into a
    // larger pooled ArrayBuffer.
    pdf = await PDFDocument.load(new Uint8Array(buffer), { updateMetadata: false });
  } catch (err) {
    // pdf-lib throws a plain Error here, so match on its message.
    if (/is encrypted/.test(err.message)) {
      throw new UserError(`"${name}" is password-protected. Unlock it first, then try again.`);
    }
    throw new UserError(`"${name}" is not a valid PDF.`);
  }
  if (pdf.getPageCount() === 0) {
    throw new UserError(`"${name}" has no pages.`);
  }
  return pdf;
}

/**
 * @param {{ buffer: Buffer, name: string }[]} files  PDFs, in merge order
 * @returns {Promise<Uint8Array>} merged PDF bytes
 */
async function mergePdfs(files) {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const source = await loadPdf(file.buffer, file.name);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

/**
 * Splits one PDF according to planSplit() options.
 *
 * @param {{ buffer: Buffer, name: string }} file
 * @param {object} options  see planSplit in shared/page-ranges.mjs
 * @param {string} baseName  used to name the output files
 * @returns {Promise<{ type: 'pdf'|'zip', bytes: Uint8Array, name: string }>}
 *   a single PDF when the plan has one file, otherwise a zip of PDFs
 */
async function splitPdf(file, options, baseName) {
  const { planSplit, PageRangeError } = await pageRanges;
  const source = await loadPdf(file.buffer, file.name);

  let plan;
  try {
    plan = planSplit(options, source.getPageCount());
  } catch (err) {
    if (err instanceof PageRangeError) throw new UserError(err.message);
    throw err;
  }

  const outputs = [];
  for (const part of plan) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(source, part.pages.map((p) => p - 1));
    pages.forEach((page) => doc.addPage(page));
    outputs.push({ name: `${baseName}_${part.label}`, bytes: await doc.save() });
  }

  if (outputs.length === 1) {
    return { type: 'pdf', bytes: outputs[0].bytes, name: outputs[0].name };
  }

  const zip = new JSZip();
  outputs.forEach((out) => zip.file(`${out.name}.pdf`, out.bytes));
  // PDFs are already compressed internally; storing avoids wasted CPU.
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  return { type: 'zip', bytes, name: `${baseName}_split` };
}

module.exports = { loadPdf, mergePdfs, splitPdf };
