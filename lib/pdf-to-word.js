const fs = require('fs/promises');
const { existsSync } = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { UserError } = require('./errors');
const { loadPdf } = require('./pdf-tools');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'pdf_to_docx.py');
const TIMEOUT_MS = 5 * 60 * 1000;

// Python with pdf2docx installed: $PDF2DOCX_PYTHON, else the project's
// .venv (what `npm run setup:python` creates), else python3 on PATH.
function pythonBinary() {
  if (process.env.PDF2DOCX_PYTHON) return process.env.PDF2DOCX_PYTHON;
  const venv = path.join(__dirname, '..', '.venv', 'bin', 'python');
  return existsSync(venv) ? venv : 'python3';
}

function runConverter(input, output) {
  return new Promise((resolve, reject) => {
    execFile(pythonBinary(), [SCRIPT, input, output], { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.output = `${stdout}\n${stderr}`;
        return reject(err);
      }
      resolve();
    });
  });
}

/**
 * Converts a PDF to an editable Word document.
 *
 * @param {{ buffer: Buffer, name: string }} file
 * @returns {Promise<Buffer>} .docx bytes
 */
async function pdfToWord(file) {
  // Gives the usual messages for password-protected or invalid uploads.
  await loadPdf(file.buffer, file.name);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf2docx-'));
  const input = path.join(dir, 'in.pdf');
  const output = path.join(dir, 'out.docx');

  try {
    await fs.writeFile(input, file.buffer);
    try {
      await runConverter(input, output);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error('Python is not installed on the server.');
      }
      if (/No module named/.test(err.output)) {
        throw new Error('pdf2docx is not installed on the server. Run `npm run setup:python`.');
      }
      if (err.killed) {
        throw new UserError(`"${file.name}" took too long to convert. Try splitting it into smaller parts.`);
      }
      console.error('pdf2docx failed:', err.output);
      throw new UserError(`"${file.name}" could not be converted to Word.`);
    }
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

module.exports = { pdfToWord };
