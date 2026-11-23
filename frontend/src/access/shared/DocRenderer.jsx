import { useId, useState } from 'react';
import {
  headingLevels,
  imageAlt,
  safeImageSrc,
  sectionLabel,
  splitWordStart,
  tableCaption,
  tableNumbers,
  tokenize,
} from './docModel.js';
import { resolveSettings, settingsToData, settingsToStyle } from './profiles.js';
import './docRenderer.css';

const PLAIN_UNAVAILABLE = "Plain language isn't available right now.";

/**
 * Text with optional "bold word starts" and a highlighted current word.
 * highlight = { start, length } in character offsets of `text`.
 */
function RichText({ text, boldStarts, highlight }) {
  const value = text ?? '';
  if (!boldStarts && !highlight) return value;
  const tokens = tokenize(value);
  const hStart = highlight ? highlight.start : -1;
  const hEnd = highlight ? highlight.start + Math.max(1, highlight.length || 0) : -1;
  return tokens.map((t, i) => {
    if (t.space) return t.text;
    let content = t.text;
    if (boldStarts) {
      const [pre, bold, rest] = splitWordStart(t.text);
      content = (
        <>
          {pre}
          {bold && <b className="fra-bws">{bold}</b>}
          {rest}
        </>
      );
    }
    const tEnd = t.start + t.text.length;
    const active = highlight && t.start < hEnd && tEnd > hStart;
    return active ? (
      <mark key={i} className="fra-word-current">
        {content}
      </mark>
    ) : (
      <span key={i}>{content}</span>
    );
  });
}

function hl(highlight, id) {
  return highlight && highlight.blockId === id && highlight.start >= 0 ? highlight : null;
}

function firstWords(text, n = 6) {
  const words = String(text || '').trim().split(/\s+/).slice(0, n).join(' ');
  return words ? `${words}…` : '';
}

function ParagraphBlock({ block, section, settings, onRequestPlain, highlight }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | error | done
  const [localPlain, setLocalPlain] = useState(null);
  const regionId = useId();
  const plain = block.plain || localPlain;
  const canPlain = !!onRequestPlain && settings.plainLanguage && !!(block.text || '').trim();

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
    <p className="fra-p" id={`blk-${block.id}`}>
      <RichText text={block.text} boldStarts={settings.boldStarts} highlight={hl(highlight, block.id)} />
    </p>
  );

  if (!canPlain) {
    return <div className={`fra-block fra-block-p${speaking ? ' fra-speaking' : ''}`}>{original}</div>;
  }

  return (
    <div className={`fra-block fra-block-p${speaking ? ' fra-speaking' : ''}${open ? ' fra-plain-open' : ''}`}>
      {open ? (
        <div className="fra-plain-pair">
          <div className="fra-plain-col fra-plain-original">
            <p className="fra-plain-label" aria-hidden="true">
              Original
            </p>
            <span className="fra-sr-only">Original text: </span>
            {original}
          </div>
          <div className="fra-plain-col fra-plain-rewrite" id={regionId} aria-live="polite">
            <p className="fra-plain-label">Plain language (AI rewrite; check the original)</p>
            {plain ? (
              <p className="fra-p">
                <RichText text={plain} boldStarts={settings.boldStarts} />
              </p>
            ) : status === 'loading' ? (
              <p className="fra-status">Writing a plain-language version…</p>
            ) : status === 'error' ? (
              <p className="fra-status fra-status-error">{PLAIN_UNAVAILABLE}</p>
            ) : null}
          </div>
        </div>
      ) : (
        original
      )}
      <div className="fra-block-tools">
        <button
          type="button"
          className="fra-btn fra-btn-small"
          aria-expanded={open}
          aria-controls={open ? regionId : undefined}
          onClick={request}
          aria-busy={status === 'loading' || undefined}
        >
          {open ? 'Hide plain language' : 'Plain language'}
          <span className="fra-sr-only"> for the paragraph “{firstWords(block.text)}”</span>
        </button>
      </div>
    </div>
  );
}

function ListBlock({ block, settings, highlight }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <div className="fra-block">
      <Tag className="fra-list" id={`blk-${block.id}`}>
        {(block.items || []).map((item, i) => {
          const id = `${block.id}:${i}`;
          const speaking = highlight && highlight.blockId === id;
          return (
            <li key={i} className={speaking ? 'fra-speaking' : undefined}>
              <RichText text={item} boldStarts={settings.boldStarts} highlight={hl(highlight, id)} />
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
  const alt = imageAlt(block);
  const decorative = block.altStatus === 'decorative';
  if (!src) return null;
  if (decorative && !block.caption) {
    return (
      <div className="fra-block fra-decorative">
        <img src={src} alt="" className="fra-img" id={`blk-${block.id}`} />
      </div>
    );
  }
  const showDetails = settings.imageDetails && !decorative && (block.alt || '').trim();
  return (
    <figure className="fra-block fra-figure" id={`blk-${block.id}`}>
      <img src={src} alt={alt} className="fra-img" />
      {block.caption && <figcaption className="fra-figcaption">{block.caption}</figcaption>}
      {showDetails && (
        <details className="fra-details">
          <summary>
            Image description
            {block.altStatus === 'ai' && <span className="fra-muted"> (generated automatically)</span>}
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

function PageMarker({ block }) {
  return (
    <p className="fra-page" id={`page-${block.id}`} data-page={block.n}>
      <span className="fra-sr-only">Printed copy, </span>Page {block.n}
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
 *  - profile?: profile id, profile object or settings object (see profiles.js)
 *  - onRequestPlain?: async (block, section) => string. When given (and the
 *    profile has plainLanguage on), paragraphs get a "Plain language" button
 *    and the rewrite is shown next to the original. Throw to show
 *    "Plain language isn't available right now".
 *  - highlight?: { blockId, start, length } current read-aloud word
 *    (list items use `${blockId}:${index}`, section headings `sec:${id}`)
 *  - showTitle? (default true): render doc.title as the only <h1>
 *  - titleId?: id for the <h1>
 *  - renderBeforeBlocks?: (section, index) => node, rendered after a section heading
 *  - className?: extra class on the root <article>
 */
export default function DocRenderer({
  doc,
  sections,
  profile,
  onRequestPlain,
  highlight = null,
  showTitle = true,
  titleId,
  renderBeforeBlocks,
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

  return (
    <article
      className={`fra-doc fra-theme ${className}`.trim()}
      lang={doc.lang || 'en'}
      style={settingsToStyle(settings)}
      {...settingsToData(settings)}
    >
      {showTitle && (
        <h1 className="fra-title" id={titleId} tabIndex={-1}>
          {doc.title || 'Untitled document'}
        </h1>
      )}
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
                <RichText text={sec.heading} highlight={hl(highlight, `sec:${sec.id}`)} />
              </Heading>
            )}
            {!lvl && <span className="fra-sr-only" id={`h-${sec.id}`}>{sectionLabel(sec, index)}</span>}
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
                      <RichText text={b.text} highlight={hl(highlight, b.id)} />
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
                  return <PageMarker key={b.id} block={b} />;
                default:
                  return null;
              }
            })}
          </section>
        );
      })}
    </article>
  );
}
