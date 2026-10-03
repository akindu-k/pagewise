// ---------- Shared helpers ----------

async function downloadPdf(response, fallbackName) {
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
}

function setStatusOn(el, message, type) {
  el.textContent = message || '';
  el.className = `status${type ? ` ${type}` : ''}`;
}

// ---------- Mode switch (Markdown / JPG) ----------

const MODES = {
  md: {
    hash: '#md-to-pdf',
    logo: 'MD',
    tagline: 'Convert Markdown files to polished PDF documents, right in your browser.',
    title: 'Markdown to PDF',
  },
  jpg: {
    hash: '#jpg-to-pdf',
    logo: 'JPG',
    tagline: 'Turn JPG, PNG and other images into a single PDF, in the order you choose.',
    title: 'JPG to PDF',
  },
};

const modeLinks = document.querySelectorAll('.mode');
const converters = {
  md: document.getElementById('md-converter'),
  jpg: document.getElementById('jpg-converter'),
};

function setMode(mode) {
  const config = MODES[mode];
  modeLinks.forEach((link) => link.classList.toggle('active', link.dataset.mode === mode));
  Object.entries(converters).forEach(([key, el]) => { el.hidden = key !== mode; });
  document.getElementById('logo-source').textContent = config.logo;
  document.getElementById('tagline').textContent = config.tagline;
  document.title = `${config.title} \u2014 PDF Converter`;
}

function modeFromHash() {
  return location.hash === MODES.jpg.hash ? 'jpg' : 'md';
}

window.addEventListener('hashchange', () => setMode(modeFromHash()));
setMode(modeFromHash());

// ---------- Markdown to PDF ----------

const tabs = document.querySelectorAll('.tab');
const panels = {
  upload: document.getElementById('panel-upload'),
  paste: document.getElementById('panel-paste'),
};

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileSelected = document.getElementById('file-selected');
const fileNameEl = document.getElementById('file-name');
const fileClearBtn = document.getElementById('file-clear');
const markdownInput = document.getElementById('markdown-input');
const convertBtn = document.getElementById('convert-btn');
const statusEl = document.getElementById('status');

let activeTab = 'upload';
let selectedFile = null;

function setActiveTab(tab) {
  activeTab = tab;
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  panels.upload.classList.toggle('hidden', tab !== 'upload');
  panels.paste.classList.toggle('hidden', tab !== 'paste');
  updateConvertState();
}

tabs.forEach((btn) => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

function setFile(file) {
  selectedFile = file || null;
  if (selectedFile) {
    fileNameEl.textContent = selectedFile.name;
    fileSelected.hidden = false;
    dropzone.hidden = true;
  } else {
    fileSelected.hidden = true;
    dropzone.hidden = false;
    fileInput.value = '';
  }
  updateConvertState();
}

fileInput.addEventListener('change', (e) => setFile(e.target.files[0]));
fileClearBtn.addEventListener('click', () => setFile(null));

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

markdownInput.addEventListener('input', updateConvertState);

function updateConvertState() {
  const hasContent = activeTab === 'upload' ? !!selectedFile : markdownInput.value.trim().length > 0;
  convertBtn.disabled = !hasContent;
}

function setStatus(message, type) {
  setStatusOn(statusEl, message, type);
}

convertBtn.addEventListener('click', async () => {
  setStatus('Converting…');
  convertBtn.disabled = true;

  try {
    let response;
    if (activeTab === 'upload' && selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      response = await fetch('/api/convert', { method: 'POST', body: formData });
    } else {
      response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: markdownInput.value, filename: 'document.md' }),
      });
    }

    await downloadPdf(response, 'document.pdf');

    setStatus('Done! PDF downloaded.', 'success');
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', 'error');
  } finally {
    updateConvertState();
  }
});

// ---------- JPG to PDF ----------

const imgDropzone = document.getElementById('img-dropzone');
const imgInput = document.getElementById('img-input');
const imgListWrap = document.getElementById('img-list-wrap');
const imgList = document.getElementById('img-list');
const imgCount = document.getElementById('img-count');
const imgClearBtn = document.getElementById('img-clear');
const imgConvertBtn = document.getElementById('img-convert-btn');
const imgStatusEl = document.getElementById('img-status');
const optPageSize = document.getElementById('opt-page-size');
const optOrientation = document.getElementById('opt-orientation');
const optMargin = document.getElementById('opt-margin');

const MAX_IMAGES = 30;
// Each entry: { file, url } — url is an object URL used for the thumbnail.
let images = [];
let dragIndex = null;

function addImages(fileList) {
  const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
  const skipped = fileList.length - incoming.length;
  const room = MAX_IMAGES - images.length;
  incoming.slice(0, room).forEach((file) => {
    images.push({ file, url: URL.createObjectURL(file) });
  });

  if (incoming.length > room) {
    setStatusOn(imgStatusEl, `Only ${MAX_IMAGES} images allowed; extra files were skipped.`, 'error');
  } else if (skipped > 0) {
    setStatusOn(imgStatusEl, `${skipped} non-image file(s) skipped.`, 'error');
  } else {
    setStatusOn(imgStatusEl, '');
  }
  renderImages();
}

function removeImage(index) {
  URL.revokeObjectURL(images[index].url);
  images.splice(index, 1);
  renderImages();
}

function moveImage(from, to) {
  if (to < 0 || to >= images.length || from === to) return;
  const [item] = images.splice(from, 1);
  images.splice(to, 0, item);
  renderImages();
}

function renderImages() {
  imgList.replaceChildren(...images.map((entry, index) => {
    const li = document.createElement('li');
    li.className = 'img-item';
    li.draggable = true;
    li.title = entry.file.name;

    const img = document.createElement('img');
    img.src = entry.url;
    img.alt = entry.file.name;

    const indexEl = document.createElement('span');
    indexEl.className = 'img-index';
    indexEl.textContent = index + 1;

    const name = document.createElement('span');
    name.className = 'img-name';
    name.textContent = entry.file.name;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'img-remove';
    remove.setAttribute('aria-label', `Remove ${entry.file.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeImage(index));

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
      moveImage(dragIndex, index);
    });

    li.append(img, indexEl, remove, name);
    return li;
  }));

  const hasImages = images.length > 0;
  imgListWrap.hidden = !hasImages;
  imgDropzone.hidden = hasImages;
  imgCount.textContent = `${images.length} image${images.length === 1 ? '' : 's'}`;
  imgConvertBtn.disabled = !hasImages;
}

imgInput.addEventListener('change', (e) => {
  addImages(e.target.files);
  imgInput.value = '';
});

imgClearBtn.addEventListener('click', () => {
  images.forEach((entry) => URL.revokeObjectURL(entry.url));
  images = [];
  setStatusOn(imgStatusEl, '');
  renderImages();
});

// Accept image drops on the dropzone and, once images exist, on the whole card
// (but not when the drop is an in-list reorder).
const jpgCard = converters.jpg;
['dragenter', 'dragover'].forEach((evt) => {
  jpgCard.addEventListener(evt, (e) => {
    if (dragIndex !== null) return;
    e.preventDefault();
    imgDropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  jpgCard.addEventListener(evt, () => imgDropzone.classList.remove('dragover'));
});
jpgCard.addEventListener('drop', (e) => {
  if (dragIndex !== null) return;
  e.preventDefault();
  if (e.dataTransfer.files.length) addImages(e.dataTransfer.files);
});

// Orientation has no meaning when each page takes the image's own size.
optPageSize.addEventListener('change', () => {
  optOrientation.disabled = optPageSize.value === 'fit';
});

imgConvertBtn.addEventListener('click', async () => {
  setStatusOn(imgStatusEl, 'Converting…');
  imgConvertBtn.disabled = true;

  try {
    const formData = new FormData();
    images.forEach((entry) => formData.append('files', entry.file));
    formData.append('pageSize', optPageSize.value);
    formData.append('orientation', optOrientation.value);
    formData.append('margin', optMargin.value);

    const response = await fetch('/api/images-to-pdf', { method: 'POST', body: formData });
    await downloadPdf(response, 'images.pdf');
    setStatusOn(imgStatusEl, 'Done! PDF downloaded.', 'success');
  } catch (err) {
    setStatusOn(imgStatusEl, err.message || 'Something went wrong.', 'error');
  } finally {
    imgConvertBtn.disabled = images.length === 0;
  }
});
