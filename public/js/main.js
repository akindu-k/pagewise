import { initMarkdown } from './tools/markdown.js';
import { initImages } from './tools/images.js';
import { initMerge } from './tools/merge.js';
import { initSplit } from './tools/split.js';
import { initCompress } from './tools/compress.js';
import { initWord } from './tools/word.js';

// Each tool owns a <main data-tool="..."> panel and a #hash route.
const TOOLS = {
  md: {
    hash: '#md-to-pdf',
    logo: ['MD', 'PDF'],
    title: 'Markdown to PDF',
    tagline: 'Convert Markdown files to polished PDF documents, right in your browser.',
    init: initMarkdown,
  },
  jpg: {
    hash: '#jpg-to-pdf',
    logo: ['JPG', 'PDF'],
    title: 'JPG to PDF',
    tagline: 'Turn JPG, PNG and other images into a single PDF, in the order you choose.',
    init: initImages,
  },
  merge: {
    hash: '#merge-pdf',
    logo: ['PDFs', 'PDF'],
    title: 'Merge PDF',
    tagline: 'Combine several PDFs into one, in the order you choose.',
    init: initMerge,
  },
  split: {
    hash: '#split-pdf',
    logo: ['PDF', 'PDFs'],
    title: 'Split PDF',
    tagline: 'Split a PDF into ranges, every N pages, or pull out just the pages you need.',
    init: initSplit,
  },
  compress: {
    hash: '#compress-pdf',
    logo: ['PDF', 'Smaller PDF'],
    title: 'Compress PDF',
    tagline: 'Shrink PDF file size while keeping the quality you need.',
    init: initCompress,
  },
  word: {
    hash: '#pdf-to-word',
    logo: ['PDF', 'DOCX'],
    title: 'PDF to Word',
    tagline: 'Turn a PDF into an editable Word document.',
    init: initWord,
  },
};

const links = document.querySelectorAll('.tool-link');
const panels = document.querySelectorAll('[data-tool-panel]');
const logoSource = document.getElementById('logo-source');
const logoTarget = document.getElementById('logo-target');
const tagline = document.getElementById('tagline');

Object.entries(TOOLS).forEach(([key, tool]) => {
  tool.init(document.querySelector(`[data-tool-panel="${key}"]`));
});

function toolFromHash() {
  const match = Object.entries(TOOLS).find(([, tool]) => tool.hash === location.hash);
  return match ? match[0] : 'md';
}

function show(key) {
  const tool = TOOLS[key];
  links.forEach((link) => link.classList.toggle('active', link.dataset.tool === key));
  panels.forEach((panel) => { panel.hidden = panel.dataset.toolPanel !== key; });
  [logoSource.textContent, logoTarget.textContent] = tool.logo;
  tagline.textContent = tool.tagline;
  document.title = `${tool.title} — PDF Converter`;
}

window.addEventListener('hashchange', () => show(toolFromHash()));
show(toolFromHash());
