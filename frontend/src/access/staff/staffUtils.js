// Pure helpers for the staff workspace (no React, so components stay fast-refresh friendly).

export const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'];

export const SEVERITY_LABEL = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

export const ALT_STATUS_LABEL = {
  ai: 'AI draft',
  approved: 'Approved',
  decorative: 'Decorative',
  missing: 'Missing',
};

export const BLOCK_TYPE_LABEL = {
  heading: 'Sub-heading',
  paragraph: 'Paragraph',
  list: 'List',
  table: 'Table',
  image: 'Image',
  math: 'Math',
  pageMarker: 'Page marker',
};

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function slugify(title) {
  const base = String(title || 'document')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'document';
}

export function groupIssues(issues = []) {
  const groups = Object.fromEntries(SEVERITIES.map((s) => [s, []]));
  for (const issue of issues) {
    (groups[issue.severity] || groups.minor).push(issue);
  }
  return groups;
}

export function blockingIssues(report) {
  return (report?.issues || []).filter((i) => i.severity === 'critical' || i.severity === 'serious');
}

/* ---------- Immutable doc updates ---------- */

export function updateSection(doc, sectionId, patch) {
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
  };
}

export function updateBlock(doc, blockId, patch) {
  return {
    ...doc,
    sections: doc.sections.map((s) => {
      if (!s.blocks.some((b) => b.id === blockId)) return s;
      return {
        ...s,
        blocks: s.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const next = typeof patch === 'function' ? patch(b) : patch;
          return { ...b, ...next };
        }),
      };
    }),
  };
}

export function findBlock(doc, blockId) {
  for (const section of doc.sections || []) {
    const block = section.blocks.find((b) => b.id === blockId);
    if (block) return { section, block };
  }
  return null;
}

/** All image blocks with their section and nearby text (for AI context). */
export function collectImages(doc) {
  const out = [];
  for (const section of doc.sections || []) {
    section.blocks.forEach((block, idx) => {
      if (block.type !== 'image') return;
      out.push({ section, block, context: nearbyText(section, idx) });
    });
  }
  return out;
}

function blockText(b) {
  if (!b) return '';
  if (b.type === 'paragraph' || b.type === 'heading') return b.text || '';
  if (b.type === 'list') return (b.items || []).join('; ');
  return '';
}

export function nearbyText(section, idx) {
  const parts = [];
  if (section.heading) parts.push(section.heading);
  const block = section.blocks[idx];
  if (block?.caption) parts.push(block.caption);
  for (let i = idx - 1; i >= 0 && parts.join(' ').length < 400; i--) {
    const t = blockText(section.blocks[i]);
    if (t) parts.push(t);
  }
  const after = blockText(section.blocks[idx + 1]);
  if (after) parts.push(after);
  return parts.join('\n').slice(0, 1200);
}

/**
 * Heading levels in reading order, starting after the h1 title.
 * Returns a map of id -> previous heading level, for skip warnings.
 * Section ids are prefixed with "section:".
 */
export function headingContext(doc) {
  const prevLevel = {};
  let prev = 1;
  for (const section of doc.sections || []) {
    if (section.heading) {
      prevLevel[`section:${section.id}`] = prev;
      prev = section.level || 2;
    }
    for (const b of section.blocks) {
      if (b.type === 'heading') {
        prevLevel[b.id] = prev;
        prev = b.level || 2;
      }
    }
  }
  return prevLevel;
}

export function skipWarning(level, prev) {
  if (!level || !prev || level <= prev + 1) return null;
  return `Skips a level: h${prev} is followed by h${level}. Use h${prev + 1} or lower.`;
}

/* ---------- Errors ---------- */

function statusOf(err) {
  return err?.status ?? err?.response?.status ?? err?.statusCode ?? null;
}

export function describeConvertError(err) {
  const status = statusOf(err);
  const msg = String(err?.message || '');
  if (/storage full/i.test(msg) || err?.name === 'QuotaExceededError') {
    return {
      title: 'This browser is out of storage space',
      detail:
        'The document converted, but it could not be saved. Delete older documents from the workspace home page, then try again.',
    };
  }
  if (status === 413 || /\b413\b|too large/i.test(msg)) {
    return { title: 'File is too large', detail: 'Files must be 25 MB or smaller. Split or compress the file and try again.' };
  }
  if (status === 415 || /\b415\b|unsupported/i.test(msg)) {
    return { title: 'File type not supported', detail: 'Upload a PDF (.pdf), Word document (.docx) or PowerPoint deck (.pptx).' };
  }
  if (err?.name === 'TypeError' || /failed to fetch|networkerror|load failed|network/i.test(msg)) {
    return {
      title: 'The conversion service could not be reached',
      detail: 'Check that the FlowRead backend is running and reachable, then try again.',
    };
  }
  return { title: 'Conversion failed', detail: msg || 'Something went wrong while converting the file.' };
}

export function describeAiError(err) {
  const status = statusOf(err);
  const msg = String(err?.message || '');
  if (status === 503 || /\b503\b/.test(msg)) {
    return 'AI descriptions are unavailable on this server (no AI key is configured). Write the description by hand.';
  }
  if (err?.name === 'TypeError' || /failed to fetch|network/i.test(msg)) {
    return 'The AI service could not be reached. Write the description by hand or try again later.';
  }
  return msg || 'Could not generate a description.';
}
