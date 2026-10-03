const { PDFDocument } = require('pdf-lib');
const { UserError } = require('./errors');

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

module.exports = { loadPdf, mergePdfs };
