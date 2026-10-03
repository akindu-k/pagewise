import { createFileList, runConversion } from '../common.js';

export function initImages(root) {
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');
  const optPageSize = root.querySelector('#opt-page-size');
  const optOrientation = root.querySelector('#opt-orientation');
  const optMargin = root.querySelector('#opt-margin');

  const list = createFileList(root, {
    max: 30,
    noun: 'image',
    accept: (f) => f.type.startsWith('image/'),
    statusEl,
    preview(entry, figure) {
      entry.url = URL.createObjectURL(entry.file);
      const img = document.createElement('img');
      img.src = entry.url;
      img.alt = '';
      figure.append(img);
    },
    onChange(entries) {
      convertBtn.disabled = entries.length === 0;
    },
  });

  // Orientation has no meaning when each page takes the image's own size.
  optPageSize.addEventListener('change', () => {
    optOrientation.disabled = optPageSize.value === 'fit';
  });

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'images.pdf',
      done: 'Done. Your PDF has downloaded.',
      request() {
        const formData = new FormData();
        list.entries.forEach((entry) => formData.append('files', entry.file));
        formData.append('pageSize', optPageSize.value);
        formData.append('orientation', optOrientation.value);
        formData.append('margin', optMargin.value);
        return fetch('/api/images-to-pdf', { method: 'POST', body: formData });
      },
    });
    list.refresh();
  });
}
