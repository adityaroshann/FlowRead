import { memo, useCallback } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { safeImageSrc } from '../shared/docModel';
import { ALT_STATUS_LABEL, BLOCK_TYPE_LABEL, headingContext, skipWarning } from './staffUtils';

const LEVELS = [2, 3, 4, 5, 6];
const NO_ISSUES = [];

function rowsFor(text, min = 2, max = 14) {
  const len = String(text || '').length;
  const lines = String(text || '').split('\n').length;
  return Math.min(max, Math.max(min, Math.ceil(len / 75), lines));
}

function LevelSelect({ id, value, onChange }) {
  const options = LEVELS.includes(value) ? LEVELS : [value, ...LEVELS].filter(Boolean);
  return (
    <div className="fa-field">
      <label className="fa-label" htmlFor={id}>
        Level
      </label>
      <select id={id} className="fa-select" value={value || 2} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((l) => (
          <option key={l} value={l}>
            h{l}
          </option>
        ))}
      </select>
    </div>
  );
}

function SkipWarning({ id, text }) {
  if (!text) return null;
  return (
    <p className="fa-warn" id={id}>
      <TriangleAlert size={16} aria-hidden="true" /> {text}
    </p>
  );
}

function IssueNotes({ issues: all }) {
  // Heading skips are already explained by the inline SkipWarning.
  const issues = all.filter((i) => i.rule !== 'heading-skip');
  if (!issues.length) return null;
  return (
    <ul className="fa-hint" style={{ listStyle: 'none', display: 'grid', gap: '0.2rem' }}>
      {issues.map((i, n) => (
        <li key={`${i.rule}-${n}`} className="fa-warn" style={{ fontWeight: 500 }}>
          <TriangleAlert size={14} aria-hidden="true" /> {i.message}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Block editors ---------- */

function TableEditor({ block, onChange, labelId }) {
  const hasHeader = (block.headers || []).length > 0;
  const rows = block.rows || [];
  const width = Math.max(hasHeader ? block.headers.length : 0, ...rows.map((r) => r.length), 1);

  const setHeader = (on) => {
    if (on && !hasHeader) {
      const [first = [], ...rest] = rows;
      onChange({ headers: [...first, ...Array(Math.max(0, width - first.length)).fill('')], rows: rest });
    } else if (!on && hasHeader) {
      onChange({ headers: [], rows: [block.headers, ...rows] });
    }
  };
  const setHeaderCell = (c, v) => {
    const headers = [...block.headers];
    headers[c] = v;
    onChange({ headers });
  };
  const setCell = (r, c, v) => {
    onChange({ rows: rows.map((row, ri) => (ri === r ? Object.assign([...row], { [c]: v }) : row)) });
  };

  return (
    <>
      <div className="fa-field">
        <label className="fa-label" htmlFor={`fa-cap-${block.id}`}>
          Caption
        </label>
        <input
          id={`fa-cap-${block.id}`}
          className="fa-input"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value || null })}
        />
      </div>
      <label className="fa-check">
        <input type="checkbox" checked={hasHeader} onChange={(e) => setHeader(e.target.checked)} />
        <span>First row is a header</span>
      </label>
      <div className="fa-tablewrap" role="group" aria-labelledby={labelId} tabIndex={0}>
        <table className="fa-tableedit">
          {hasHeader && (
            <thead>
              <tr>
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} scope="col">
                    <input
                      className="fa-input"
                      aria-label={`Header, column ${c + 1}`}
                      value={block.headers[c] ?? ''}
                      onChange={(e) => setHeaderCell(c, e.target.value)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c}>
                    <input
                      className="fa-input"
                      aria-label={`Row ${r + 1}, column ${c + 1}`}
                      value={row[c] ?? ''}
                      onChange={(e) => setCell(r, c, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ListEditor({ block, onChange }) {
  const items = block.items || [];
  const setItem = (i, v) => onChange({ items: items.map((it, n) => (n === i ? v : it)) });
  const remove = (i) => onChange({ items: items.filter((_, n) => n !== i) });
  const add = () => onChange({ items: [...items, ''] });
  return (
    <>
      <label className="fa-check">
        <input type="checkbox" checked={Boolean(block.ordered)} onChange={(e) => onChange({ ordered: e.target.checked })} />
        <span>Numbered list</span>
      </label>
      <ol className="fa-listitems">
        {items.map((item, i) => (
          <li key={i} className="fa-listitem">
            <span className="fa-listitem__n" aria-hidden="true">
              {block.ordered ? `${i + 1}.` : '•'}
            </span>
            <input
              className="fa-input"
              aria-label={`List item ${i + 1}`}
              value={item}
              onChange={(e) => setItem(i, e.target.value)}
            />
            <button type="button" className="fa-btn fa-btn--sm fa-btn--ghost" onClick={() => remove(i)}>
              <Trash2 size={16} aria-hidden="true" />
              <span className="fa-visually-hidden">Remove list item {i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
      <div>
        <button type="button" className="fa-btn fa-btn--sm" onClick={add}>
          <Plus size={16} aria-hidden="true" /> Add item
        </button>
      </div>
    </>
  );
}

const BlockEditor = memo(function BlockEditor({ block, index, prevLevel, issues, onChangeBlock, onGoToImage }) {
  const onChange = useCallback((patch) => onChangeBlock(block.id, patch), [block.id, onChangeBlock]);
  const labelId = `fa-blocklabel-${block.id}`;

  if (block.type === 'pageMarker') {
    return (
      <p className="fa-pagemarker" id={`fa-block-${block.id}`} tabIndex={-1}>
        Source page {block.n}
      </p>
    );
  }

  const typeLabel = BLOCK_TYPE_LABEL[block.type] || block.type;
  const warning = block.type === 'heading' ? skipWarning(block.level, prevLevel) : null;

  return (
    <div
      className={`fa-block${issues.length ? ' fa-block--flagged' : ''}`}
      id={`fa-block-${block.id}`}
      tabIndex={-1}
      role="group"
      aria-labelledby={labelId}
    >
      <p className="fa-block__type" id={labelId}>
        {typeLabel} {index}
        {issues.length > 0 && (
          <span className="fa-visually-hidden">
            , {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </p>

      {block.type === 'heading' && (
        <>
          <div className="fa-headrow">
            <div className="fa-field">
              <label className="fa-label" htmlFor={`fa-h-${block.id}`}>
                Sub-heading text
              </label>
              <input
                id={`fa-h-${block.id}`}
                className="fa-input"
                value={block.text || ''}
                onChange={(e) => onChange({ text: e.target.value })}
                aria-describedby={warning ? `fa-skip-${block.id}` : undefined}
              />
            </div>
            <LevelSelect id={`fa-hl-${block.id}`} value={block.level} onChange={(level) => onChange({ level })} />
          </div>
          <SkipWarning id={`fa-skip-${block.id}`} text={warning} />
        </>
      )}

      {block.type === 'paragraph' && (
        <div className="fa-field">
          <label className="fa-visually-hidden" htmlFor={`fa-p-${block.id}`}>
            Paragraph {index} text
          </label>
          <textarea
            id={`fa-p-${block.id}`}
            className="fa-textarea"
            rows={rowsFor(block.text)}
            value={block.text || ''}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </div>
      )}

      {block.type === 'list' && <ListEditor block={block} onChange={onChange} />}

      {block.type === 'table' && <TableEditor block={block} onChange={onChange} labelId={labelId} />}

      {block.type === 'math' && (
        <>
          {(block.latex || block.text) && (
            <div>
              <p className="fa-label">Extracted expression</p>
              <p className="fa-mathsrc">{block.latex || block.text}</p>
            </div>
          )}
          <div className="fa-field">
            <label className="fa-label" htmlFor={`fa-m-${block.id}`}>
              Spoken text
            </label>
            <span className="fa-hint" id={`fa-mh-${block.id}`}>
              How a screen reader or read-aloud voice says this expression, in plain words.
            </span>
            <textarea
              id={`fa-m-${block.id}`}
              className="fa-textarea"
              rows={rowsFor(block.spoken, 2, 6)}
              value={block.spoken || ''}
              onChange={(e) => onChange({ spoken: e.target.value })}
              aria-describedby={`fa-mh-${block.id}`}
            />
          </div>
        </>
      )}

      {block.type === 'image' && (
        <div className="fa-imgmini">
          {safeImageSrc(block.src) && <img src={safeImageSrc(block.src)} alt="" />}
          <span className={`fa-badge fa-badge--${block.altStatus || 'missing'}`}>
            {ALT_STATUS_LABEL[block.altStatus] || 'Missing'}
          </span>
          <span className="fa-hint" style={{ flex: '1 1 12rem' }}>
            {block.altStatus === 'decorative'
              ? 'Hidden from screen readers.'
              : block.alt
                ? block.alt.length > 120
                  ? `${block.alt.slice(0, 120)}…`
                  : block.alt
                : 'No description yet.'}
          </span>
          <button type="button" className="fa-btn fa-btn--sm" onClick={() => onGoToImage(block.id)}>
            Review in image queue
          </button>
        </div>
      )}

      <IssueNotes issues={issues} />
    </div>
  );
});

const SectionEditor = memo(function SectionEditor({
  section,
  number,
  prevLevels,
  issuesByBlock,
  sectionIssues,
  onChangeSection,
  onChangeBlock,
  onGoToImage,
}) {
  const sid = section.id;
  const warning = section.heading ? skipWarning(section.level, prevLevels[`section:${sid}`]) : null;
  const counters = {};

  return (
    <section
      className="fa-card fa-sectioncard"
      id={`fa-section-${sid}`}
      tabIndex={-1}
      aria-labelledby={`fa-sectitle-${sid}`}
    >
      <div className="fa-sectioncard__head">
        <h3 id={`fa-sectitle-${sid}`}>
          Section {number}
          <span className="fa-visually-hidden">{section.heading ? `: ${section.heading}` : ', untitled'}</span>
        </h3>
        <div className="fa-headrow">
          <div className="fa-field">
            <label className="fa-label" htmlFor={`fa-sechead-${sid}`}>
              Section heading
            </label>
            <input
              id={`fa-sechead-${sid}`}
              className="fa-input"
              value={section.heading || ''}
              placeholder="Untitled opening section"
              onChange={(e) => onChangeSection(sid, { heading: e.target.value })}
              aria-describedby={[!section.heading ? `fa-secnote-${sid}` : null, warning ? `fa-secskip-${sid}` : null]
                .filter(Boolean)
                .join(' ') || undefined}
            />
          </div>
          <LevelSelect id={`fa-seclevel-${sid}`} value={section.level} onChange={(level) => onChangeSection(sid, { level })} />
        </div>
        {!section.heading && (
          <p className="fa-hint" id={`fa-secnote-${sid}`}>
            No heading is shown for this section. Add one if students should be able to jump to it.
          </p>
        )}
        <SkipWarning id={`fa-secskip-${sid}`} text={warning} />
        <IssueNotes issues={sectionIssues} />
      </div>
      <div className="fa-sectioncard__body">
        {section.blocks.length === 0 && <p className="fa-hint">This section has no content.</p>}
        {section.blocks.map((block) => {
          counters[block.type] = (counters[block.type] || 0) + 1;
          return (
            <BlockEditor
              key={block.id}
              block={block}
              index={counters[block.type]}
              prevLevel={prevLevels[block.id]}
              issues={issuesByBlock[block.id] || NO_ISSUES}
              onChangeBlock={onChangeBlock}
              onGoToImage={onGoToImage}
            />
          );
        })}
      </div>
    </section>
  );
});

export default function StructureEditor({ doc, report, onChangeDoc, onChangeSection, onChangeBlock, onGoToImage }) {
  const prevLevels = headingContext(doc);
  const issuesByBlock = {};
  const issuesBySection = {};
  const docIssues = [];
  for (const issue of report?.issues || []) {
    if (issue.blockId) (issuesByBlock[issue.blockId] ||= []).push(issue);
    else if (issue.sectionId) (issuesBySection[issue.sectionId] ||= []).push(issue);
    else docIssues.push(issue);
  }

  return (
    <>
      <div className="fa-docdetails" id="fa-docdetails" tabIndex={-1} role="group" aria-labelledby="fa-docdetails-title">
        <h3 id="fa-docdetails-title" className="fa-visually-hidden">
          Document details
        </h3>
        <div className="fa-field">
          <label className="fa-label" htmlFor="fa-doc-title">
            Document title
          </label>
          <input
            id="fa-doc-title"
            className="fa-input"
            value={doc.title || ''}
            onChange={(e) => onChangeDoc({ title: e.target.value })}
            aria-describedby="fa-doc-title-hint"
          />
          <span className="fa-hint" id="fa-doc-title-hint">
            Shown to students as the main (h1) heading.
          </span>
        </div>
        <div className="fa-field">
          <label className="fa-label" htmlFor="fa-doc-lang">
            Language code
          </label>
          <input
            id="fa-doc-lang"
            className="fa-input"
            value={doc.lang || ''}
            onChange={(e) => onChangeDoc({ lang: e.target.value.trim() })}
            aria-describedby="fa-doc-lang-hint"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="fa-hint" id="fa-doc-lang-hint">
            For example en, fr, es.
          </span>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <IssueNotes issues={docIssues} />
        </div>
      </div>

      {(doc.sections || []).map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          number={i + 1}
          prevLevels={prevLevels}
          issuesByBlock={issuesByBlock}
          sectionIssues={issuesBySection[section.id] || NO_ISSUES}
          onChangeSection={onChangeSection}
          onChangeBlock={onChangeBlock}
          onGoToImage={onGoToImage}
        />
      ))}
    </>
  );
}
