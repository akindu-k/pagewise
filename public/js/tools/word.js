import { createSingleFilePicker, formatBytes, isPdfFile, runConversion } from '../common.js';

export function initWord(root) {
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');

  const picker = createSingleFilePicker(root, {
    accept: isPdfFile,
    rejectMessage: 'Choose a PDF file.',
    statusEl,
    onChange(file) {
      convertBtn.disabled = !file;
      if (file) picker.setLabel(`${file.name} · ${formatBytes(file.size)}`);
    },
  });

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'document.docx',
      done: (response, { filename }) => `Done. ${filename} has downloaded.`,
      request() {
        const formData = new FormData();
        formData.append('file', picker.file);
        return fetch('/api/pdf-to-word', { method: 'POST', body: formData });
      },
    });
  });

  // Files handed over from the home page.
  return { receive: (files) => picker.pick(files) };
}
