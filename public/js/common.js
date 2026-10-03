// Shared helpers for every tool panel.

export function setStatus(el, message, type) {
  el.textContent = message || '';
  el.className = `status${type ? ` ${type}` : ''}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Reads a JSON { error } from a failed response, or saves a successful one
// as a download using the server's Content-Disposition filename.
export async function downloadResponse(response, fallbackName) {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Conversion failed.');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="(.+?)"/);
  const filename = match ? match[1] : fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { blob, filename };
}

// Runs a conversion request with a disabled button and status messages.
export async function runConversion({ button, statusEl, request, fallbackName, done = 'Done! File downloaded.' }) {
  setStatus(statusEl, 'Working…');
  button.disabled = true;
  try {
    const response = await request();
    const result = await downloadResponse(response, fallbackName);
    setStatus(statusEl, typeof done === 'function' ? done(response, result) : done, 'success');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong.', 'error');
  } finally {
    button.disabled = false;
  }
}

// Highlights `zone` while files are dragged over `target` and hands dropped
// files to onFiles. `shouldIgnore` lets in-page drags (reordering) pass.
export function bindFileDrop(target, zone, onFiles, shouldIgnore = () => false) {
  ['dragenter', 'dragover'].forEach((evt) => {
    target.addEventListener(evt, (e) => {
      if (shouldIgnore()) return;
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    target.addEventListener(evt, () => zone.classList.remove('dragover'));
  });
  target.addEventListener('drop', (e) => {
    if (shouldIgnore()) return;
    e.preventDefault();
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  });
}

// ---------- PDF previews (pdf.js, loaded on first use) ----------

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('/vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Opens a File with pdf.js. Throws { locked: true } for encrypted PDFs.
export async function openPdf(file) {
  const pdfjs = await loadPdfjs();
  try {
    return await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch (err) {
    if (err.name === 'PasswordException') err.locked = true;
    throw err;
  }
}

// Frees the worker-side copy of a document opened with openPdf.
export function closePdf(doc) {
  doc.loadingTask.destroy();
}

// Renders one page to a PNG data URL about `width` CSS pixels wide.
export async function renderPdfPage(doc, pageNumber, width = 160) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width * 2) / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/png');
}

// ---------- Sortable file list ----------

/**
 * Wires up a panel's dropzone + reorderable thumbnail grid.
 *
 * Expects inside `root`: .dropzone, input[type=file], .file-list-wrap,
 * .file-list, .file-count, .file-clear.
 *
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {number} opts.max          most files allowed
 * @param {(f: File) => boolean} opts.accept
 * @param {string} opts.noun         e.g. "image" → "3 images"
 * @param {(entry, figure) => void} opts.preview  fills the thumbnail area
 * @param {(entry) => string} [opts.caption]      extra line under the name
 * @param {HTMLElement} opts.statusEl
 * @param {() => void} [opts.onChange]
 */
export function createFileList(root, { max, accept, noun, preview, caption, statusEl, onChange = () => {} }) {
  const dropzone = root.querySelector('.dropzone');
  const input = root.querySelector('input[type=file]');
  const listWrap = root.querySelector('.file-list-wrap');
  const list = root.querySelector('.file-list');
  const countEl = root.querySelector('.file-count');
  const clearBtn = root.querySelector('.file-clear');

  // Each entry: { file, ...whatever preview() stores on it }
  let entries = [];
  let dragIndex = null;

  function add(fileList) {
    const all = Array.from(fileList);
    const incoming = all.filter(accept);
    const room = max - entries.length;
    incoming.slice(0, room).forEach((file) => entries.push({ file }));

    if (incoming.length > room) {
      setStatus(statusEl, `Only ${max} files allowed; extra files were skipped.`, 'error');
    } else if (incoming.length < all.length) {
      setStatus(statusEl, `${all.length - incoming.length} unsupported file(s) skipped.`, 'error');
    } else {
      setStatus(statusEl, '');
    }
    render();
  }

  function remove(index) {
    const [entry] = entries.splice(index, 1);
    if (entry.url) URL.revokeObjectURL(entry.url);
    render();
  }

  function move(from, to) {
    if (to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    render();
  }

  function clear() {
    entries.forEach((entry) => entry.url && URL.revokeObjectURL(entry.url));
    entries = [];
    setStatus(statusEl, '');
    render();
  }

  function render() {
    list.replaceChildren(...entries.map((entry, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.draggable = true;
      li.title = entry.file.name;

      // The preview element is created once per entry and reused across
      // renders, so thumbnails aren't regenerated on every reorder.
      if (!entry.figure) {
        entry.figure = document.createElement('div');
        entry.figure.className = 'file-preview';
        preview(entry, entry.figure, render);
      }

      const indexEl = document.createElement('span');
      indexEl.className = 'file-index';
      indexEl.textContent = index + 1;

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = entry.file.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'file-remove';
      removeBtn.setAttribute('aria-label', `Remove ${entry.file.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => remove(index));

      li.addEventListener('dragstart', (e) => {
        dragIndex = index;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragend', () => {
        dragIndex = null;
        li.classList.remove('dragging');
      });
      li.addEventListener('dragover', (e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        li.classList.add('drop-target');
      });
      li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
      li.addEventListener('drop', (e) => {
        if (dragIndex === null) return;
        e.preventDefault();
        e.stopPropagation();
        move(dragIndex, index);
      });

      li.append(entry.figure, indexEl, removeBtn, name);
      const extra = caption && caption(entry);
      if (extra) {
        const meta = document.createElement('span');
        meta.className = 'file-meta';
        meta.textContent = extra;
        li.append(meta);
      }
      return li;
    }));

    const has = entries.length > 0;
    listWrap.hidden = !has;
    dropzone.hidden = has;
    countEl.textContent = `${entries.length} ${noun}${entries.length === 1 ? '' : 's'}`;
    onChange(entries);
  }

  input.addEventListener('change', () => {
    add(input.files);
    input.value = '';
  });
  clearBtn.addEventListener('click', clear);
  bindFileDrop(root, dropzone, add, () => dragIndex !== null);

  render();
  return {
    get entries() { return entries; },
    refresh: render,
  };
}

// Preview for PDF entries: first-page thumbnail plus page count on entry.pages.
export function pdfPreview(entry, figure, rerender) {
  figure.classList.add('loading');
  openPdf(entry.file)
    .then(async (doc) => {
      entry.pages = doc.numPages;
      try {
        const img = document.createElement('img');
        img.alt = '';
        img.src = await renderPdfPage(doc, 1);
        figure.replaceChildren(img);
      } catch {
        // The PDF opened fine; only the preview failed. Don't block the file.
        figure.textContent = 'No preview';
      } finally {
        closePdf(doc);
      }
    }, (err) => {
      entry.locked = !!err.locked;
      entry.invalid = !err.locked;
      figure.textContent = err.locked ? 'Locked' : 'Unreadable';
      figure.classList.add('preview-error');
    })
    .finally(() => {
      figure.classList.remove('loading');
      rerender();
    });
}

// ---------- Single file picker ----------

export const isPdfFile = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

/**
 * Wires up a one-file dropzone. Expects inside `root`: .dropzone,
 * input[type=file], .single-file, .single-file-name, .single-file-clear.
 *
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {(f: File) => boolean} opts.accept
 * @param {string} opts.rejectMessage  shown when a dropped file isn't accepted
 * @param {HTMLElement} opts.statusEl
 * @param {(file: File|null) => void} opts.onChange
 */
export function createSingleFilePicker(root, { accept, rejectMessage, statusEl, onChange }) {
  const dropzone = root.querySelector('.dropzone');
  const input = root.querySelector('input[type=file]');
  const bar = root.querySelector('.single-file');
  const nameEl = root.querySelector('.single-file-name');
  const clearBtn = root.querySelector('.single-file-clear');
  let file = null;

  function set(next) {
    file = next;
    dropzone.hidden = !!file;
    bar.hidden = !file;
    nameEl.textContent = file ? file.name : '';
    if (!file) input.value = '';
    setStatus(statusEl, '');
    onChange(file);
  }

  function pick(files) {
    const match = Array.from(files).find(accept);
    if (match) set(match);
    else setStatus(statusEl, rejectMessage, 'error');
  }

  input.addEventListener('change', () => input.files.length && pick(input.files));
  clearBtn.addEventListener('click', () => set(null));
  bindFileDrop(root, dropzone, pick);

  return {
    get file() { return file; },
    setLabel(text) { nameEl.textContent = text; },
  };
}
