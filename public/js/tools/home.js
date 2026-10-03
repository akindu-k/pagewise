import { bindDropzoneClick, bindFileDrop, formatBytes, isPdfFile, setStatus } from '../common.js';

const isImage = (f) => f.type.startsWith('image/');
const isMarkdown = (f) => /\.(md|markdown)$/i.test(f.name) || f.type === 'text/markdown';

// What each tool offers for a single PDF, phrased as the user's goal.
const PDF_ACTIONS = {
  compress: 'Make it smaller',
  split: 'Pull out pages or ranges',
  word: 'Edit it as a Word document',
  merge: 'Combine it with other PDFs',
};

// Picks the tools that can take these files, best match first.
function suggest(files) {
  if (files.every(isPdfFile)) {
    if (files.length > 1) return [['merge', `Combine these ${files.length} PDFs into one`]];
    return Object.entries(PDF_ACTIONS);
  }
  if (files.every(isImage)) {
    return [['jpg', files.length > 1 ? `Turn these ${files.length} images into one PDF` : 'Turn it into a PDF']];
  }
  if (files.length === 1 && isMarkdown(files[0])) {
    return [['md', 'Turn it into a styled PDF']];
  }
  return [];
}

function svgIcon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/**
 * @param {HTMLElement} root  the home panel
 * @param {object} tools      tool catalogue (lib/shared/tools.mjs)
 * @param {(key: string, files: File[]) => void} openTool
 */
export function initHome(root, tools, openTool) {
  const dropzone = root.querySelector('.dropzone');
  const input = dropzone.querySelector('input[type=file]');
  const result = root.querySelector('.quick-result');
  const filesEl = root.querySelector('.quick-files');
  const actionsEl = root.querySelector('.quick-actions');
  const resetBtn = root.querySelector('.quick-reset');
  const statusEl = root.querySelector('.status');

  function reset() {
    result.hidden = true;
    dropzone.hidden = false;
    actionsEl.replaceChildren();
    setStatus(statusEl, '');
    input.value = '';
  }

  function handle(fileList) {
    const files = Array.from(fileList);
    const suggestions = suggest(files);
    if (!suggestions.length) {
      setStatus(statusEl, files.length > 1
        ? 'Those files need different tools. Drop PDFs, images or a Markdown file on their own.'
        : `There's no tool for "${files[0].name}" yet. Drop a PDF, an image or a Markdown file.`, 'error');
      return;
    }

    setStatus(statusEl, '');
    filesEl.textContent = files.length === 1
      ? `${files[0].name} · ${formatBytes(files[0].size)}`
      : `${files.length} files · ${formatBytes(files.reduce((n, f) => n + f.size, 0))}`;

    actionsEl.replaceChildren(...suggestions.map(([key, label]) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-action';
      btn.innerHTML = `${svgIcon(tools[key].icon)}<span class="quick-action-text"><span class="quick-action-label"></span><span class="quick-action-tool"></span></span><svg class="icon chevron" aria-hidden="true"><use href="#i-right"/></svg>`;
      btn.querySelector('.quick-action-label').textContent = label;
      btn.querySelector('.quick-action-tool').textContent = tools[key].title;
      btn.addEventListener('click', () => {
        reset();
        openTool(key, files);
      });
      li.append(btn);
      return li;
    }));

    dropzone.hidden = true;
    result.hidden = false;
    actionsEl.querySelector('button').focus();
  }

  input.addEventListener('change', () => input.files.length && handle(input.files));
  resetBtn.addEventListener('click', () => {
    reset();
    input.focus();
  });
  bindDropzoneClick(dropzone, input);
  bindFileDrop(root, dropzone, handle);
}
