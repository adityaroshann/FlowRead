// Structured Word export: real headings, lists, tables and images from the
// AccessDoc blocks (not a picture of the page). `docx` is loaded on demand.

import { boldRanges } from '@flowread/core/boldStarts.js';
import { headingLevels, imageAlt, safeImageSrc, sectionLabel, slugify, tableCaption, tableNumbers } from '@flowread/core/docModel.js';
import { resolveSettings } from '@flowread/core/profiles.js';

const WORD_FONTS = {
  system: 'Arial',
  atkinson: 'Atkinson Hyperlegible Next',
  lexend: 'Lexend',
  dyslexic: 'OpenDyslexic',
  serif: 'Literata',
};

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataUrlToBytes(src) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(src || '');
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { bytes, type: m[1].toLowerCase().startsWith('jp') ? 'jpg' : 'png' };
  } catch {
    return null;
  }
}

function imageSize(bytes, type) {
  // Read pixel size from the PNG/JPEG header so the image keeps its aspect ratio.
  try {
    if (type === 'png') {
      const dv = new DataView(bytes.buffer);
      return { w: dv.getUint32(16), h: dv.getUint32(20) };
    }
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) + bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xc3) return { h: (bytes[i + 5] << 8) + bytes[i + 6], w: (bytes[i + 7] << 8) + bytes[i + 8] };
      i += 2 + len;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * exportDocx(doc, settings, { includeSummaries, includePlain, includePageRefs }) -> Promise<Blob>
 */
export async function exportDocx(doc, settingsIn, options = {}) {
  const d = await import('docx');
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, LevelFormat, AlignmentType, ExternalHyperlink } = d;
  const settings = resolveSettings(settingsIn);
  const font = WORD_FONTS[settings.font] || 'Arial';
  const size = Math.round(22 * Math.min(2, Math.max(0.8, settings.textScale || 1))); // half-points
  const spacingLine = Math.round(240 * (settings.lineHeight || 1.5));
  const { includeSummaries = true, includePlain = false, includePageRefs = true } = options;

  const H = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

  const runs = (text, marks = []) => {
    const value = String(text ?? '');
    const bws = settings.boldStarts ? boldRanges(value) : [];
    const valid = (marks || []).filter((m) => Number.isInteger(m.start) && Number.isInteger(m.end) && m.end > m.start && m.end <= value.length);
    const cuts = new Set([0, value.length]);
    for (const r of [...bws, ...valid]) {
      cuts.add(r.start);
      cuts.add(r.end);
    }
    const pts = [...cuts].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (b <= a) continue;
      const inBws = bws.some((r) => r.start <= a && r.end >= b);
      const m = valid.filter((r) => r.start <= a && r.end >= b);
      const bold = inBws || m.some((r) => r.type === 'bold');
      const italics = m.some((r) => r.type === 'italic');
      const link = m.find((r) => r.type === 'link' && /^(https?:|mailto:)/i.test(String(r.href || '')));
      const run = new TextRun({ text: value.slice(a, b), bold, italics, font, style: link ? 'Hyperlink' : undefined });
      out.push(link ? new ExternalHyperlink({ link: link.href, children: [run] }) : run);
    }
    return out.length ? out : [new TextRun({ text: value, font })];
  };

  const body = (text, marks, extra = {}) => new Paragraph({ children: runs(text, marks), spacing: { line: spacingLine, after: 160 }, ...extra });
  const levels = headingLevels(doc.sections || []);
  const tables = tableNumbers(doc);
  const children = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title || 'Untitled document', font })] })];
  let listId = 0;
  const numberingConfigs = [];

  (doc.sections || []).forEach((sec, si) => {
    const lvl = levels.get(`sec:${sec.id}`);
    if (lvl) children.push(new Paragraph({ heading: H[lvl], children: [new TextRun({ text: sec.heading, font })] }));
    else if (si > 0) children.push(new Paragraph({ heading: H[2], children: [new TextRun({ text: sectionLabel(sec, si), font })] }));
    if (includeSummaries && sec.summary) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'In this section: ', bold: true, font }), new TextRun({ text: sec.summary, italics: true, font })],
          spacing: { line: spacingLine, after: 200 },
        }),
      );
    }
    for (const b of sec.blocks || []) {
      switch (b.type) {
        case 'heading':
          children.push(new Paragraph({ heading: H[levels.get(`blk:${b.id}`) || 3], children: [new TextRun({ text: b.text, font })] }));
          break;
        case 'paragraph':
          if (b.role === 'notes') {
            children.push(new Paragraph({ children: [new TextRun({ text: 'Speaker notes', bold: true, font })] }));
            children.push(body(b.text, b.marks, { indent: { left: 360 } }));
          } else {
            children.push(body(b.text, b.marks));
          }
          if (includePlain && b.plain) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: 'Plain language (AI): ', bold: true, font }), ...runs(b.plain)],
                indent: { left: 360 },
                spacing: { line: spacingLine, after: 160 },
              }),
            );
          }
          break;
        case 'list': {
          const ref = `list-${(listId += 1)}`;
          numberingConfigs.push({
            reference: ref,
            levels: [
              {
                level: 0,
                format: b.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
                text: b.ordered ? '%1.' : '•',
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720, hanging: 360 } } },
              },
            ],
          });
          for (const item of b.items || []) {
            children.push(new Paragraph({ children: runs(item), numbering: { reference: ref, level: 0 }, spacing: { line: spacingLine, after: 80 } }));
          }
          break;
        }
        case 'table': {
          const headers = Array.isArray(b.headers) ? b.headers : [];
          const cols = Math.max(headers.length, ...(b.rows || []).map((r) => r.length), 1);
          const cell = (t, header) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(t ?? ''), bold: header, font })] })],
            });
          const rows = [];
          if (headers.length) rows.push(new TableRow({ tableHeader: true, children: Array.from({ length: cols }, (_, i) => cell(headers[i], true)) }));
          for (const r of b.rows || []) rows.push(new TableRow({ children: Array.from({ length: cols }, (_, i) => cell(r[i], false)) }));
          children.push(new Paragraph({ children: [new TextRun({ text: tableCaption(b, tables.get(b.id) || 1), bold: true, font })] }));
          children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          children.push(new Paragraph({ children: [] }));
          break;
        }
        case 'image': {
          const src = safeImageSrc(b.src);
          const img = dataUrlToBytes(src);
          const alt = imageAlt(b);
          if (img) {
            const dim = imageSize(img.bytes, img.type) || { w: 600, h: 400 };
            const w = Math.min(560, dim.w);
            const h = Math.round((dim.h / dim.w) * w);
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    type: img.type,
                    data: img.bytes,
                    transformation: { width: w, height: h },
                    altText: { title: b.caption || 'Image', description: alt, name: b.id },
                  }),
                ],
              }),
            );
          } else if (b.altStatus !== 'decorative') {
            children.push(body(`[Image: ${alt}]`));
          }
          if (b.caption) children.push(new Paragraph({ children: [new TextRun({ text: b.caption, italics: true, font })] }));
          if (b.origin === 'page') children.push(body('This page could not be read as text; it is a picture of the original page.'));
          break;
        }
        case 'math':
          children.push(new Paragraph({ children: [new TextRun({ text: b.text || b.latex || '', font: 'Cambria Math' })] }));
          if (b.spoken) children.push(new Paragraph({ children: [new TextRun({ text: `Read as: ${b.spoken}`, italics: true, font })] }));
          break;
        case 'pageMarker':
          if (includePageRefs) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `${doc.source?.kind === 'pptx' ? 'Slide' : 'Page'} ${b.n}`, color: '5C554B', size: 18, font })],
              }),
            );
          }
          break;
        default:
          break;
      }
    }
  });

  const document = new Document({
    title: doc.title || 'Untitled document',
    creator: 'FlowRead',
    styles: {
      default: {
        document: {
          run: { font, size, characterSpacing: Math.round((settings.letterSpacing || 0) * 20 * (size / 2)) },
          paragraph: { spacing: { line: spacingLine } },
        },
      },
    },
    numbering: { config: numberingConfigs },
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(document);
  return blob;
}

export function docxFilename(doc) {
  return `${slugify(doc.title)}.docx`;
}
