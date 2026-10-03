import { TOOLS as CATALOGUE, SITE_NAME, renderGuide } from '/shared/tools.mjs';
import { initMarkdown } from './tools/markdown.js';
import { initImages } from './tools/images.js';
import { initMerge } from './tools/merge.js';
import { initSplit } from './tools/split.js';
import { initCompress } from './tools/compress.js';
import { initWord } from './tools/word.js';
import { initHome } from './tools/home.js';

// Each view owns a <section data-tool-panel="..."> and a URL path. The
// server renders the first page; after that, switching tools happens here
// with the History API.
const INITS = {
  md: initMarkdown,
  jpg: initImages,
  merge: initMerge,
  split: initSplit,
  compress: initCompress,
  word: initWord,
};

const links = document.querySelectorAll('.tool-link');
const brand = document.querySelector('.brand');
const panels = document.querySelectorAll('[data-tool-panel]');
const titleEl = document.getElementById('tool-title');
const descriptionEl = document.getElementById('tool-description');
const guideEl = document.querySelector('.tool-guide');
const metaDescription = document.querySelector('meta[name="description"]');

const apis = {};
Object.entries(INITS).forEach(([key, init]) => {
  apis[key] = init(document.querySelector(`[data-tool-panel="${key}"]`));
});

function keyForPath(pathname) {
  const match = Object.entries(CATALOGUE).find(([, tool]) => tool.path === pathname);
  return match ? match[0] : 'home';
}

function show(key, { focus = false } = {}) {
  const tool = CATALOGUE[key];
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
  guideEl.innerHTML = renderGuide(tool);
  document.title = tool.pageTitle || `${tool.title} · ${SITE_NAME}`;
  metaDescription.setAttribute('content', tool.metaDescription);
  // Move focus to the new heading so screen readers announce the switch.
  if (focus) titleEl.focus();
}

function navigate(key) {
  const { path } = CATALOGUE[key];
  if (location.pathname !== path) history.pushState({}, '', path);
  show(key, { focus: true });
  window.scrollTo(0, 0);
}

// Opens a tool with files picked on the home page.
function openTool(key, files) {
  navigate(key);
  apis[key].receive(files);
}

initHome(document.querySelector('[data-tool-panel="home"]'), CATALOGUE, openTool);

// Handle in-app links without a full page load (plain left clicks only, so
// open-in-new-tab etc. still work).
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const url = new URL(a.href);
  const match = Object.entries(CATALOGUE).find(([, tool]) => tool.path === url.pathname);
  if (!match) return;
  e.preventDefault();
  navigate(match[0]);
});

window.addEventListener('popstate', () => show(keyForPath(location.pathname), { focus: true }));

// Old links used #hashes (e.g. /#merge-pdf); move them to the real path.
const legacy = Object.entries(CATALOGUE).find(([, tool]) => tool.legacyHash && tool.legacyHash === location.hash);
if (legacy) {
  history.replaceState({}, '', legacy[1].path);
  show(legacy[0]);
} else {
  show(keyForPath(location.pathname));
}
