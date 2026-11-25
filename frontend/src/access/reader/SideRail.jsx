import { useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Check, Layers, LoaderCircle, Sparkles } from 'lucide-react';
import { sectionLabel } from '@flowread/core/docModel.js';
import AiBadge from '../shared/AiBadge.jsx';

function Contents({ sections, current, furthest, pct, minutesLeft, onGo, pages, onGoPage, kind }) {
  const [page, setPage] = useState('');
  const word = kind === 'pptx' ? 'slide' : 'page';
  return (
    <div className="rail-contents">
      <div className="rail-progress">
        <div className="meter" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="rail-progress-text">
          {pct}% read, {minutesLeft > 0 ? `about ${minutesLeft} min left` : 'nearly done'}
        </p>
      </div>
      <nav aria-label="Contents">
        <ol className="rail-toc">
          {sections.map((s, i) => {
            const status = i === current ? 'current' : i < furthest ? 'done' : 'todo';
            return (
              <li key={s.id} className={`rail-toc-item is-${status}`}>
                <a
                  href={`#sec-${s.id}`}
                  aria-current={i === current ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onGo(i);
                  }}
                >
                  <span className="rail-toc-dot" aria-hidden="true">
                    {status === 'done' && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="rail-toc-text">{sectionLabel(s, i)}</span>
                  {status === 'done' && <span className="sr-only"> (read)</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      {pages.length > 0 && (
        <form
          className="rail-page"
          onSubmit={(e) => {
            e.preventDefault();
            onGoPage(Number(page));
          }}
        >
          <label htmlFor="rail-page-input" className="label">
            Go to {word} in the original
          </label>
          <div className="rail-page-row">
            <input
              id="rail-page-input"
              className="input"
              type="number"
              inputMode="numeric"
              min={pages[0].n}
              max={pages[pages.length - 1].n}
              value={page}
              onChange={(e) => setPage(e.target.value)}
              placeholder={`${pages[0].n}–${pages[pages.length - 1].n}`}
            />
            <button type="submit" className="btn">
              Go
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AiDidLine({ ai }) {
  if (!ai) return null;
  const parts = [];
  if (ai.imagesDescribed) parts.push(`described ${ai.imagesDescribed} ${ai.imagesDescribed === 1 ? 'image' : 'images'}`);
  if (ai.pagesRead) parts.push(`read ${ai.pagesRead} scanned ${ai.pagesRead === 1 ? 'page' : 'pages'}`);
  if (ai.mathSpoken) parts.push(`made ${ai.mathSpoken} ${ai.mathSpoken === 1 ? 'formula' : 'formulas'} speakable`);
  if (!parts.length) return null;
  const text = parts.join(', ');
  return (
    <p className="rail-ai-did">
      <Sparkles size={13} aria-hidden="true" /> While converting, AI {text}.
    </p>
  );
}

function SummaryPanel({ doc, section, sectionIndex, sectionSummary, onSectionSummary, docSummary, onDocSummary, onFlashcards }) {
  const cards = doc.flashcards?.cards?.length || 0;
  const secText = section?.summary || (sectionSummary?.status === 'done' ? sectionSummary.text : '');
  return (
    <div className="rail-summary">
      <section aria-labelledby="sum-doc">
        <h2 id="sum-doc" className="rail-h">
          Whole document {doc.summary && <AiBadge what="This summary" />}
        </h2>
        {doc.summary ? (
          <p className="rail-sum-text">{doc.summary}</p>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onDocSummary} disabled={docSummary?.status === 'loading'}>
            {docSummary?.status === 'loading' ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
            {docSummary?.status === 'loading' ? 'Summarising…' : 'Summarise the document'}
          </button>
        )}
        {docSummary?.status === 'error' && <p className="rail-sum-err" role="alert">A summary isn’t available right now.</p>}
      </section>

      {section && (
        <section aria-labelledby="sum-sec">
          <h2 id="sum-sec" className="rail-h">
            This section: {sectionLabel(section, sectionIndex)} {secText && <AiBadge what="This summary" />}
          </h2>
          {secText ? (
            <p className="rail-sum-text">{secText}</p>
          ) : (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSectionSummary(section)}
              disabled={sectionSummary?.status === 'loading'}
            >
              {sectionSummary?.status === 'loading' ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {sectionSummary?.status === 'loading' ? 'Summarising…' : 'Summarise this section'}
            </button>
          )}
          {sectionSummary?.status === 'error' && <p className="rail-sum-err" role="alert">A summary isn’t available right now.</p>}
        </section>
      )}

      <section aria-labelledby="sum-cards" className="rail-cards">
        <h2 id="sum-cards" className="rail-h">
          Check what you remember
        </h2>
        <button type="button" className="btn btn-sm btn-primary" onClick={onFlashcards}>
          <Layers size={14} aria-hidden="true" /> {cards ? `Practise ${cards} flashcards` : 'Make flashcards'}
        </button>
      </section>

      <AiDidLine ai={doc.ai} />
    </div>
  );
}

/** Contents and summaries. Rendered in the side rail or in a sheet on small screens. */
export default function SideRail({ tab, onTabChange, summary, ...contents }) {
  return (
    <Tabs className="rail-tabs" selectedKey={tab} onSelectionChange={onTabChange}>
      <TabList aria-label="Reader panels" className="tabs-list rail-tablist">
        <Tab id="contents" className="tab">
          Contents
        </Tab>
        <Tab id="summary" className="tab">
          Summary
        </Tab>
      </TabList>
      <TabPanel id="contents" className="tab-panel rail-panel">
        <Contents {...contents} />
      </TabPanel>
      <TabPanel id="summary" className="tab-panel rail-panel">
        <SummaryPanel {...summary} />
      </TabPanel>
    </Tabs>
  );
}
