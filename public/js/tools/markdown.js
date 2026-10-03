import { bindFileDrop, runConversion } from '../common.js';

export function initMarkdown(root) {
  const tabs = root.querySelectorAll('.tab');
  const panels = {
    upload: root.querySelector('#panel-upload'),
    paste: root.querySelector('#panel-paste'),
  };
  const dropzone = root.querySelector('#dropzone');
  const fileInput = root.querySelector('#file-input');
  const fileSelected = root.querySelector('#file-selected');
  const fileNameEl = root.querySelector('#file-name');
  const fileClearBtn = root.querySelector('#file-clear');
  const markdownInput = root.querySelector('#markdown-input');
  const convertBtn = root.querySelector('#convert-btn');
  const statusEl = root.querySelector('#status');

  let activeTab = 'upload';
  let selectedFile = null;

  function updateConvertState() {
    const hasContent = activeTab === 'upload' ? !!selectedFile : markdownInput.value.trim().length > 0;
    convertBtn.disabled = !hasContent;
  }

  function setActiveTab(tab) {
    activeTab = tab;
    tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    panels.upload.classList.toggle('hidden', tab !== 'upload');
    panels.paste.classList.toggle('hidden', tab !== 'paste');
    updateConvertState();
  }

  function setFile(file) {
    selectedFile = file || null;
    fileSelected.hidden = !selectedFile;
    dropzone.hidden = !!selectedFile;
    if (selectedFile) fileNameEl.textContent = selectedFile.name;
    else fileInput.value = '';
    updateConvertState();
  }

  tabs.forEach((btn) => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));
  fileInput.addEventListener('change', (e) => setFile(e.target.files[0]));
  fileClearBtn.addEventListener('click', () => setFile(null));
  bindFileDrop(dropzone, dropzone, (files) => setFile(files[0]));
  markdownInput.addEventListener('input', updateConvertState);

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'document.pdf',
      done: 'Done! PDF downloaded.',
      request() {
        if (activeTab === 'upload' && selectedFile) {
          const formData = new FormData();
          formData.append('file', selectedFile);
          return fetch('/api/convert', { method: 'POST', body: formData });
        }
        return fetch('/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: markdownInput.value, filename: 'document.md' }),
        });
      },
    });
    updateConvertState();
  });
}
