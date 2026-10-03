import { createSingleFilePicker, formatBytes, isPdfFile, runConversion } from '../common.js';

export function initCompress(root) {
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');
  const levelInputs = root.querySelectorAll('input[name=compress-level]');
  const options = root.querySelector('.level-options');

  const picker = createSingleFilePicker(root, {
    accept: isPdfFile,
    rejectMessage: 'Choose a PDF file.',
    statusEl,
    onChange(file) {
      convertBtn.disabled = !file;
      options.hidden = !file;
      if (file) picker.setLabel(`${file.name} · ${formatBytes(file.size)}`);
    },
  });

  convertBtn.addEventListener('click', async () => {
    const level = [...levelInputs].find((input) => input.checked).value;
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'compressed.pdf',
      done(response) {
        const before = Number(response.headers.get('X-Original-Size'));
        const after = Number(response.headers.get('X-Compressed-Size'));
        if (!before || after >= before) {
          return 'This PDF is already well optimized — downloaded unchanged.';
        }
        const saved = Math.round((1 - after / before) * 100);
        return `Done! ${formatBytes(before)} → ${formatBytes(after)} (${saved}% smaller).`;
      },
      request() {
        const formData = new FormData();
        formData.append('file', picker.file);
        formData.append('level', level);
        return fetch('/api/compress', { method: 'POST', body: formData });
      },
    });
  });
}
