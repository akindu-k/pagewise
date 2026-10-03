import { initMarkdown } from './tools/markdown.js';
import { initImages } from './tools/images.js';
import { initMerge } from './tools/merge.js';
import { initSplit } from './tools/split.js';
import { initCompress } from './tools/compress.js';
import { initWord } from './tools/word.js';
import { initHome } from './tools/home.js';

// Each view owns a <section data-tool-panel="..."> and a #hash route.
// group/icon/summary/accepts feed the home page directory.
const TOOLS = {
  home: {
    hash: '#home',
    title: 'Convert, combine and shrink PDFs',
    pageTitle: 'Pagewise: free PDF tools',
    description: 'Six tools, no sign-up and no watermarks. Files are processed on this server and deleted as soon as your download is ready.',
  },
  md: {
    hash: '#md-to-pdf',
    title: 'Markdown to PDF',
    description: 'Upload a .md file or paste Markdown. You get a clean PDF with headings, tables and highlighted code.',
    group: 'Create PDF',
    icon: 'md',
    summary: 'Markdown files or pasted text, styled like GitHub.',
    accepts: 'Markdown · up to 10 MB',
    init: initMarkdown,
  },
  jpg: {
    hash: '#jpg-to-pdf',
    title: 'JPG to PDF',
    description: 'Combine photos and images into one PDF, in the order you choose.',
    group: 'Create PDF',
    icon: 'image',
    summary: 'Photos and images in the order you choose.',
    accepts: 'JPG, PNG, WebP, GIF, TIFF · up to 30 images',
    init: initImages,
  },
  merge: {
    hash: '#merge-pdf',
    title: 'Merge PDF',
    description: 'Combine several PDFs into one file. Arrange them in the order you want first.',
    group: 'Organize',
    icon: 'merge',
    summary: 'Several PDFs combined into one file.',
    accepts: 'PDF · up to 20 files',
    init: initMerge,
  },
  split: {
    hash: '#split-pdf',
    title: 'Split PDF',
    description: 'Break a PDF into ranges, split it every few pages, or pull out only the pages you need.',
    group: 'Organize',
    icon: 'split',
    summary: 'Ranges, every N pages, or just the pages you pick.',
    accepts: 'PDF · up to 100 MB',
    init: initSplit,
  },
  compress: {
    hash: '#compress-pdf',
    title: 'Compress PDF',
    description: 'Make a PDF smaller for email and uploads. Choose how much image quality to keep.',
    group: 'Optimize',
    icon: 'compress',
    summary: 'Smaller files for email and uploads.',
    accepts: 'PDF · up to 100 MB',
    init: initCompress,
  },
  word: {
    hash: '#pdf-to-word',
    title: 'PDF to Word',
    description: 'Turn a PDF into a .docx you can edit in Word, Google Docs or LibreOffice.',
    group: 'Convert from PDF',
    icon: 'word',
    summary: 'An editable .docx from a text-based PDF.',
    accepts: 'PDF · up to 50 MB',
    init: initWord,
  },
};

const links = document.querySelectorAll('.tool-link');
const panels = document.querySelectorAll('[data-tool-panel]');
const titleEl = document.getElementById('tool-title');
const descriptionEl = document.getElementById('tool-description');

const brand = document.querySelector('.brand');

Object.entries(TOOLS).forEach(([key, tool]) => {
  if (tool.init) tool.api = tool.init(document.querySelector(`[data-tool-panel="${key}"]`));
});

// Opens a tool with files picked on the home page.
function openTool(key, files) {
  location.hash = TOOLS[key].hash;
  TOOLS[key].api.receive(files);
}

initHome(document.querySelector('[data-tool-panel="home"]'), TOOLS, openTool);

function toolFromHash() {
  const match = Object.entries(TOOLS).find(([, tool]) => tool.hash === location.hash);
  return match ? match[0] : 'home';
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
  if (key === 'home') brand.setAttribute('aria-current', 'page');
  else brand.removeAttribute('aria-current');
  panels.forEach((panel) => { panel.hidden = panel.dataset.toolPanel !== key; });
  titleEl.textContent = tool.title;
  descriptionEl.textContent = tool.description;
  document.title = tool.pageTitle || `${tool.title} · Pagewise`;
  // Move focus to the new heading so screen readers announce the switch.
  if (focus) titleEl.focus();
}

window.addEventListener('hashchange', () => show(toolFromHash(), { focus: true }));
show(toolFromHash());
