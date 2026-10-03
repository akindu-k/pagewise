import { initMarkdown } from './tools/markdown.js';
import { initImages } from './tools/images.js';
import { initMerge } from './tools/merge.js';
import { initSplit } from './tools/split.js';
import { initCompress } from './tools/compress.js';
import { initWord } from './tools/word.js';

// Each tool owns a <section data-tool-panel="..."> and a #hash route.
const TOOLS = {
  md: {
    hash: '#md-to-pdf',
    title: 'Markdown to PDF',
    description: 'Upload a .md file or paste Markdown. You get a clean PDF with headings, tables and highlighted code.',
    init: initMarkdown,
  },
  jpg: {
    hash: '#jpg-to-pdf',
    title: 'JPG to PDF',
    description: 'Combine photos and images into one PDF, in the order you choose.',
    init: initImages,
  },
  merge: {
    hash: '#merge-pdf',
    title: 'Merge PDF',
    description: 'Combine several PDFs into one file. Arrange them in the order you want first.',
    init: initMerge,
  },
  split: {
    hash: '#split-pdf',
    title: 'Split PDF',
    description: 'Break a PDF into ranges, split it every few pages, or pull out only the pages you need.',
    init: initSplit,
  },
  compress: {
    hash: '#compress-pdf',
    title: 'Compress PDF',
    description: 'Make a PDF smaller for email and uploads. Choose how much image quality to keep.',
    init: initCompress,
  },
  word: {
    hash: '#pdf-to-word',
    title: 'PDF to Word',
    description: 'Turn a PDF into a .docx you can edit in Word, Google Docs or LibreOffice.',
    init: initWord,
  },
};

const links = document.querySelectorAll('.tool-link');
const panels = document.querySelectorAll('[data-tool-panel]');
const titleEl = document.getElementById('tool-title');
const descriptionEl = document.getElementById('tool-description');

Object.entries(TOOLS).forEach(([key, tool]) => {
  tool.init(document.querySelector(`[data-tool-panel="${key}"]`));
});

function toolFromHash() {
  const match = Object.entries(TOOLS).find(([, tool]) => tool.hash === location.hash);
  return match ? match[0] : 'md';
}

function show(key, { focus = false } = {}) {
  const tool = TOOLS[key];
  links.forEach((link) => {
    if (link.dataset.tool === key) {
      link.setAttribute('aria-current', 'page');
      // Keep the active tool visible in the scrolling mobile tool bar.
      link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else {
      link.removeAttribute('aria-current');
    }
  });
  panels.forEach((panel) => { panel.hidden = panel.dataset.toolPanel !== key; });
  titleEl.textContent = tool.title;
  descriptionEl.textContent = tool.description;
  document.title = `${tool.title} · PDF Converter`;
  // Move focus to the new heading so screen readers announce the switch.
  if (focus) titleEl.focus();
}

window.addEventListener('hashchange', () => show(toolFromHash(), { focus: true }));
show(toolFromHash());
