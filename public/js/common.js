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

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
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

// Runs a conversion request with a busy button and status messages.
export async function runConversion({ button, statusEl, request, fallbackName, done = 'Done. Your file has downloaded.' }) {
  setStatus(statusEl, 'Working on it…');
  button.disabled = true;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await request();
    const result = await downloadResponse(response, fallbackName);
    setStatus(statusEl, typeof done === 'function' ? done(response, result) : done, 'success');
  } catch (err) {
    setStatus(statusEl, err.message || 'Something went wrong.', 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
  }
}

// Highlights `zone` while files are dragged over `target` and hands dropped
// files to onFiles. `shouldIgnore` lets in-page drags (reordering) pass.
export function bindFileDrop(target, zone, onFiles, shouldIgnore = () => false) {
  // dragenter/dragleave also fire for child elements; count them so the
  // highlight doesn't flicker while moving across the zone.
  let depth = 0;
  target.addEventListener('dragenter', (e) => {
    if (shouldIgnore()) return;
    e.preventDefault();
    depth += 1;
    zone.classList.add('dragover');
  });
  target.addEventListener('dragover', (e) => {
    if (shouldIgnore()) return;
    e.preventDefault();
  });
  target.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) zone.classList.remove('dragover');
  });
  target.addEventListener('drop', (e) => {
    depth = 0;
    zone.classList.remove('dragover');
    if (shouldIgnore()) return;
    e.preventDefault();
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  });
}

// Lets a click anywhere on the dropzone open the file picker, not just on
// its "Choose file" button.
function bindDropzoneClick(dropzone, input) {
  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('label, input, button')) return;
    input.click();
  });
}

/**
 * ARIA tabs: arrow keys / Home / End move between tabs; selecting one calls
 * onSelect(tab). Tab panels (if any) are linked with aria-controls.
 */
export function bindTabs(tablist, onSelect) {
  const tabs = [...tablist.querySelectorAll('[role=tab]')];

  function select(tab, focus = false) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      const panel = t.getAttribute('aria-controls');
      if (panel) document.getElementById(panel).hidden = !selected;
    });
    if (focus) tab.focus();
    onSelect(tab);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], true);
    });
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
 * Expects inside `root`: .dropzone (containing input[type=file]),
 * .file-list-wrap, .file-list, .file-count, .file-add, .file-clear,
 * .file-announcer.
 *
 * Reordering works three ways (WCAG 2.5.7): drag and drop, the arrow
 * buttons on each item, or Alt+←/→ while an item has focus.
 *
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {number} opts.max          most files allowed
 * @param {(f: File) => boolean} opts.accept
 * @param {string} opts.noun         e.g. "image" → "3 images"
 * @param {(entry, figure, rerender) => void} opts.preview  fills the thumbnail
 * @param {(entry) => string} [opts.caption]      extra line under the name
 * @param {HTMLElement} opts.statusEl
 * @param {(entries) => void} [opts.onChange]
 */
export function createFileList(root, { max, accept, noun, preview, caption, statusEl, onChange = () => {} }) {
  const dropzone = root.querySelector('.dropzone');
  const input = dropzone.querySelector('input[type=file]');
  const listWrap = root.querySelector('.file-list-wrap');
  const list = root.querySelector('.file-list');
  const countEl = root.querySelector('.file-count');
  const addBtn = root.querySelector('.file-add');
  const clearBtn = root.querySelector('.file-clear');
  const announcer = root.querySelector('.file-announcer');

  // Each entry: { file, figure, ...whatever preview() stores on it }
  let entries = [];
  let dragIndex = null;
  // After a re-render, which control to put keyboard focus back on.
  let restoreFocus = null;

  const plural = (n) => `${n} ${noun}${n === 1 ? '' : 's'}`;

  function add(fileList) {
    const all = Array.from(fileList);
    const incoming = all.filter(accept);
    const room = max - entries.length;
    incoming.slice(0, room).forEach((file) => entries.push({ file }));

    if (incoming.length > room) {
      setStatus(statusEl, `You can add up to ${max} files. The extra ones were skipped.`, 'error');
    } else if (incoming.length < all.length) {
      setStatus(statusEl, `${all.length - incoming.length} file(s) skipped: not a supported type.`, 'error');
    } else {
      setStatus(statusEl, '');
    }
    render();
  }

  function remove(index) {
    const [entry] = entries.splice(index, 1);
    if (entry.url) URL.revokeObjectURL(entry.url);
    announcer.textContent = `Removed ${entry.file.name}. ${plural(entries.length)} left.`;
    restoreFocus = entries.length ? { index: Math.min(index, entries.length - 1), selector: '.file-remove' } : null;
    render();
    if (!entries.length) dropzone.querySelector('input').focus();
  }

  function move(from, to, focusSelector) {
    if (to < 0 || to >= entries.length || from === to) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    announcer.textContent = `${entry.file.name} moved to position ${to + 1} of ${entries.length}.`;
    restoreFocus = focusSelector ? { index: to, selector: focusSelector } : null;
    render();
  }

  function clear() {
    entries.forEach((entry) => entry.url && URL.revokeObjectURL(entry.url));
    entries = [];
    setStatus(statusEl, '');
    announcer.textContent = 'All files removed.';
    render();
    dropzone.querySelector('input').focus();
  }

  function iconButton(className, iconName, label, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `icon-btn ${className}`;
    btn.innerHTML = icon(iconName);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.disabled = disabled;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function render() {
    list.replaceChildren(...entries.map((entry, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.draggable = true;
      li.tabIndex = 0;
      li.setAttribute('aria-label', `${entry.file.name}, position ${index + 1} of ${entries.length}. Alt plus arrow keys to move.`);

      // The preview element is created once per entry and reused across
      // renders, so thumbnails aren't regenerated on every reorder.
      if (!entry.figure) {
        entry.figure = document.createElement('div');
        entry.figure.className = 'file-preview';
        preview(entry, entry.figure, render);
      }

      const indexEl = document.createElement('span');
      indexEl.className = 'file-index';
      indexEl.setAttribute('aria-hidden', 'true');
      indexEl.textContent = index + 1;

      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = entry.file.name;

      const controls = document.createElement('div');
      controls.className = 'file-controls';
      controls.append(
        iconButton('file-left', 'left', `Move ${entry.file.name} earlier`, () => move(index, index - 1, '.file-left'), index === 0),
        iconButton('file-right', 'right', `Move ${entry.file.name} later`, () => move(index, index + 1, '.file-right'), index === entries.length - 1),
        iconButton('file-remove', 'x', `Remove ${entry.file.name}`, () => remove(index)),
      );

      li.addEventListener('keydown', (e) => {
        if (e.target !== li) return;
        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
          e.preventDefault();
          move(index, index - 1, null);
          restoreFocus = null;
          list.children[Math.max(index - 1, 0)]?.focus();
        } else if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
          e.preventDefault();
          move(index, index + 1, null);
          list.children[Math.min(index + 1, entries.length - 1)]?.focus();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove(index);
        }
      });

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
        move(dragIndex, index, null);
      });

      li.append(entry.figure, indexEl, name);
      const extra = caption && caption(entry);
      if (extra) {
        const meta = document.createElement('span');
        meta.className = 'file-meta';
        meta.textContent = extra;
        li.append(meta);
      }
      li.append(controls);
      return li;
    }));

    if (restoreFocus) {
      const target = list.children[restoreFocus.index]?.querySelector(restoreFocus.selector);
      // A disabled arrow (moved to an end) can't take focus; use the item.
      (target && !target.disabled ? target : list.children[restoreFocus.index])?.focus();
      restoreFocus = null;
    }

    const has = entries.length > 0;
    listWrap.hidden = !has;
    dropzone.hidden = has;
    countEl.textContent = plural(entries.length);
    onChange(entries);
  }

  input.addEventListener('change', () => {
    add(input.files);
    input.value = '';
  });
  addBtn.addEventListener('click', () => input.click());
  clearBtn.addEventListener('click', clear);
  bindDropzoneClick(dropzone, input);
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
      figure.textContent = err.locked ? 'Password-protected' : 'Unreadable';
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
 * Wires up a one-file dropzone. Expects inside `root`: .dropzone (containing
 * input[type=file]), .single-file, .single-file-name, .single-file-clear.
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
  const input = dropzone.querySelector('input[type=file]');
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
  clearBtn.addEventListener('click', () => {
    set(null);
    input.focus();
  });
  bindDropzoneClick(dropzone, input);
  bindFileDrop(root, dropzone, pick);

  return {
    get file() { return file; },
    setLabel(text) { nameEl.textContent = text; },
  };
}
