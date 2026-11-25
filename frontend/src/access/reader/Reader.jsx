import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Dialog, Heading, Modal, ModalOverlay, Radio, RadioGroup, Label } from 'react-aria-components';
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Command,
  Download,
  FilePenLine,
  FileText,
  Pause,
  Play,
  PanelLeft,
  Square,
  Type,
  UserRound,
  Volume2,
  X,
  Eye,
  Sparkles,
  BookA,
  Copy,
  Palette,
  Bold,
  Focus,
  ListChecks,
  Minus,
} from 'lucide-react';
import DocRenderer from '../shared/DocRenderer.jsx';
import { getDoc, getSource, saveDoc } from '../shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../shared/sampleDoc.js';
import { plainLanguage, summarizeSection } from '../shared/api.js';
import { PROFILES, PROFILE_ORDER, THEMES, getProfile, settingsToData, settingsToStyle } from '@flowread/core/profiles.js';
import { readingMinutes, sectionLabel, sectionText, sectionWordCount } from '@flowread/core/docModel.js';
import { chooseProfile, loadProgress, saveProgress, setPrefs, updateSettings, usePrefs } from './readerPrefs.js';
import { useWordSpeech } from './useWordSpeech.js';
import { BrandMark } from '../../app/Brand.jsx';
import Toast from '../../app/Toast.jsx';
import FocusLine from './FocusLine.jsx';
import SideRail from './SideRail.jsx';
import CommandPalette from './CommandPalette.jsx';
import SelectionPopover from './SelectionPopover.jsx';
import DownloadDialog from './DownloadDialog.jsx';
import { THEME_NAMES } from './labels.js';
import './reader.css';

const OriginalPane = lazy(() => import('./OriginalPane.jsx'));

const SUMMARY_UNAVAILABLE = "A summary isn't available right now.";
const RAIL_KEY = 'flowread:rail-open';

// ---------- small hooks ----------

function useMedia(query) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function readRail() {
  try {
    return window.localStorage.getItem(RAIL_KEY) !== '0';
  } catch {
    return true;
  }
}

// ---------- helpers ----------

function updateBlock(doc, blockId, patch) {
  return {
    ...doc,
    sections: doc.sections.map((s) =>
      s.blocks.some((b) => b.id === blockId) ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) } : s,
    ),
  };
}

function updateSection(doc, sectionId, patch) {
  return { ...doc, sections: doc.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) };
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
  return mins <= 0 ? 'nearly done' : `about ${mins} min left`;
}

/** Nearest page marker at or before the start of section i. */
function pageForSection(sections, i) {
  for (let k = i; k >= 0; k -= 1) {
    const blocks = sections[k]?.blocks || [];
    if (k === i) {
      const first = blocks.find((b) => b.type === 'pageMarker');
      if (first) return first.n;
    } else {
      for (let j = blocks.length - 1; j >= 0; j -= 1) if (blocks[j].type === 'pageMarker') return blocks[j].n;
    }
  }
  return 1;
}

// ---------- pieces ----------

function SummaryBox({ section, state, onFetch, index }) {
  const text = section.summary || state?.text;
  return (
    <div className="rd-summary" aria-live="polite">
      <p className="rd-summary-label">In this section</p>
      {text ? (
        <>
          <p className="rd-summary-text">{text}</p>
          {!section.summary && <p className="rd-summary-note">Summary written by AI. The full text below is the source.</p>}
        </>
      ) : state?.status === 'loading' ? (
        <p className="rd-summary-text rd-muted">Writing a short summary…</p>
      ) : (
        <>
          {state?.status === 'error' && <p className="rd-summary-text rd-error">{SUMMARY_UNAVAILABLE}</p>}
          <button type="button" className="btn btn-sm" onClick={() => onFetch(section)}>
            {state?.status === 'error' ? 'Try again' : 'Get a short summary'}
            <span className="sr-only"> of “{sectionLabel(section, index)}”</span>
          </button>
        </>
      )}
    </div>
  );
}

function NotFound({ docId }) {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = 'Document not found · FlowRead';
  }, []);
  return (
    <div className="rd rd-empty">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="rd-top">
        <Link to="/library" className="rd-home">
          <BrandMark size={22} />
          <span>Library</span>
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="rd-notfound">
        <h1 className="display">We couldn’t find that document</h1>
        <p>
          Nothing called <code>{docId}</code> is saved in this browser. Documents are kept on the device that imported them, so a
          link from another computer won’t open here.
        </p>
        <div className="rd-row">
          <Link className="btn btn-primary" to="/">
            Import a document
          </Link>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await seedSampleDoc();
              navigate(`/read/${SAMPLE_DOC_ID}`);
            }}
          >
            Open the sample handout
          </button>
        </div>
      </main>
    </div>
  );
}

function FirstVisit({ onDismiss }) {
  return (
    <div className="rd-first" role="region" aria-label="Choose a reading profile">
      <RadioGroup
        className="rd-first-group"
        orientation="horizontal"
        onChange={(id) => {
          chooseProfile(id);
          onDismiss();
        }}
      >
        <Label className="rd-first-label">How would you like to read? You can change this any time.</Label>
        <div className="seg">
          {PROFILE_ORDER.map((id) => (
            <Radio key={id} value={id} className="seg-item">
              {PROFILES[id].label}
            </Radio>
          ))}
        </div>
      </RadioGroup>
      <button type="button" className="btn btn-sm btn-quiet" onClick={onDismiss}>
        Not now
      </button>
    </div>
  );
}

// ---------- the reader ----------

function ReaderView({ initialDoc }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(initialDoc);
  const prefs = usePrefs();
  const settings = prefs.settings;
  const profile = getProfile(prefs.profileId);
  const wide = useMedia('(min-width: 64em)');
  const osReduced = useMedia('(prefers-reduced-motion: reduce)');
  const noMotion = settings.noMotion || osReduced || prefs.reduceMotion;
  const speech = useWordSpeech();
  const mainRef = useRef(null);
  const selRef = useRef(null);

  const sections = useMemo(() => doc.sections || [], [doc]);
  const n = sections.length;
  const saved = useMemo(() => loadProgress(doc.id), [doc.id]);

  const [railOpen, setRailOpen] = useState(readRail);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [railTab, setRailTab] = useState('contents');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSel, setPaletteSel] = useState(false);
  const [download, setDownload] = useState({ open: false, format: 'pdf' });
  const [source, setSource] = useState(null);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [toast, setToast] = useState(null);
  const [firstVisit, setFirstVisit] = useState(!prefs.chosen);
  const [sectionIndex, setSectionIndex] = useState(() => (saved && saved.section < n ? saved.section : 0));
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [furthest, setFurthest] = useState(() => (saved ? Math.min(n, saved.section) : 0));
  const [atEnd, setAtEnd] = useState(false);
  const [resume, setResume] = useState(() => (saved && saved.section > 0 && saved.section < n ? saved.section : null));

  const focusMode = !!settings.focusMode && n > 0;
  const current = focusMode ? Math.min(sectionIndex, Math.max(0, n - 1)) : visibleIndex;
  const shown = useMemo(() => (focusMode ? [sections[current]] : sections), [focusMode, sections, current]);
  const minimal = settings.minimalChrome;
  const showSpeech = settings.readAloud && speech.supported;

  const wordsPer = useMemo(() => sections.map(sectionWordCount), [sections]);
  const totalMinutes = readingMinutes(wordsPer.reduce((a, b) => a + b, 0));
  const minutesLeft = readingMinutes(wordsPer.slice(current).reduce((a, b) => a + b, 0));
  const pct = n ? (atEnd ? 100 : Math.round((Math.max(furthest, current) / n) * 100)) : 0;

  const pages = useMemo(() => {
    const out = [];
    sections.forEach((s, si) =>
      (s.blocks || []).forEach((b) => {
        if (b.type === 'pageMarker') out.push({ n: b.n, blockId: b.id, sectionIndex: si });
      }),
    );
    return out;
  }, [sections]);

  // ---- persistence ----
  const persist = useCallback((next) => {
    saveDoc({ ...next, updatedAt: next.updatedAt }).catch(() => {});
  }, []);

  useEffect(() => {
    document.title = `${doc.title || 'Untitled document'} · FlowRead`;
  }, [doc.title]);

  useEffect(() => {
    let alive = true;
    getSource(doc.id).then((b) => {
      if (alive && b && (b.type === 'application/pdf' || /\.pdf$/i.test(doc.sourceFile || ''))) setSource(b);
    });
    return () => {
      alive = false;
    };
  }, [doc.id, doc.sourceFile]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, railOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [railOpen]);

  useEffect(() => {
    if (n) saveProgress(doc.id, current, pct);
  }, [doc.id, current, pct, n]);

  // ---- scroll position (continuous mode) ----
  useEffect(() => {
    if (focusMode || typeof IntersectionObserver === 'undefined') return undefined;
    const els = [...document.querySelectorAll('.rd-doc .fra-section')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = Number(e.target.dataset.sectionIndex);
            if (Number.isFinite(i)) {
              setVisibleIndex(i);
              setFurthest((f) => Math.max(f, i));
            }
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    const end = document.getElementById('rd-end');
    const endIo = new IntersectionObserver(([e]) => e.isIntersecting && setAtEnd(true));
    if (end) endIo.observe(end);
    return () => {
      io.disconnect();
      endIo.disconnect();
    };
  }, [focusMode, sections]);

  // Keep the word being read in view
  const speakingId = speech.highlight?.blockId;
  useEffect(() => {
    if (!speakingId) return;
    speakingElement(speakingId)?.scrollIntoView?.({ block: 'nearest', behavior: noMotion ? 'auto' : 'smooth' });
  }, [speakingId, noMotion]);

  useEffect(() => {
    if (!settings.announceSections) return undefined;
    const t = setTimeout(() => setAnnouncement(`${n} sections. About ${totalMinutes} minutes to read.`), 800);
    return () => clearTimeout(t);
  }, [settings.announceSections, n, totalMinutes]);

  // ---- navigation ----
  const focusHeading = useCallback(
    (i) => {
      requestAnimationFrame(() => {
        const sec = sections[i];
        const h = sec && document.getElementById(`h-${sec.id}`);
        const target = h && h.tagName !== 'SPAN' ? h : document.getElementById('rd-title');
        target?.focus({ preventScroll: true });
        const box = focusMode ? document.getElementById('main') : document.getElementById(`sec-${sec?.id}`);
        box?.scrollIntoView({ block: 'start', behavior: noMotion ? 'auto' : 'smooth' });
      });
    },
    [sections, focusMode, noMotion],
  );

  const stopSpeech = speech.stop;
  const goTo = useCallback(
    (i) => {
      if (i < 0 || i >= n) return;
      stopSpeech();
      setSheetOpen(false);
      setResume(null);
      if (focusMode) setSectionIndex(i);
      else setVisibleIndex(i);
      setFurthest((f) => Math.max(f, i));
      const left = readingMinutes(wordsPer.slice(i).reduce((a, b) => a + b, 0));
      setAnnouncement(`Section ${i + 1} of ${n}: ${sectionLabel(sections[i], i)}. ${minutesLeftText(left)}.`);
      focusHeading(i);
    },
    [n, focusMode, wordsPer, sections, stopSpeech, focusHeading],
  );

  const goToPage = useCallback(
    (num) => {
      if (!pages.length || !Number.isFinite(num)) return;
      const p = [...pages].reverse().find((x) => x.n <= num) || pages[0];
      setSheetOpen(false);
      if (focusMode) setSectionIndex(p.sectionIndex);
      setAnnouncement(`${doc.source?.kind === 'pptx' ? 'Slide' : 'Page'} ${p.n}.`);
      setTimeout(() => {
        const el = document.getElementById(`page-${p.blockId}`);
        if (!el) return;
        el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'start', behavior: noMotion ? 'auto' : 'smooth' });
      }, 30);
    },
    [pages, focusMode, noMotion, doc.source?.kind],
  );

  const finish = () => {
    setAtEnd(true);
    setAnnouncement('You’ve finished this document.');
  };

  // ---- AI helpers ----
  const requestPlain = useCallback(
    async (block, section) => {
      const plain = await plainLanguage(block.text, section?.heading || doc.title || '');
      setDoc((d) => {
        const next = updateBlock(d, block.id, { plain });
        persist(next);
        return next;
      });
      return plain;
    },
    [doc.title, persist],
  );

  const fetchSummary = useCallback(
    async (section) => {
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
    },
    [persist],
  );

  // ---- read aloud ----
  const readFrom = useCallback(
    (blockId) => {
      const q = speechQueue(shown, doc.lang);
      const idx = q.findIndex((it) => it.id === blockId || it.id.startsWith(`${blockId}:`));
      speech.speak(idx >= 0 ? q.slice(idx) : q);
    },
    [shown, doc.lang, speech],
  );

  const readCurrent = useCallback(() => {
    if (speech.status === 'speaking') return speech.pause();
    if (speech.status === 'paused') return speech.resume();
    const sec = sections[current];
    speech.speak(speechQueue(focusMode ? shown : sections.slice(current), doc.lang));
    if (sec) setAnnouncement(`Reading from ${sectionLabel(sec, current)}.`);
    return undefined;
  }, [speech, sections, current, focusMode, shown, doc.lang]);

  const speakText = useCallback((text) => speech.speak([{ id: 'selection', text, lang: doc.lang }]), [speech, doc.lang]);

  // ---- shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => {
          if (!o) setPaletteSel(!!selRef.current?.hasSelection());
          return !o;
        });
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!selRef.current?.open()) setAnnouncement('Select some text in the document first.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openRail = useCallback(
    (tab) => {
      setRailTab(tab);
      if (wide) setRailOpen(true);
      else setSheetOpen(true);
    },
    [wide],
  );
  const runSelection = (kind) => {
    const text = window.getSelection?.()?.toString() || '';
    if (kind === 'tools') selRef.current?.open();
    else if (kind === 'read') speakText(text);
    else if (kind === 'copy') navigator.clipboard?.writeText(text).catch(() => {});
  };
  const openPalette = useCallback(() => {
    setPaletteSel(!!selRef.current?.hasSelection());
    setPaletteOpen(true);
  }, []);

  // ---- command palette ----
  const hasSelection = paletteOpen && paletteSel;
  const groups = useMemo(() => {
    const toggle = (key, label, icon) => ({
      id: `toggle-${key}`,
      label: `${settings[key] ? 'Turn off' : 'Turn on'} ${label}`,
      icon,
      run: () => {
        updateSettings({ [key]: !settings[key] });
        setAnnouncement(`${label} ${settings[key] ? 'off' : 'on'}.`);
      },
    });
    const g = [];
    if (hasSelection) {
      g.push({
        id: 'selection',
        title: 'Selected text',
        items: [
          { id: 'sel-tools', label: 'Explain, define or read the selection', icon: Sparkles, sel: 'tools' },
          { id: 'sel-read', label: 'Read the selection aloud', icon: Volume2, sel: 'read' },
          { id: 'sel-copy', label: 'Copy the selection', icon: Copy, sel: 'copy' },
          { id: 'sel-define', label: 'Define the selected word', icon: BookA, sel: 'tools' },
        ],
      });
    }
    g.push({
      id: 'sections',
      title: 'Go to section',
      items: sections.map((s, i) => ({
        id: `go-${s.id}`,
        label: sectionLabel(s, i),
        hint: i === current ? 'You are here' : `${i + 1} of ${n}`,
        keywords: 'section go jump',
        run: () => goTo(i),
      })),
    });
    g.push({
      id: 'actions',
      title: 'Actions',
      items: [
        ...(showSpeech
          ? [
              {
                id: 'read',
                label: speech.status === 'speaking' ? 'Pause reading aloud' : 'Read aloud from this section',
                icon: speech.status === 'speaking' ? Pause : Play,
                run: readCurrent,
              },
            ]
          : []),
        ...(speech.status !== 'idle' ? [{ id: 'stop', label: 'Stop reading aloud', icon: Square, run: speech.stop }] : []),
        { id: 'dl-pdf', label: 'Download PDF', icon: Download, keywords: 'export save print', run: () => setDownload({ open: true, format: 'pdf' }) },
        { id: 'dl-html', label: 'Download accessible HTML', icon: Download, keywords: 'export save', run: () => setDownload({ open: true, format: 'html' }) },
        { id: 'dl-docx', label: 'Download Word file', icon: Download, keywords: 'export save docx', run: () => setDownload({ open: true, format: 'docx' }) },
        ...(source ? [{ id: 'orig', label: originalOpen ? 'Hide the original' : 'Show the original side by side', icon: Columns2, run: () => setOriginalOpen((o) => !o) }] : []),
        { id: 'adjust', label: 'Adjust reading settings', icon: Type, run: () => openRail('adjust') },
        { id: 'edit', label: 'Fix the structure', icon: FilePenLine, run: () => navigate(`/read/${encodeURIComponent(doc.id)}/edit`) },
        { id: 'library', label: 'Go to library', icon: BookMarked, run: () => navigate('/library') },
        ...(wide ? [{ id: 'rail', label: railOpen ? 'Hide the side panel' : 'Show the side panel', icon: PanelLeft, run: () => setRailOpen((o) => !o) }] : []),
      ],
    });
    g.push({
      id: 'toggles',
      title: 'Reading aids',
      items: [
        toggle('boldStarts', 'bold word starts', Bold),
        toggle('focusMode', 'focus sessions', Focus),
        toggle('summaries', 'section summaries', ListChecks),
        toggle('focusLine', 'the focus line', Minus),
        toggle('plainLanguage', 'plain-language buttons', Sparkles),
        toggle('readAloud', 'read-aloud controls', Volume2),
        toggle('noMotion', 'reduce motion', Eye),
      ],
    });
    g.push({
      id: 'profiles',
      title: 'Profile',
      items: PROFILE_ORDER.map((id) => ({
        id: `profile-${id}`,
        label: `Use the ${PROFILES[id].label} profile`,
        icon: UserRound,
        hint: id === prefs.profileId ? 'Current' : undefined,
        run: () => {
          chooseProfile(id);
          setAnnouncement(`${PROFILES[id].label} profile on.`);
        },
      })),
    });
    g.push({
      id: 'themes',
      title: 'Theme',
      items: THEMES.map((t) => ({
        id: `theme-${t.id}`,
        label: `${THEME_NAMES[t.id]} theme`,
        icon: Palette,
        hint: settings.theme === t.id ? 'Current' : undefined,
        run: () => updateSettings({ theme: t.id }),
      })),
    });
    return g;
  }, [
    hasSelection,
    sections,
    current,
    n,
    goTo,
    showSpeech,
    speech.status,
    speech.stop,
    readCurrent,
    source,
    originalOpen,
    navigate,
    doc.id,
    wide,
    railOpen,
    settings,
    prefs.profileId,
    openRail,
  ]);

  // ---- render ----
  const renderBeforeBlocks = (sec, i) =>
    settings.summaries ? <SummaryBox section={sec} index={i} state={summaries[sec.id]} onFetch={fetchSummary} /> : null;

  const focusBar = focusMode && (
    <div className="rd-session">
      <p className="rd-session-text" id="rd-session-text">
        Section {current + 1} of {n} · {minutesLeftText(minutesLeft)}
      </p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${((current + 1) / n) * 100}%` }} />
      </div>
    </div>
  );

  const meta = (
    <div className="rd-meta">
      <p className="rd-meta-line">
        {n} {n === 1 ? 'section' : 'sections'}, about {totalMinutes} min
        {doc.sourceFile && !minimal ? (
          <>
            {' '}
            <span className="rd-meta-src">from {doc.sourceFile}</span>
          </>
        ) : null}
      </p>
      {firstVisit && <FirstVisit onDismiss={() => {
        setFirstVisit(false);
        setPrefs((p) => ({ ...p, chosen: true }));
      }} />}
      {resume != null && !firstVisit && (
        <div className="rd-resume" role="region" aria-label="Resume reading">
          <p>
            {focusMode ? 'Picked up where you left off: ' : 'You were reading '}
            <strong>{sectionLabel(sections[resume], resume)}</strong>.
          </p>
          <div className="rd-row">
            {focusMode ? (
              <button type="button" className="btn btn-sm" onClick={() => goTo(0)}>
                Start from the beginning
              </button>
            ) : (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => goTo(resume)}>
                Continue reading
              </button>
            )}
            <button type="button" className="btn btn-sm btn-icon btn-quiet" onClick={() => setResume(null)} aria-label="Dismiss">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {focusBar}
    </div>
  );

  const railProps = {
    tab: railTab,
    onTabChange: setRailTab,
    sections,
    current,
    furthest: Math.max(furthest, current),
    pct,
    minutesLeft,
    onGo: goTo,
    pages,
    onGoPage: goToPage,
    kind: doc.source?.kind,
  };

  const origPage = pageForSection(sections, current);
  const showOriginal = originalOpen && source;

  return (
    <div
      className={`rd fra-theme${minimal ? ' rd-minimal' : ''}${wide && railOpen ? ' has-rail' : ''}${showOriginal ? ' has-orig' : ''}`}
      style={settingsToStyle(settings)}
      {...settingsToData({ ...settings, noMotion })}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="rd-top">
        <button
          type="button"
          className="btn btn-icon btn-quiet rd-railbtn"
          onClick={() => (wide ? setRailOpen((o) => !o) : setSheetOpen(true))}
          aria-label={wide ? (railOpen ? 'Hide contents and settings' : 'Show contents and settings') : 'Contents and settings'}
          aria-expanded={wide ? railOpen : undefined}
          aria-controls={wide ? 'rd-rail' : undefined}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
        <Link to="/library" className="rd-home">
          <BrandMark size={22} />
          <span className="rd-home-text">Library</span>
        </Link>
        <span className="rd-top-title" aria-hidden="true">
          {doc.title}
        </span>

        <div className="rd-actions">
          {showSpeech && (
            <div className="rd-speech" role="group" aria-label="Read aloud">
              <button type="button" className="btn btn-sm" onClick={readCurrent} aria-pressed={speech.status === 'speaking'}>
                {speech.status === 'speaking' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                <span className="rd-hide-sm">
                  {speech.status === 'speaking' ? 'Pause' : speech.status === 'paused' ? 'Resume' : 'Read aloud'}
                </span>
                <span className="sr-only rd-show-sm">
                  {speech.status === 'speaking' ? 'Pause' : speech.status === 'paused' ? 'Resume' : 'Read aloud'}
                </span>
              </button>
              {speech.status !== 'idle' && (
                <button type="button" className="btn btn-sm btn-icon" onClick={speech.stop} aria-label="Stop reading">
                  <Square size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {source && (
            <button
              type="button"
              className="btn btn-sm rd-hide-sm"
              aria-pressed={originalOpen}
              onClick={() => setOriginalOpen((o) => !o)}
            >
              <Columns2 size={16} aria-hidden="true" /> Original
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setDownload({ open: true, format: 'pdf' })} aria-haspopup="dialog">
            <Download size={16} aria-hidden="true" />
            <span className="rd-hide-sm">Download</span>
            <span className="sr-only rd-show-sm">Download</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-quiet rd-cmd"
            onClick={openPalette}
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Command size={16} aria-hidden="true" />
            <span className="rd-hide-sm">Commands</span>
            <span className="sr-only rd-show-sm">Commands</span>
            {!minimal && (
              <span className="kbd rd-hide-sm" aria-hidden="true">
                Ctrl K
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="rd-body">
        {wide && railOpen && (
          <aside className="rd-rail" id="rd-rail" aria-label="Contents and settings">
            <SideRail {...railProps} />
            <div className="rd-rail-foot">
              <Link to={`/read/${encodeURIComponent(doc.id)}/edit`} className="btn btn-sm btn-quiet">
                <FilePenLine size={14} aria-hidden="true" /> Fix structure
              </Link>
              <span className="rd-rail-profile">
                <UserRound size={14} aria-hidden="true" /> {profile.label}
              </span>
            </div>
          </aside>
        )}

        <main id="main" tabIndex={-1} className="rd-main" ref={mainRef}>
          <DocRenderer
            doc={doc}
            sections={shown}
            profile={settings}
            onRequestPlain={requestPlain}
            onReadFrom={showSpeech ? readFrom : undefined}
            highlight={speech.highlight}
            titleId="rd-title"
            afterTitle={meta}
            renderBeforeBlocks={renderBeforeBlocks}
            className="rd-doc"
          />

          {focusMode ? (
            <nav className="rd-stepper" aria-label="Section navigation">
              <button type="button" className="btn" onClick={() => goTo(current - 1)} disabled={current === 0}>
                <ChevronLeft size={18} aria-hidden="true" /> Back
                {current > 0 && <span className="sr-only">: {sectionLabel(sections[current - 1], current - 1)}</span>}
              </button>
              {current < n - 1 ? (
                <button type="button" className="btn btn-primary rd-next" onClick={() => goTo(current + 1)}>
                  <span className="rd-next-text">
                    <span className="rd-next-kicker">Next</span>
                    <span className="rd-next-title">{sectionLabel(sections[current + 1], current + 1)}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : atEnd ? (
                <p className="rd-done">
                  You’ve finished. <Link to="/library">Back to your library</Link>
                </p>
              ) : (
                <button type="button" className="btn btn-primary" onClick={finish}>
                  Finish
                </button>
              )}
            </nav>
          ) : (
            <p id="rd-end" className="rd-end">
              <FileText size={16} aria-hidden="true" /> End of document.{' '}
              <button type="button" className="linklike" onClick={() => setDownload({ open: true, format: 'pdf' })}>
                Download a copy
              </button>
            </p>
          )}
        </main>

        {showOriginal && (
          <Suspense
            fallback={
              <aside className="orig" aria-label="Original document">
                <p className="orig-loading">Loading the original…</p>
              </aside>
            }
          >
            <OriginalPane blob={source} page={origPage} onClose={() => setOriginalOpen(false)} />
          </Suspense>
        )}
      </div>

      {!wide && (
        <ModalOverlay className="modal-overlay rd-sheet-overlay" isOpen={sheetOpen} onOpenChange={setSheetOpen} isDismissable>
          <Modal className="rd-sheet">
            <Dialog className="rd-sheet-dialog" aria-label="Contents and settings">
              {({ close }) => (
                <>
                  <div className="rd-sheet-head">
                    <Heading slot="title" className="rd-sheet-title">
                      {doc.title}
                    </Heading>
                    <button type="button" className="btn btn-icon btn-quiet" onClick={close} aria-label="Close">
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <SideRail {...railProps} />
                </>
              )}
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      <CommandPalette isOpen={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} onRun={(it) => (it.sel ? runSelection(it.sel) : it.run())} />
      <DownloadDialog
        isOpen={download.open}
        initialFormat={download.format}
        onOpenChange={(o) => setDownload((d) => ({ ...d, open: o }))}
        doc={doc}
        settings={settings}
        onDone={(message) => setToast({ id: Date.now(), message, duration: 4000 })}
      />
      <SelectionPopover ref={selRef} rootRef={mainRef} onSpeak={speakText} />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <FocusLine active={settings.focusLine} bandPx={Math.round(88 * (settings.textScale || 1) * (settings.lineHeight / 1.6))} />
    </div>
  );
}

export default function Reader() {
  const { id } = useParams();
  const [state, setState] = useState({ id: null, doc: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      let doc = await getDoc(id);
      if (!doc && id === SAMPLE_DOC_ID) doc = await seedSampleDoc();
      if (alive) setState({ id, doc: doc || null });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.id !== id) {
    return (
      <div className="rd rd-loading" role="status" aria-live="polite">
        <span className="sr-only">Opening the document…</span>
        <div className="rd-skel" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }
  if (!state.doc) return <NotFound docId={id} />;
  return <ReaderView key={id} initialDoc={state.doc} />;
}
