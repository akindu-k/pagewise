import { bindFileDrop, closePdf, openPdf, renderPdfPage, runConversion, setStatus } from '../common.js';
import { planSplit } from '/shared/page-ranges.mjs';

const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

// Compresses sorted page numbers into "1-3, 5, 7-8".
function toRangeText(pages) {
  const parts = [];
  for (let i = 0; i < pages.length; i++) {
    const start = pages[i];
    while (pages[i + 1] === pages[i] + 1) i++;
    parts.push(start === pages[i] ? `${start}` : `${start}-${pages[i]}`);
  }
  return parts.join(', ');
}

export function initSplit(root) {
  const dropzone = root.querySelector('.dropzone');
  const input = root.querySelector('input[type=file]');
  const fileBar = root.querySelector('.split-file');
  const fileName = root.querySelector('.split-file-name');
  const clearBtn = root.querySelector('.split-clear');
  const body = root.querySelector('.split-body');
  const modeTabs = root.querySelectorAll('.split-modes .tab');
  const optionPanels = root.querySelectorAll('.split-option');
  const rangesInput = root.querySelector('#split-ranges');
  const rangesMerge = root.querySelector('#split-ranges-merge');
  const everyInput = root.querySelector('#split-every');
  const allCheckbox = root.querySelector('#split-all');
  const pagesInput = root.querySelector('#split-pages');
  const extractMerge = root.querySelector('#split-extract-merge');
  const summaryEl = root.querySelector('.split-summary');
  const grid = root.querySelector('.page-grid');
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');

  let file = null;
  let doc = null;
  let pageCount = 0;
  let mode = 'ranges';
  let observer = null;
  // Bumped on every new file so stale async work can tell it's outdated.
  let loadId = 0;

  function options() {
    if (mode === 'fixed') return { mode, every: everyInput.value };
    if (mode === 'extract') {
      return { mode, pages: allCheckbox.checked ? 'all' : pagesInput.value, merge: extractMerge.checked };
    }
    return { mode, ranges: rangesInput.value, merge: rangesMerge.checked };
  }

  // Recomputes the plan and paints which output file each page lands in.
  function update() {
    if (!pageCount) return;
    let plan = null;
    try {
      plan = planSplit(options(), pageCount);
      const n = plan.length;
      summaryEl.textContent = n === 1
        ? `Creates 1 PDF with ${plan[0].pages.length} page${plan[0].pages.length === 1 ? '' : 's'}.`
        : `Creates ${n} PDFs, downloaded as a .zip.`;
      summaryEl.classList.remove('error');
    } catch (err) {
      summaryEl.textContent = err.message;
      summaryEl.classList.add('error');
    }
    convertBtn.disabled = !plan;

    const groupOf = new Map();
    (plan || []).forEach((part, index) => {
      part.pages.forEach((page) => { if (!groupOf.has(page)) groupOf.set(page, index); });
    });
    grid.querySelectorAll('.page-thumb').forEach((li) => {
      const page = Number(li.dataset.page);
      const group = groupOf.get(page);
      const included = group !== undefined;
      li.classList.toggle('excluded', !included);
      li.classList.toggle('selectable', mode === 'extract');
      li.style.setProperty('--group-hue', included ? (group * 47 + 230) % 360 : 0);
      li.querySelector('.page-group').textContent = included && plan.length > 1 ? `File ${group + 1}` : '';
    });
  }

  function setMode(next) {
    mode = next;
    modeTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
    optionPanels.forEach((panel) => { panel.hidden = panel.dataset.for !== mode; });
    update();
  }

  function togglePage(page) {
    if (mode !== 'extract') return;
    let selected;
    if (allCheckbox.checked) {
      // Clicking a page while "every page" is on starts a fresh selection.
      allCheckbox.checked = false;
      pagesInput.disabled = false;
      selected = new Set([page]);
    } else {
      try {
        selected = new Set(planSplit({ mode: 'extract', pages: pagesInput.value }, pageCount).map((p) => p.pages[0]));
      } catch {
        selected = new Set();
      }
      if (selected.has(page)) selected.delete(page);
      else selected.add(page);
    }
    pagesInput.value = toRangeText([...selected].sort((a, b) => a - b));
    update();
  }

  function buildGrid(currentLoad) {
    observer?.disconnect();
    // Render thumbnails lazily as they scroll into view; big PDFs stay fast.
    observer = new IntersectionObserver((items) => {
      items.forEach(async ({ isIntersecting, target }) => {
        if (!isIntersecting || target.dataset.rendered) return;
        target.dataset.rendered = '1';
        observer.unobserve(target);
        try {
          const src = await renderPdfPage(doc, Number(target.dataset.page), 100);
          if (currentLoad !== loadId) return;
          const img = document.createElement('img');
          img.alt = `Page ${target.dataset.page}`;
          img.src = src;
          target.querySelector('.page-preview').replaceChildren(img);
        } catch {
          // Leave the numbered placeholder.
        }
      });
    }, { root: null, rootMargin: '200px' });

    grid.replaceChildren(...Array.from({ length: pageCount }, (_, i) => {
      const li = document.createElement('li');
      li.className = 'page-thumb';
      li.dataset.page = i + 1;
      li.innerHTML = '<div class="page-preview"></div><span class="page-number"></span><span class="page-group"></span>';
      li.querySelector('.page-number').textContent = i + 1;
      li.addEventListener('click', () => togglePage(i + 1));
      observer.observe(li);
      return li;
    }));
  }

  async function setFile(next) {
    loadId += 1;
    const currentLoad = loadId;
    if (doc) closePdf(doc);
    doc = null;
    file = next;
    pageCount = 0;
    grid.replaceChildren();
    setStatus(statusEl, '');
    convertBtn.disabled = true;

    dropzone.hidden = !!file;
    fileBar.hidden = !file;
    body.hidden = true;
    if (!file) {
      input.value = '';
      return;
    }

    fileName.textContent = file.name;
    setStatus(statusEl, 'Reading PDF…');
    try {
      const opened = await openPdf(file);
      if (currentLoad !== loadId) return closePdf(opened);
      doc = opened;
      pageCount = doc.numPages;
    } catch (err) {
      if (currentLoad !== loadId) return;
      setStatus(statusEl, err.locked
        ? `"${file.name}" is password-protected. Unlock it first, then try again.`
        : `"${file.name}" is not a valid PDF.`, 'error');
      return;
    }

    fileName.textContent = `${file.name} · ${pageCount} page${pageCount === 1 ? '' : 's'}`;
    setStatus(statusEl, '');
    if (!rangesInput.value) rangesInput.value = pageCount > 1 ? `1-${Math.ceil(pageCount / 2)}, ${Math.ceil(pageCount / 2) + 1}-${pageCount}` : '1';
    body.hidden = false;
    buildGrid(currentLoad);
    update();
  }

  input.addEventListener('change', () => input.files[0] && setFile(input.files[0]));
  bindFileDrop(root, dropzone, (files) => {
    const pdf = Array.from(files).find(isPdf);
    if (pdf) setFile(pdf);
    else setStatus(statusEl, 'Drop a PDF file.', 'error');
  });
  clearBtn.addEventListener('click', () => {
    rangesInput.value = '';
    setFile(null);
  });

  modeTabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  [rangesInput, everyInput, pagesInput].forEach((el) => el.addEventListener('input', update));
  [rangesMerge, extractMerge].forEach((el) => el.addEventListener('change', update));
  allCheckbox.addEventListener('change', () => {
    pagesInput.disabled = allCheckbox.checked;
    update();
  });

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'split.zip',
      done: (response, { filename }) => `Done! ${filename} downloaded.`,
      request() {
        const formData = new FormData();
        formData.append('file', file);
        Object.entries(options()).forEach(([key, value]) => formData.append(key, value));
        return fetch('/api/split', { method: 'POST', body: formData });
      },
    });
    update();
  });
}
