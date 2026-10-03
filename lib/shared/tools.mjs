// Tool catalogue: URLs, page copy and SEO metadata. Shared by the server
// (to render each page's HTML) and the browser (when switching tools), so
// both always agree.

export const SITE_NAME = 'Pagewise';

export const TOOLS = {
  home: {
    path: '/',
    title: 'Convert, combine and shrink PDFs',
    pageTitle: 'Pagewise: free online PDF tools',
    metaDescription: 'Merge, split and compress PDFs, convert JPG and Markdown to PDF, and turn PDFs into Word documents. Free, no sign-up, no watermarks.',
    description: 'Six tools, no sign-up and no watermarks. Files are processed on this server and deleted as soon as your download is ready.',
  },
  md: {
    path: '/markdown-to-pdf',
    legacyHash: '#md-to-pdf',
    title: 'Markdown to PDF',
    pageTitle: 'Markdown to PDF: convert .md files online · Pagewise',
    metaDescription: 'Convert Markdown (.md) files or pasted text to PDF with GitHub-style formatting, tables and syntax-highlighted code. Free, no sign-up, no watermark.',
    description: 'Upload a .md file or paste Markdown. You get a clean PDF with headings, tables and highlighted code.',
    group: 'Create PDF',
    icon: 'md',
    summary: 'Markdown files or pasted text, styled like GitHub.',
    accepts: 'Markdown · up to 10 MB',
    guideTitle: 'How to convert Markdown to PDF',
    steps: [
      'Upload a .md file, or switch to Paste text and paste your Markdown.',
      'Select Convert to PDF.',
      'The PDF downloads with GitHub-style headings, tables, lists and highlighted code blocks.',
    ],
  },
  jpg: {
    path: '/jpg-to-pdf',
    legacyHash: '#jpg-to-pdf',
    title: 'JPG to PDF',
    pageTitle: 'JPG to PDF: combine images into one PDF · Pagewise',
    metaDescription: 'Convert JPG, PNG, WebP and other images to PDF. Reorder pages, choose A4, Letter or original size, and set margins. Free, no sign-up, no watermark.',
    description: 'Combine photos and images into one PDF, in the order you choose.',
    group: 'Create PDF',
    icon: 'image',
    summary: 'Photos and images in the order you choose.',
    accepts: 'JPG, PNG, WebP, GIF, TIFF · up to 30 images',
    guideTitle: 'How to convert JPG to PDF',
    steps: [
      'Add up to 30 images: JPG, PNG, WebP, GIF, TIFF or AVIF.',
      'Put them in order, then choose page size, orientation and margin.',
      'Select Convert to PDF to download one PDF with a page for each image. Phone photos are rotated the right way up.',
    ],
  },
  merge: {
    path: '/merge-pdf',
    legacyHash: '#merge-pdf',
    title: 'Merge PDF',
    pageTitle: 'Merge PDF: combine PDF files online for free · Pagewise',
    metaDescription: 'Combine up to 20 PDF files into one document. Preview each file, put them in order and download a single PDF. Free, no sign-up, no watermark.',
    description: 'Combine several PDFs into one file. Arrange them in the order you want first.',
    group: 'Organize',
    icon: 'merge',
    summary: 'Several PDFs combined into one file.',
    accepts: 'PDF · up to 20 files',
    guideTitle: 'How to merge PDF files',
    steps: [
      'Add two or more PDFs. Each one shows its first page and page count.',
      'Drag them, or use the arrow buttons, into the order you want.',
      'Select Merge PDFs to download the combined file.',
    ],
  },
  split: {
    path: '/split-pdf',
    legacyHash: '#split-pdf',
    title: 'Split PDF',
    pageTitle: 'Split PDF: extract pages or split by range · Pagewise',
    metaDescription: 'Split a PDF by page ranges or every N pages, or extract only the pages you select. See which pages go where before you download. Free, no sign-up.',
    description: 'Break a PDF into ranges, split it every few pages, or pull out only the pages you need.',
    group: 'Organize',
    icon: 'split',
    summary: 'Ranges, every N pages, or just the pages you pick.',
    accepts: 'PDF · up to 100 MB',
    guideTitle: 'How to split a PDF',
    steps: [
      'Add a PDF to see all of its pages.',
      'Choose custom ranges such as 1-3, 8-, a number of pages per file, or the pages to extract.',
      'Select Split PDF. A single result downloads as a PDF; several come in a .zip.',
    ],
  },
  compress: {
    path: '/compress-pdf',
    legacyHash: '#compress-pdf',
    title: 'Compress PDF',
    pageTitle: 'Compress PDF: reduce PDF file size online · Pagewise',
    metaDescription: 'Make PDF files smaller for email and uploads. Choose extreme, recommended or light compression and see how much space you saved. Free, no sign-up.',
    description: 'Make a PDF smaller for email and uploads. Choose how much image quality to keep.',
    group: 'Optimize',
    icon: 'compress',
    summary: 'Smaller files for email and uploads.',
    accepts: 'PDF · up to 100 MB',
    guideTitle: 'How to compress a PDF',
    steps: [
      'Add a PDF.',
      'Choose a compression level. Recommended suits most files; Extreme gives the smallest file.',
      'Select Compress PDF. If the file can’t be made smaller, you get the original back.',
    ],
  },
  word: {
    path: '/pdf-to-word',
    legacyHash: '#pdf-to-word',
    title: 'PDF to Word',
    pageTitle: 'PDF to Word: convert PDF to editable DOCX · Pagewise',
    metaDescription: 'Convert PDF files to editable Word documents (.docx) that keep text, headings, tables and images. Free, no sign-up, no watermark.',
    description: 'Turn a PDF into a .docx you can edit in Word, Google Docs or LibreOffice.',
    group: 'Convert from PDF',
    icon: 'word',
    summary: 'An editable .docx from a text-based PDF.',
    accepts: 'PDF · up to 50 MB',
    guideTitle: 'How to convert PDF to Word',
    steps: [
      'Add a PDF that has selectable text. Scanned pages come through as images.',
      'Select Convert to Word.',
      'Open the .docx in Word, Google Docs or LibreOffice and edit it.',
    ],
  },
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toolByPath(path) {
  return Object.entries(TOOLS).find(([, tool]) => tool.path === path) || null;
}

// "How to …" steps shown under a tool.
export function renderGuide(tool) {
  if (!tool.steps) return '';
  const steps = tool.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  return `<h2>${escapeHtml(tool.guideTitle)}</h2><ol>${steps}</ol>`;
}

// Home page tool directory, grouped like the sidebar.
export function renderDirectory() {
  const groups = new Map();
  Object.values(TOOLS).forEach((tool) => {
    if (!tool.group) return;
    if (!groups.has(tool.group)) groups.set(tool.group, []);
    groups.get(tool.group).push(tool);
  });
  return [...groups].map(([group, tools]) => `<section class="directory-group"><h2>${escapeHtml(group)}</h2><ul>${tools.map((tool) => `<li><a class="directory-item" href="${tool.path}"><svg class="icon" aria-hidden="true"><use href="#i-${tool.icon}"/></svg><span><span class="directory-name">${escapeHtml(tool.title)}</span><span class="directory-summary">${escapeHtml(tool.summary)}</span><span class="directory-accepts">${escapeHtml(tool.accepts)}</span></span></a></li>`).join('')}</ul></section>`).join('');
}
