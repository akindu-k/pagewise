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
  statusEl.textContent = message || '';
  statusEl.className = `status${type ? ` ${type}` : ''}`;
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

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Conversion failed.');
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : 'document.pdf';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus('Done! PDF downloaded.', 'success');
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', 'error');
  } finally {
    updateConvertState();
  }
});
