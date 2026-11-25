import { useId, useState } from 'react';
import { Languages, LoaderCircle, Volume2 } from 'lucide-react';
import {
  headingLevels,
  imageAlt,
  safeImageSrc,
  sectionLabel,
  tableCaption,
  tableNumbers,
  tokenize,
} from '@flowread/core/docModel.js';
import { boldRanges } from '@flowread/core/boldStarts.js';
import { resolveSettings, settingsToData, settingsToStyle } from '@flowread/core/profiles.js';
import { safeHref } from './safeHref.js';
import AiBadge from './AiBadge.jsx';
import './docRenderer.css';

/** The bold-word-starts value RichText expects: false, or the strength ratio. */
const boldOf = (s) => (s?.boldStarts ? Number(s.boldIntensity) || true : false);

const PLAIN_UNAVAILABLE = "Plain language isn't available right now. The original text is unchanged.";

function wordRange(text, highlight) {
  if (!highlight || highlight.start < 0) return null;
  const start = highlight.start;
  const end = start + Math.max(1, highlight.length || 0);
  for (const t of tokenize(text)) {
    if (t.space) continue;
    const tEnd = t.start + t.text.length;
    if (t.start < end && tEnd > start) return { start: t.start, end: tEnd };
  }
  return null;
}

/**
 * Text with inline marks (bold/italic/link), optional bold word starts and a
 * highlighted current word. Everything is React elements; no HTML strings.
 */
export function RichText({ text, marks, boldStarts, highlight }) {
  const value = String(text ?? '');
  const len = value.length;
  const validMarks = (Array.isArray(marks) ? marks : []).filter(
    (m) => m && Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0 && m.end <= len && m.end > m.start,
  );
  // boldStarts: false, true (default strength) or a ratio (0.35 light … 0.55 strong)
  const bws = boldStarts ? boldRanges(value, typeof boldStarts === 'number' ? boldStarts : undefined) : [];
  const hl = wordRange(value, highlight);
  if (!validMarks.length && !bws.length && !hl) return value;

  const cuts = new Set([0, len]);
  for (const r of [...validMarks, ...bws]) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  if (hl) {
    cuts.add(hl.start);
    cuts.add(hl.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  // Build segments with their attributes.
  const segs = [];
  let bi = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    while (bi < bws.length && bws[bi].end <= a) bi += 1;
    const isBws = bi < bws.length && bws[bi].start <= a && bws[bi].end >= b;
    let bold = false;
    let italic = false;
    let link = null;
    for (const m of validMarks) {
      if (m.start <= a && m.end >= b) {
        if (m.type === 'bold') bold = true;
        else if (m.type === 'italic') italic = true;
        else if (m.type === 'link') link = m;
      }
    }
    segs.push({ text: value.slice(a, b), isBws, bold, italic, link, hl: !!hl && hl.start <= a && hl.end >= b });
  }

  const renderSeg = (s, key) => {
    let node = s.text;
    if (s.isBws) node = <b className="fra-bws">{node}</b>;
    if (s.italic) node = <em>{node}</em>;
    if (s.bold) node = <strong>{node}</strong>;
    if (s.hl) node = <mark className="fra-word-current">{node}</mark>;
    return <span key={key}>{node}</span>;
  };

  // Group consecutive segments that share a link.
  const out = [];
  for (let i = 0; i < segs.length; ) {
    const s = segs[i];
    if (s.link) {
      const group = [];
      let j = i;
      while (j < segs.length && segs[j].link === s.link) {
        group.push(renderSeg(segs[j], j));
        j += 1;
      }
      const href = safeHref(s.link.href);
      out.push(
        href ? (
          <a key={`a${i}`} href={href} target="_blank" rel="noopener noreferrer">
            {group}
            <span className="fra-sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span key={`a${i}`}>{group}</span>
        ),
      );
      i = j;
    } else {
      out.push(renderSeg(s, i));
      i += 1;
    }
  }
  return out;
}

function hlFor(highlight, id) {
  return highlight && highlight.blockId === id && highlight.start >= 0 ? highlight : null;
}

function firstWords(text, n = 6) {
  const words = String(text || '').trim().split(/\s+/).slice(0, n).join(' ');
  return words ? `${words}…` : '';
}

function ParagraphBlock({ block, section, settings, onRequestPlain, onReadFrom, highlight }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const [localPlain, setLocalPlain] = useState(null);
  const regionId = useId();
  const plain = block.plain || localPlain;
  const canPlain = !!onRequestPlain && settings.plainLanguage && !!(block.text || '').trim();
  const canRead = !!onReadFrom && settings.readAloud && !!(block.text || '').trim();
  const role = block.role === 'notes' || block.role === 'caption' ? block.role : null;

  const request = async () => {
    if (status === 'loading') return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (plain) return;
    setStatus('loading');
    try {
      const result = await onRequestPlain(block, section);
      if (typeof result === 'string' && result.trim()) {
        setLocalPlain(result);
        setStatus('done');
      } else if (!block.plain) {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const speaking = highlight && highlight.blockId === block.id;
  const original = (
    <p className={`fra-p${role ? ` fra-p-${role}` : ''}`} id={`blk-${block.id}`} data-block={block.id}>
      <RichText text={block.text} marks={block.marks} boldStarts={boldOf(settings)} highlight={hlFor(highlight, block.id)} />
    </p>
  );

  const body = open ? (
    <div className="fra-plain-pair">
      <div className="fra-plain-col fra-plain-original">
        <p className="fra-plain-label" aria-hidden="true">
          Original
        </p>
        <span className="fra-sr-only">Original text: </span>
        {original}
      </div>
      <div className="fra-plain-col fra-plain-rewrite" id={regionId} aria-live="polite">
        <p className="fra-plain-label">
          Plain language <AiBadge what="This rewrite" />
        </p>
        {plain ? (
          <p className="fra-p">
            <RichText text={plain} boldStarts={boldOf(settings)} />
          </p>
        ) : status === 'loading' ? (
          <p className="fra-status">
            <LoaderCircle size={16} className="fra-spin" aria-hidden="true" /> Writing a plain-language version…
          </p>
        ) : status === 'error' ? (
          <p className="fra-status fra-status-error">{PLAIN_UNAVAILABLE}</p>
        ) : null}
      </div>
    </div>
  ) : (
    original
  );

  const label = firstWords(block.text);
  return (
    <div
      className={`fra-block fra-block-p${speaking ? ' fra-speaking' : ''}${open ? ' fra-plain-open' : ''}${role ? ` fra-role-${role}` : ''}`}
    >
      {role === 'notes' && <p className="fra-notes-label">Speaker notes</p>}
      {body}
      {(canPlain || canRead) && (
        <div className="fra-block-tools">
          {canRead && (
            <button type="button" className="fra-tool" onClick={() => onReadFrom(block.id)}>
              <Volume2 size={16} aria-hidden="true" />
              <span className="fra-tool-text">Read from here</span>
              <span className="fra-sr-only">: “{label}”</span>
            </button>
          )}
          {canPlain && (
            <button
              type="button"
              className="fra-tool"
              aria-expanded={open}
              aria-controls={open ? regionId : undefined}
              onClick={request}
              aria-busy={status === 'loading' || undefined}
            >
              <Languages size={16} aria-hidden="true" />
              <span className="fra-tool-text">{open ? 'Hide plain language' : 'Plain language'}</span>
              <span className="fra-sr-only">: “{label}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ListBlock({ block, settings, highlight }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <div className="fra-block">
      <Tag className="fra-list" id={`blk-${block.id}`} data-block={block.id}>
        {(block.items || []).map((item, i) => {
          const id = `${block.id}:${i}`;
          const speaking = highlight && highlight.blockId === id;
          return (
            <li key={i} className={speaking ? 'fra-speaking' : undefined}>
              <RichText text={item} boldStarts={boldOf(settings)} highlight={hlFor(highlight, id)} />
            </li>
          );
        })}
      </Tag>
    </div>
  );
}

function TableBlock({ block, number }) {
  const caption = tableCaption(block, number);
  const headers = Array.isArray(block.headers) ? block.headers : [];
  return (
    <div className="fra-block">
      <div className="fra-table-wrap" role="region" aria-label={`Table: ${caption}`} tabIndex={0}>
        <table className="fra-table" id={`blk-${block.id}`}>
          <caption>{caption}</caption>
          {headers.length > 0 && (
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(block.rows || []).map((row, r) => (
              <tr key={r}>
                {(row || []).map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImageBlock({ block, settings }) {
  const src = safeImageSrc(block.src);
  const decorative = block.altStatus === 'decorative';
  if (!src) return null;

  if (block.origin === 'page') {
    const alt = (block.alt || '').trim();
    return (
      <figure className="fra-block fra-figure fra-figure-page" id={`blk-${block.id}`}>
        <div className="fra-page-note">
          <strong>This page couldn’t be read as text.</strong> It’s shown as a picture of the original page, so read-aloud,
          spacing and fonts can’t change it.
          {alt ? ' A description follows the picture.' : ''}
        </div>
        <img src={src} alt={alt || 'Scanned page from the original document'} className="fra-img" />
        {block.caption && <figcaption className="fra-figcaption">{block.caption}</figcaption>}
      </figure>
    );
  }

  if (decorative && !block.caption) {
    return (
      <div className="fra-block fra-decorative">
        <img src={src} alt="" className="fra-img" id={`blk-${block.id}`} />
      </div>
    );
  }
  const alt = imageAlt(block);
  const showDetails = settings.imageDetails && !decorative && (block.alt || '').trim();
  return (
    <figure className="fra-block fra-figure" id={`blk-${block.id}`}>
      <img src={src} alt={alt} className="fra-img" />
      {block.caption && <figcaption className="fra-figcaption">{block.caption}</figcaption>}
      {showDetails && (
        <details className="fra-details">
          <summary>
            Image description
            {block.altStatus === 'ai' && <AiBadge what="This image description" />}
          </summary>
          {/* Hidden from AT: the same text is already the image's alt. */}
          <p aria-hidden="true">{block.alt}</p>
        </details>
      )}
    </figure>
  );
}

function MathBlock({ block, settings, highlight }) {
  const visual = block.text || block.latex || '';
  const spoken = (block.spoken || '').trim();
  const speaking = highlight && highlight.blockId === block.id;
  return (
    <div className={`fra-block fra-math${speaking ? ' fra-speaking' : ''}`} id={`blk-${block.id}`}>
      {spoken ? (
        <>
          <span className="fra-math-visual" aria-hidden="true">
            {visual}
          </span>
          <span className="fra-sr-only">Math: {spoken}</span>
          {settings.mathSpoken && (
            <span className="fra-math-spoken" aria-hidden="true">
              Read as: {spoken}
            </span>
          )}
        </>
      ) : (
        <span className="fra-math-visual">{visual}</span>
      )}
    </div>
  );
}

function PageMarker({ block, kind }) {
  const word = kind === 'pptx' ? 'Slide' : 'Page';
  return (
    <p className="fra-page" id={`page-${block.id}`} data-page={block.n}>
      <span className="fra-sr-only">{kind === 'pptx' ? 'Original deck, ' : 'Printed copy, '}</span>
      {word} {block.n}
    </p>
  );
}

function Heading({ level, id, children, className }) {
  const Tag = `h${level}`;
  return (
    <Tag id={id} className={className} tabIndex={-1}>
      {children}
    </Tag>
  );
}

/**
 * Semantic renderer for an AccessDoc.
 *
 * Props:
 *  - doc (required)
 *  - sections?: subset of doc.sections (objects or ids) to render; default all
 *  - profile?: profile id, profile object or settings object
 *  - onRequestPlain?: async (block, section) => string
 *  - onReadFrom?: (blockId) => void; adds "Read from here" to paragraphs
 *  - highlight?: { blockId, start, length } current read-aloud word
 *  - showTitle? (default true), titleId?, afterTitle?, renderBeforeBlocks?, className?
 */
export default function DocRenderer({
  doc,
  sections,
  profile,
  onRequestPlain,
  onReadFrom,
  highlight = null,
  showTitle = true,
  titleId,
  afterTitle = null,
  renderBeforeBlocks,
  renderAfterSection,
  className = '',
}) {
  if (!doc) return null;
  const settings = resolveSettings(profile);
  const all = doc.sections || [];
  const shown = sections
    ? sections.map((s) => (typeof s === 'string' ? all.find((x) => x.id === s) : s)).filter(Boolean)
    : all;
  const levels = headingLevels(shown);
  const tables = tableNumbers(doc);
  const kind = doc.source?.kind;

  return (
    <article
      className={`fra-doc fra-theme ${className}`.trim()}
      lang={doc.lang || 'en'}
      style={settingsToStyle(settings)}
      {...settingsToData(settings)}
      data-fra-bws={settings.boldStarts ? 'on' : undefined}
    >
      {showTitle && (
        <h1 className="fra-title" id={titleId} tabIndex={-1}>
          {doc.title || 'Untitled document'}
        </h1>
      )}
      {afterTitle}
      {shown.map((sec) => {
        const index = all.indexOf(sec);
        const lvl = levels.get(`sec:${sec.id}`);
        const secSpeaking = highlight && highlight.blockId === `sec:${sec.id}`;
        return (
          <section key={sec.id} id={`sec-${sec.id}`} className="fra-section" data-section-index={index}>
            {lvl && (
              <Heading
                level={lvl}
                id={`h-${sec.id}`}
                className={`fra-h fra-section-heading${secSpeaking ? ' fra-speaking' : ''}`}
              >
                <RichText text={sec.heading} highlight={hlFor(highlight, `sec:${sec.id}`)} />
              </Heading>
            )}
            {!lvl && (
              <span className="fra-sr-only" id={`h-${sec.id}`}>
                {sectionLabel(sec, index)}
              </span>
            )}
            {renderBeforeBlocks ? renderBeforeBlocks(sec, index) : null}
            {(sec.blocks || []).map((b) => {
              switch (b.type) {
                case 'heading': {
                  const speaking = highlight && highlight.blockId === b.id;
                  return (
                    <Heading
                      key={b.id}
                      level={levels.get(`blk:${b.id}`) || 3}
                      id={`blk-${b.id}`}
                      className={`fra-h${speaking ? ' fra-speaking' : ''}`}
                    >
                      <RichText text={b.text} highlight={hlFor(highlight, b.id)} />
                      {b.ai && <AiBadge what="This heading" />}
                    </Heading>
                  );
                }
                case 'paragraph':
                  return (
                    <ParagraphBlock
                      key={b.id}
                      block={b}
                      section={sec}
                      settings={settings}
                      onRequestPlain={onRequestPlain}
                      onReadFrom={onReadFrom}
                      highlight={highlight}
                    />
                  );
                case 'list':
                  return <ListBlock key={b.id} block={b} settings={settings} highlight={highlight} />;
                case 'table':
                  return <TableBlock key={b.id} block={b} number={tables.get(b.id) || 1} />;
                case 'image':
                  return <ImageBlock key={b.id} block={b} settings={settings} />;
                case 'math':
                  return <MathBlock key={b.id} block={b} settings={settings} highlight={highlight} />;
                case 'pageMarker':
                  return <PageMarker key={b.id} block={b} kind={kind} />;
                default:
                  return null;
              }
            })}
            {renderAfterSection ? renderAfterSection(sec, index) : null}
          </section>
        );
      })}
    </article>
  );
}
