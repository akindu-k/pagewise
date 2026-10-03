import { bindTabs, createSingleFilePicker, formatBytes, runConversion } from '../common.js';

const isMarkdown = (f) => /\.(md|markdown|txt)$/i.test(f.name) || f.type === 'text/markdown';

export function initMarkdown(root) {
  const markdownInput = root.querySelector('#markdown-input');
  const convertBtn = root.querySelector('.convert-btn');
  const statusEl = root.querySelector('.status');

  let source = 'upload';

  function updateConvertState() {
    convertBtn.disabled = source === 'upload' ? !picker.file : !markdownInput.value.trim();
  }

  const picker = createSingleFilePicker(root.querySelector('#md-panel-upload'), {
    accept: isMarkdown,
    rejectMessage: 'Choose a Markdown file (.md or .markdown).',
    statusEl,
    onChange(file) {
      if (file) picker.setLabel(`${file.name} · ${formatBytes(file.size)}`);
      updateConvertState();
    },
  });

  bindTabs(root.querySelector('[role=tablist]'), (tab) => {
    source = tab.dataset.tab;
    updateConvertState();
  });
  markdownInput.addEventListener('input', updateConvertState);

  convertBtn.addEventListener('click', async () => {
    await runConversion({
      button: convertBtn,
      statusEl,
      fallbackName: 'document.pdf',
      done: 'Done. Your PDF has downloaded.',
      request() {
        if (source === 'upload') {
          const formData = new FormData();
          formData.append('file', picker.file);
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
