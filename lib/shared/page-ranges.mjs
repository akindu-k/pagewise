// Page-range parsing and split planning. Shared by the server (to build the
// output) and the browser (to preview it), so both always agree.
// Pages are 1-based throughout.

export class PageRangeError extends Error {}

/**
 * Parses "1-3, 5, 8-" into [[1,3],[5,5],[8,pageCount]].
 * An open end ("8-") runs to the last page; "-4" starts at page 1.
 */
export function parseRanges(text, pageCount) {
  const parts = String(text || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new PageRangeError('Enter at least one page or range, e.g. 1-3, 5.');

  return parts.map((part) => {
    const match = part.match(/^(\d*)\s*-\s*(\d*)$|^(\d+)$/);
    if (!match || part === '-') throw new PageRangeError(`"${part}" is not a page or range. Use e.g. 2 or 4-7.`);

    const from = match[3] ? Number(match[3]) : match[1] ? Number(match[1]) : 1;
    const to = match[3] ? Number(match[3]) : match[2] ? Number(match[2]) : pageCount;

    for (const page of [from, to]) {
      if (page < 1 || page > pageCount) {
        throw new PageRangeError(`Page ${page} doesn't exist — this PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
      }
    }
    if (from > to) throw new PageRangeError(`"${part}" runs backwards. Write it as ${to}-${from}.`);
    return [from, to];
  });
}

function pagesIn([from, to]) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// Zero-padded to the page count's width so output files sort correctly.
function pad(page, pageCount) {
  return String(page).padStart(String(pageCount).length, '0');
}

function rangeLabel([from, to], pageCount) {
  return from === to ? pad(from, pageCount) : `${pad(from, pageCount)}-${pad(to, pageCount)}`;
}

/**
 * Turns split options into the list of output files.
 *
 * @param {object} options
 * @param {'ranges'|'fixed'|'extract'} options.mode
 * @param {string} [options.ranges]  ranges mode: "1-3, 4-6"
 * @param {number|string} [options.every]  fixed mode: pages per file
 * @param {string} [options.pages]   extract mode: "all" or "1, 3, 5-8"
 * @param {boolean|string} [options.merge]  ranges/extract: one file instead of many
 * @param {number} pageCount
 * @returns {{ label: string, pages: number[] }[]}
 */
export function planSplit(options, pageCount) {
  const merge = options.merge === true || options.merge === 'true';

  if (options.mode === 'fixed') {
    const every = Number(options.every);
    if (!Number.isInteger(every) || every < 1) throw new PageRangeError('Pages per file must be a whole number of at least 1.');
    const files = [];
    for (let from = 1; from <= pageCount; from += every) {
      const range = [from, Math.min(from + every - 1, pageCount)];
      files.push({ label: rangeLabel(range, pageCount), pages: pagesIn(range) });
    }
    return files;
  }

  if (options.mode === 'extract') {
    let pages;
    if (String(options.pages || '').trim().toLowerCase() === 'all') {
      pages = pagesIn([1, pageCount]);
    } else {
      // Selected pages, in page order, each once.
      pages = [...new Set(parseRanges(options.pages, pageCount).flatMap(pagesIn))].sort((a, b) => a - b);
    }
    if (merge) return [{ label: 'extracted', pages }];
    return pages.map((page) => ({ label: pad(page, pageCount), pages: [page] }));
  }

  if (options.mode === 'ranges') {
    const ranges = parseRanges(options.ranges, pageCount);
    if (merge) return [{ label: ranges.map((r) => rangeLabel(r, pageCount)).join('_'), pages: ranges.flatMap(pagesIn) }];
    return ranges.map((range) => ({ label: rangeLabel(range, pageCount), pages: pagesIn(range) }));
  }

  throw new PageRangeError('Choose a split mode: ranges, fixed or extract.');
}
