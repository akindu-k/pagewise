import { createFileList, formatBytes, isPdfFile, pdfPreview, runConversion, setStatus } from '../common.js';

export function initMerge(root) {
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');
  const summaryEl = root.querySelector('.merge-summary');
  // Whether the status line currently shows one of this tool's hints, so it
  // can be cleared once resolved without wiping other messages.
  let showingHint = false;

  const list = createFileList(root, {
    max: 20,
    noun: 'PDF',
    accept: isPdfFile,
    statusEl,
    preview: pdfPreview,
    caption: (entry) => {
      const pages = entry.pages ? `${entry.pages} page${entry.pages === 1 ? '' : 's'} · ` : '';
      return `${pages}${formatBytes(entry.file.size)}`;
    },
    onChange(entries) {
      const blocked = entries.filter((e) => e.locked || e.invalid);
      const total = entries.reduce((sum, e) => sum + (e.pages || 0), 0);
      summaryEl.textContent = entries.length > 1 && total ? `${total} pages total` : '';
      convertBtn.disabled = entries.length < 2 || blocked.length > 0;
      if (blocked.length) {
        setStatus(statusEl, `Remove ${blocked.map((e) => `"${e.file.name}"`).join(', ')} to continue: ${blocked.length === 1 ? "it's" : "they're"} password-protected or unreadable.`, 'error');
        showingHint = true;
      } else if (entries.length === 1) {
        setStatus(statusEl, 'Add at least one more PDF to merge.');
        showingHint = true;
      } else if (showingHint) {
        setStatus(statusEl, '');
        showingHint = false;
      }
    },
  });

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'merged.pdf',
      done: 'Done. Your merged PDF has downloaded.',
      request() {
        const formData = new FormData();
        list.entries.forEach((entry) => formData.append('files', entry.file));
        return fetch('/api/merge', { method: 'POST', body: formData });
      },
    });
    list.refresh();
  });
}
