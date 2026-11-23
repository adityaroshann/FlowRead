import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Download, Pause, Play, SlidersHorizontal, Square, UserRound } from 'lucide-react';
import DocRenderer from '../shared/DocRenderer.jsx';
import { getDoc, saveDoc } from '../shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../shared/sampleDoc.js';
import { plainLanguage, summarizeSection } from '../shared/api.js';
import { getProfile, settingsForProfile, settingsToData, settingsToStyle } from '../shared/profiles.js';
import { exportAccessibleHtml } from '../shared/exportHtml.js';
import { readingMinutes, sectionLabel, sectionText, sectionWordCount, slugify } from '../shared/docModel.js';
import { loadPrefs, loadProgress, savePrefs, saveProgress } from './readerPrefs.js';
import { useWordSpeech } from './useWordSpeech.js';
import Modal from './Modal.jsx';
import ProfilePicker from './ProfilePicker.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import FocusLine from './FocusLine.jsx';
import './StudentReader.css';

const SUMMARY_UNAVAILABLE = "A summary isn't available right now.";

// ---------- small hooks ----------

const reducedQuery = '(prefers-reduced-motion: reduce)';
function subscribeReduced(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(reducedQuery);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}
function getReduced() {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(reducedQuery).matches;
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

// ---------- helpers ----------

function updateBlock(doc, blockId, patch) {
  return {
    ...doc,
    sections: doc.sections.map((s) =>
      s.blocks.some((b) => b.id === blockId)
        ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }
        : s,
    ),
  };
}

function updateSection(doc, sectionId, patch) {
  return { ...doc, sections: doc.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) };
}

function persist(doc) {
  try {
    saveDoc(doc);
  } catch {
    /* storage full/unavailable: keep the change for this visit */
  }
}

function speechQueue(sections, lang) {
  const q = [];
  for (const s of sections) {
    if (s.heading && s.heading.trim()) q.push({ id: `sec:${s.id}`, text: s.heading, lang });
    for (const b of s.blocks || []) {
      if (b.type === 'heading' || b.type === 'paragraph') q.push({ id: b.id, text: b.text, lang });
      else if (b.type === 'list') (b.items || []).forEach((t, i) => q.push({ id: `${b.id}:${i}`, text: t, lang }));
      else if (b.type === 'math') q.push({ id: b.id, text: b.spoken || b.text || '', lang });
    }
  }
  return q;
}

function speakingElement(blockId) {
  if (!blockId) return null;
  if (blockId.startsWith('sec:')) return document.getElementById(`h-${blockId.slice(4)}`);
  const m = /^(.*):(\d+)$/.exec(blockId);
  if (m) return document.getElementById(`blk-${m[1]}`)?.children?.[Number(m[2])] || null;
  return document.getElementById(`blk-${blockId}`);
}

function minutesLeftText(mins) {
  if (mins <= 0) return 'nearly done';
  return `about ${mins} min left`;
}

function downloadHtml(doc) {
  const html = exportAccessibleHtml(doc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(doc.title)}-accessible.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- components ----------

function NotFound({ docId, onOpenSample }) {
  useEffect(() => {
    document.title = 'Document not found – FlowRead Access';
  }, []);
  return (
    <div className="fra-reader fra-theme" data-fra-theme="light">
      <a className="fra-skip" href="#content">
        Skip to content
      </a>
      <header className="fra-topbar">
        <p className="fra-brand">FlowRead Access</p>
      </header>
      <main id="content" tabIndex={-1} className="fra-main fra-notfound">
        <h1>We couldn’t find that document</h1>
        <p>
          There is no document called <code>{docId}</code> saved in this browser. Documents in this prototype are stored
          on the device that converted them, so a link may not open on another computer.
        </p>
        <div className="fra-row">
          <button type="button" className="fra-btn fra-btn-primary" onClick={onOpenSample}>
            Open the sample document
          </button>
          <Link className="fra-btn" to="/access">
            Go to the accessibility office workspace
          </Link>
        </div>
      </main>
    </div>
  );
}

function SummaryBox({ section, state, onFetch }) {
  const text = section.summary || state?.text;
  return (
    <div className="fra-summary" aria-live="polite">
      <p className="fra-summary-label">
        <strong>In this section</strong>
      </p>
      {text ? (
        <>
          <p className="fra-summary-text">{text}</p>
          {!section.summary && <p className="fra-summary-note">AI-generated summary. The full text below is the source.</p>}
        </>
      ) : state?.status === 'loading' ? (
        <p className="fra-status">Writing a short summary…</p>
      ) : (
        <>
          {state?.status === 'error' && <p className="fra-status fra-status-error">{SUMMARY_UNAVAILABLE}</p>}
          <button type="button" className="fra-btn fra-btn-small" onClick={() => onFetch(section)}>
            {state?.status === 'error' ? 'Try the summary again' : 'Get a short summary'}
            <span className="fra-sr-only"> of “{sectionLabel(section, 0)}”</span>
          </button>
        </>
      )}
    </div>
  );
}

function ReaderView({ docId }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(() => (docId === SAMPLE_DOC_ID ? seedSampleDoc() : getDoc(docId)));
  const [prefs, setPrefs] = useState(loadPrefs);
  const [pickerOpen, setPickerOpen] = useState(() => !prefs.chosen);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [pageChoice, setPageChoice] = useState('');
  const sectionCount = doc?.sections?.length || 0;
  const [sectionIndex, setSectionIndex] = useState(() => {
    const saved = loadProgress(docId);
    return saved != null && saved >= 0 && saved < sectionCount ? saved : 0;
  });
  const [resumed] = useState(() => {
    const saved = loadProgress(docId);
    return saved != null && saved > 0 && saved < sectionCount;
  });

  const settings = prefs.settings;
  const profile = getProfile(prefs.profileId);
  const osReduced = usePrefersReducedMotion();
  const noMotion = settings.noMotion || osReduced;
  const speech = useWordSpeech();
  const pickerTitle = useId();
  const pickerDesc = useId();
  const settingsTitle = useId();

  const sections = useMemo(() => doc?.sections || [], [doc]);
  const focusMode = !!settings.focusMode && sections.length > 0;
  const current = Math.min(sectionIndex, Math.max(0, sections.length - 1));
  const shown = focusMode ? [sections[current]] : sections;

  const wordsPerSection = useMemo(() => sections.map(sectionWordCount), [sections]);
  const totalMinutes = readingMinutes(wordsPerSection.reduce((a, b) => a + b, 0));
  const minutesLeft = readingMinutes(wordsPerSection.slice(current).reduce((a, b) => a + b, 0));
  const pages = useMemo(() => {
    const out = [];
    sections.forEach((s, si) =>
      (s.blocks || []).forEach((b) => {
        if (b.type === 'pageMarker') out.push({ n: b.n, blockId: b.id, sectionIndex: si });
      }),
    );
    return out;
  }, [sections]);

  // ---- persistence & document-level effects ----
  useEffect(() => {
    if (prefs.chosen) savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (doc && focusMode) saveProgress(doc.id, current);
  }, [doc, focusMode, current]);

  useEffect(() => {
    if (doc) document.title = `${doc.title || 'Untitled document'} – FlowRead Access`;
  }, [doc]);

  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = noMotion ? 'auto' : prev;
    return () => {
      el.style.scrollBehavior = prev;
    };
  }, [noMotion]);

  // Initial announcement (screen-reader profile or resume)
  useEffect(() => {
    if (!doc) return undefined;
    const parts = [];
    if (settings.announceSections) parts.push(`${sections.length} sections.`);
    if (focusMode && resumed) parts.push(`Resumed at section ${current + 1} of ${sections.length}.`);
    if (!parts.length) return undefined;
    const t = setTimeout(() => setAnnouncement(parts.join(' ')), 700);
    return () => clearTimeout(t);
    // run once per mount/profile change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.announceSections, focusMode]);

  // Keep the word being read in view
  const speakingId = speech.highlight?.blockId;
  useEffect(() => {
    if (!speakingId) return;
    const el = speakingElement(speakingId);
    el?.scrollIntoView?.({ block: 'nearest', behavior: noMotion ? 'auto' : 'smooth' });
  }, [speakingId, noMotion]);

  const stopSpeech = speech.stop;

  // ---- actions ----
  const focusSectionStart = useCallback(
    (sec) => {
      requestAnimationFrame(() => {
        const heading = sec && document.getElementById(`h-${sec.id}`);
        const target = heading && heading.tagName !== 'SPAN' ? heading : document.getElementById('fra-doc-title');
        target?.focus({ preventScroll: true });
        const top = (focusMode ? document.getElementById('content') : target)?.getBoundingClientRect().top ?? 0;
        window.scrollTo({ top: Math.max(0, window.scrollY + top - 16), behavior: noMotion ? 'auto' : 'smooth' });
      });
    },
    [focusMode, noMotion],
  );

  const goTo = useCallback(
    (i) => {
      if (i < 0 || i >= sections.length) return;
      stopSpeech();
      setSectionIndex(i);
      const sec = sections[i];
      const left = readingMinutes(wordsPerSection.slice(i).reduce((a, b) => a + b, 0));
      setAnnouncement(`Section ${i + 1} of ${sections.length}: ${sectionLabel(sec, i)}. ${minutesLeftText(left)}.`);
      focusSectionStart(sec);
    },
    [sections, wordsPerSection, stopSpeech, focusSectionStart],
  );

  const onTocClick = (e, i) => {
    setTocOpen(false);
    if (focusMode) {
      e.preventDefault();
      goTo(i);
    }
  };

  const goToPage = (e) => {
    e.preventDefault();
    const p = pages.find((x) => String(x.blockId) === pageChoice);
    if (!p) return;
    if (focusMode && p.sectionIndex !== current) {
      stopSpeech();
      setSectionIndex(p.sectionIndex);
    }
    setAnnouncement(`Page ${p.n}.`);
    requestAnimationFrame(() => {
      const el = document.getElementById(`page-${p.blockId}`);
      if (!el) return;
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'start', behavior: noMotion ? 'auto' : 'smooth' });
    });
  };

  const requestPlain = useCallback(
    async (block, section) => {
      const plain = await plainLanguage(block.text, section?.heading || doc?.title || '');
      setDoc((d) => {
        const next = updateBlock(d, block.id, { plain });
        persist(next);
        return next;
      });
      return plain;
    },
    [doc?.title],
  );

  const fetchSummary = useCallback(async (section) => {
    setSummaries((s) => ({ ...s, [section.id]: { status: 'loading' } }));
    try {
      const summary = await summarizeSection(section.heading || '', sectionText(section));
      setSummaries((s) => ({ ...s, [section.id]: { status: 'done', text: summary } }));
      setDoc((d) => {
        const next = updateSection(d, section.id, { summary });
        persist(next);
        return next;
      });
    } catch {
      setSummaries((s) => ({ ...s, [section.id]: { status: 'error' } }));
    }
  }, []);

  const chooseProfile = (id) => {
    setPrefs((p) => ({
      profileId: id,
      settings: p.chosen && p.profileId === id ? p.settings : settingsForProfile(id),
      chosen: true,
    }));
    setPickerOpen(false);
    setAnnouncement(`${getProfile(id).label} profile on.`);
  };

  const closePicker = () => {
    setPickerOpen(false);
    // Closing on first visit (Esc) keeps Standard and stops asking.
    setPrefs((p) => (p.chosen ? p : { ...p, chosen: true }));
  };

  const readAloud = () => {
    if (speech.status === 'speaking') speech.pause();
    else if (speech.status === 'paused') speech.resume();
    else speech.speak(speechQueue(shown, doc?.lang));
  };

  if (!doc) {
    return (
      <NotFound
        docId={docId}
        onOpenSample={() => {
          seedSampleDoc();
          navigate(`/read/${SAMPLE_DOC_ID}`);
        }}
      />
    );
  }

  const minimal = settings.minimalChrome;
  const showSpeech = settings.readAloud && speech.supported;

  const meta = (
    <div className="fra-meta">
      <p className="fra-meta-line">
        {sections.length} {sections.length === 1 ? 'section' : 'sections'} · about {totalMinutes} min read
        {doc.sourceFile && !minimal ? <> · from {doc.sourceFile}</> : null}
      </p>
      {focusMode && (
        <div className="fra-progress">
          <p className="fra-progress-text" id="fra-progress-text">
            Section {current + 1} of {sections.length} · {minutesLeftText(minutesLeft)}
          </p>
          {!minimal && (
            <div className="fra-progress-bar" aria-hidden="true">
              <span style={{ width: `${((current + 1) / sections.length) * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {showSpeech && (
        <div className="fra-row fra-speech" role="group" aria-label="Read aloud">
          <button type="button" className="fra-btn" onClick={readAloud} aria-pressed={speech.status === 'speaking'}>
            {!minimal && (speech.status === 'speaking' ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />)}
            {speech.status === 'speaking'
              ? 'Pause reading'
              : speech.status === 'paused'
                ? 'Resume reading'
                : focusMode
                  ? 'Read this section aloud'
                  : 'Read aloud from the start'}
          </button>
          {speech.status !== 'idle' && (
            <button type="button" className="fra-btn" onClick={speech.stop}>
              {!minimal && <Square aria-hidden="true" size={16} />}
              Stop
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderBeforeBlocks = (sec) => {
    const parts = [];
    if (settings.summaries) {
      parts.push(<SummaryBox key="sum" section={sec} state={summaries[sec.id]} onFetch={fetchSummary} />);
    }
    if (showSpeech && !focusMode) {
      parts.push(
        <div key="read" className="fra-section-tools">
          <button
            type="button"
            className="fra-btn fra-btn-small"
            onClick={() => speech.speak(speechQueue([sec], doc.lang))}
          >
            Read this section aloud
            <span className="fra-sr-only">: {sectionLabel(sec, sections.indexOf(sec))}</span>
          </button>
        </div>,
      );
    }
    return parts.length ? parts : null;
  };

  return (
    <div
      className={`fra-reader fra-theme${minimal ? ' fra-minimal' : ''}`}
      lang={doc.lang || 'en'}
      style={settingsToStyle(settings)}
      {...settingsToData({ ...settings, noMotion })}
    >
      <a className="fra-skip" href="#content">
        Skip to content
      </a>

      <header className="fra-topbar">
        <p className="fra-brand">
          {!minimal && <BookOpen aria-hidden="true" size={20} />}
          FlowRead Access
        </p>
        <div className="fra-toolbar" role="group" aria-label="Reading options">
          <button type="button" className="fra-btn" aria-haspopup="dialog" onClick={() => setPickerOpen(true)}>
            {!minimal && <UserRound aria-hidden="true" size={18} />}
            Profile: {profile.label}
          </button>
          <button type="button" className="fra-btn" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>
            {!minimal && <SlidersHorizontal aria-hidden="true" size={18} />}
            Adjust reading
          </button>
          <button type="button" className="fra-btn" onClick={() => downloadHtml(doc)}>
            {!minimal && <Download aria-hidden="true" size={18} />}
            Download accessible copy
          </button>
        </div>
      </header>

      <div className="fra-layout">
        <nav className="fra-toc" aria-label="Table of contents">
          <button
            type="button"
            className="fra-btn fra-toc-toggle"
            aria-expanded={tocOpen}
            aria-controls="fra-toc-list"
            onClick={() => setTocOpen((o) => !o)}
          >
            Contents ({sections.length} sections)
          </button>
          <div className={`fra-toc-body${tocOpen ? ' is-open' : ''}`} id="fra-toc-list">
            <p className="fra-toc-label" aria-hidden="true">
              Contents
            </p>
            <ol className="fra-toc-list">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#sec-${s.id}`}
                    aria-current={focusMode && i === current ? 'step' : undefined}
                    onClick={(e) => onTocClick(e, i)}
                  >
                    {sectionLabel(s, i)}
                  </a>
                </li>
              ))}
            </ol>
            {pages.length > 0 && (
              <form className="fra-pagejump" onSubmit={goToPage}>
                <label htmlFor="fra-page-select">Go to printed page</label>
                <div className="fra-row">
                  <select
                    id="fra-page-select"
                    className="fra-select"
                    value={pageChoice}
                    onChange={(e) => setPageChoice(e.target.value)}
                  >
                    <option value="">Choose a page</option>
                    {pages.map((p) => (
                      <option key={p.blockId} value={p.blockId}>
                        Page {p.n}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="fra-btn">
                    Go
                  </button>
                </div>
              </form>
            )}
          </div>
        </nav>

        <main id="content" tabIndex={-1} className="fra-main">
          <DocRenderer
            doc={doc}
            sections={shown}
            profile={settings}
            onRequestPlain={requestPlain}
            highlight={speech.highlight}
            titleId="fra-doc-title"
            afterTitle={meta}
            renderBeforeBlocks={renderBeforeBlocks}
          />

          {focusMode && (
            <nav className="fra-stepper" aria-label="Section navigation">
              <button type="button" className="fra-btn" onClick={() => goTo(current - 1)} disabled={current === 0}>
                {!minimal && <ChevronLeft aria-hidden="true" size={20} />}
                Back
                {current > 0 && <span className="fra-sr-only">: {sectionLabel(sections[current - 1], current - 1)}</span>}
              </button>
              <span className="fra-stepper-count" aria-hidden="true">
                {current + 1} / {sections.length}
              </span>
              {current < sections.length - 1 ? (
                <button type="button" className="fra-btn fra-btn-primary" onClick={() => goTo(current + 1)}>
                  Next
                  <span className="fra-sr-only">: {sectionLabel(sections[current + 1], current + 1)}</span>
                  {!minimal && <ChevronRight aria-hidden="true" size={20} />}
                </button>
              ) : (
                <span className="fra-done">You’ve reached the end.</span>
              )}
            </nav>
          )}
        </main>
      </div>

      <div className="fra-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <FocusLine active={settings.focusLine} bandPx={Math.round(96 * (settings.textScale || 1))} />

      <Modal open={pickerOpen} onClose={closePicker} labelledBy={pickerTitle} describedBy={pickerDesc} className="fra-dialog-picker">
        <ProfilePicker
          currentId={prefs.profileId}
          firstVisit={!prefs.chosen}
          onChoose={chooseProfile}
          onCancel={closePicker}
          titleId={pickerTitle}
          descId={pickerDesc}
        />
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} labelledBy={settingsTitle} className="fra-dialog-sheet">
        <SettingsSheet
          settings={settings}
          profileId={prefs.profileId}
          titleId={settingsTitle}
          onChange={(next) => setPrefs((p) => ({ ...p, settings: next, chosen: true }))}
          onReset={() => setPrefs((p) => ({ ...p, settings: settingsForProfile(p.profileId), chosen: true }))}
          onDone={() => setSettingsOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default function StudentReader() {
  const { id } = useParams();
  return <ReaderView key={id} docId={id} />;
}
