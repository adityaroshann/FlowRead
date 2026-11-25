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
  Layers,
  Undo2,
  WandSparkles,
  Sun,
  Moon,
} from 'lucide-react';
import DocRenderer from '../shared/DocRenderer.jsx';
import { getDoc, getSource, saveDoc } from '../shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../shared/sampleDoc.js';
import { plainLanguage, suggestHeadings, summarizeSection } from '../shared/api.js';
import AiBadge from '../shared/AiBadge.jsx';
import AiText from '../shared/AiText.jsx';
import { PROFILES, PROFILE_ORDER, THEMES, settingsToData, settingsToStyle } from '@flowread/core/profiles.js';
import { readingMinutes, sectionLabel, sectionText, sectionWordCount } from '@flowread/core/docModel.js';
import { chooseProfile, getPrefs, loadProgress, saveProgress, updateSettings, usePrefs } from './readerPrefs.js';
import { useWordSpeech } from './useWordSpeech.js';
import { BrandMark } from '../../app/Brand.jsx';
import Toast from '../../app/Toast.jsx';
import FocusLine from './FocusLine.jsx';
import SideRail from './SideRail.jsx';
import CommandPalette from './CommandPalette.jsx';
import SelectionPopover from './SelectionPopover.jsx';
import DownloadDialog from './DownloadDialog.jsx';
import ReadingBar from './ReadingBar.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import Flashcards from './Flashcards.jsx';
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
  const roomy = typeof window !== 'undefined' && window.innerWidth >= 1280;
  try {
    const v = window.localStorage.getItem(RAIL_KEY);
    return v == null ? roomy : v === '1';
  } catch {
    return roomy;
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

/** Insert AI-suggested headings (new blocks only; existing text is untouched). */
function withAiHeadings(doc, headings) {
  const before = new Map(headings.map((h) => [h.beforeBlockId, h.text]));
  let n = 0;
  return {
    ...doc,
    aiHeadings: true,
    sections: doc.sections.map((s) => ({
      ...s,
      blocks: s.blocks.flatMap((b) =>
        before.has(b.id)
          ? [{ id: `aih${(n += 1)}`, type: 'heading', level: Math.min(6, (Number(s.level) || 2) + 1), text: before.get(b.id), ai: true, plain: null }, b]
          : [b],
      ),
    })),
  };
}

function withoutAiHeadings(doc) {
  const { aiHeadings, ...rest } = doc; // eslint-disable-line no-unused-vars
  return { ...rest, sections: doc.sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => !b.ai) })) };
}

function aiDidText(ai) {
  if (!ai) return '';
  const parts = [];
  if (ai.imagesDescribed) parts.push(`described ${ai.imagesDescribed} ${ai.imagesDescribed === 1 ? 'image' : 'images'}`);
  if (ai.pagesRead) parts.push(`read ${ai.pagesRead} scanned ${ai.pagesRead === 1 ? 'page' : 'pages'}`);
  if (ai.mathSpoken) parts.push(`made ${ai.mathSpoken} ${ai.mathSpoken === 1 ? 'formula' : 'formulas'} speakable`);
  return parts.length ? `AI ${parts.join(', ')}.` : '';
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

function SummaryBox({ section, state, onFetch, index, settings }) {
  const text = section.summary || state?.text;
  return (
    <div className="rd-summary" aria-live="polite">
      <p className="rd-summary-label">In this section</p>
      {text ? (
        <>
          <p className="rd-summary-text">
            <AiText text={text} settings={settings} /> <AiBadge what="This summary" />
          </p>
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

function ReaderView({ initialDoc }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState(initialDoc);
  const prefs = usePrefs();
  const settings = prefs.settings;
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
  const [paletteKey, setPaletteKey] = useState(0);
  const [download, setDownload] = useState({ open: false, format: 'pdf' });
  const [moreOpen, setMoreOpen] = useState(false);
  const [distractionFree, setDistractionFree] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [docSummary, setDocSummary] = useState({ status: 'idle' });
  const [headingsState, setHeadingsState] = useState({ status: 'idle' });
  const [source, setSource] = useState(null);
  const [originalOpen, setOriginalOpen] = useState(false);
  const [summaries, setSummaries] = useState({});
  const [announcement, setAnnouncement] = useState('');
  const [toast, setToast] = useState(null);
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

  const fetchDocSummary = useCallback(async () => {
    setDocSummary({ status: 'loading' });
    try {
      const text = sections.map((s) => `${s.heading || ''}\n${sectionText(s)}`).join('\n\n').slice(0, 55000);
      const summary = await summarizeSection(doc.title || '', text);
      setDocSummary({ status: 'done' });
      setDoc((d) => {
        const next = { ...d, summary };
        persist(next);
        return next;
      });
    } catch {
      setDocSummary({ status: 'error' });
    }
  }, [sections, doc.title, persist]);

  const addHeadings = useCallback(async () => {
    setHeadingsState({ status: 'loading' });
    try {
      const paragraphs = [];
      for (const s of sections) for (const b of s.blocks || []) if (b.type === 'paragraph' && !b.role) paragraphs.push({ id: b.id, text: b.text });
      const headings = await suggestHeadings(paragraphs);
      if (!headings.length) {
        setHeadingsState({ status: 'none' });
        return;
      }
      setDoc((d) => {
        const next = withAiHeadings(d, headings);
        persist(next);
        return next;
      });
      setHeadingsState({ status: 'idle' });
      setAnnouncement(`Added ${headings.length} headings suggested by AI.`);
    } catch (e) {
      setHeadingsState({ status: 'error', message: e?.status === 503 ? 'This needs the AI service.' : 'Headings could not be added right now.' });
    }
  }, [sections, persist]);

  const undoHeadings = useCallback(() => {
    setDoc((d) => {
      const next = withoutAiHeadings(d);
      persist(next);
      return next;
    });
    setAnnouncement('Removed the AI headings.');
  }, [persist]);

  const saveCards = useCallback(
    (flashcards) =>
      setDoc((d) => {
        const next = { ...d, flashcards };
        persist(next);
        return next;
      }),
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
          if (!o) {
            setPaletteSel(!!selRef.current?.hasSelection());
            setPaletteKey((k) => k + 1);
          }
          return !o;
        });
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!selRef.current?.open()) setAnnouncement('Select some text in the document first.');
      } else if (!mod && !e.altKey && /^[fFdD]$/.test(e.key)) {
        const t = e.target;
        const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest?.('[role="dialog"]'));
        if (typing) return;
        e.preventDefault();
        if (e.key === 'd' || e.key === 'D') {
          setDistractionFree((v) => {
            setAnnouncement(v ? 'Distraction-free off.' : 'Distraction-free on. Press D or Escape to exit.');
            return !v;
          });
          return;
        }
        const on = !getPrefs().settings.focusLine;
        updateSettings({ focusLine: on });
        setAnnouncement(`Focus line ${on ? 'on' : 'off'}.`);
      } else if (e.key === 'Escape') {
        setDistractionFree(false);
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
        { id: 'adjust', label: 'More reading settings', icon: Type, run: () => setMoreOpen(true) },
        { id: 'cards', label: 'Flashcards: check what you remember', icon: Layers, keywords: 'quiz study review', run: () => setCardsOpen(true) },
        { id: 'summary', label: 'Show summaries', icon: Sparkles, run: () => openRail('summary') },
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
    settings.summaries ? <SummaryBox section={sec} index={i} state={summaries[sec.id]} onFetch={fetchSummary} settings={settings} /> : null;

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
        {totalMinutes} min read
        {n > 1 ? ` · ${n} sections` : ''}
      </p>
      {resume != null && (
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
      {(aiDidText(doc.ai) || doc.structureHint || doc.aiHeadings) && !minimal && (
        <div className="rd-ai-note">
          {aiDidText(doc.ai) && (
            <p className="rd-ai-did">
              <Sparkles size={14} aria-hidden="true" /> While converting, {aiDidText(doc.ai)}
            </p>
          )}
          {doc.aiHeadings ? (
            <p className="rd-ai-did">
              <WandSparkles size={14} aria-hidden="true" /> AI added headings to break up long stretches of text.{' '}
              <button type="button" className="linklike" onClick={undoHeadings}>
                <Undo2 size={13} aria-hidden="true" /> Remove them
              </button>
            </p>
          ) : doc.structureHint === 'few-headings' ? (
            <p className="rd-ai-did">
              This document has long stretches without headings.{' '}
              <button type="button" className="linklike" onClick={addHeadings} disabled={headingsState.status === 'loading'}>
                <WandSparkles size={13} aria-hidden="true" /> {headingsState.status === 'loading' ? 'Adding headings…' : 'Add headings with AI'}
              </button>
              {headingsState.status === 'error' && <span className="rd-error"> {headingsState.message}</span>}
              {headingsState.status === 'none' && <span className="rd-muted"> No good places for headings were found.</span>}
            </p>
          ) : null}
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
    // "Go to page" only when the reader has asked to see original page numbers.
    pages: settings.showPageNumbers ? pages : [],
    onGoPage: goToPage,
    kind: doc.source?.kind,
    summary: {
      doc,
      section: sections[current],
      sectionIndex: current,
      sectionSummary: sections[current] ? summaries[sections[current].id] : undefined,
      onSectionSummary: fetchSummary,
      docSummary,
      onDocSummary: fetchDocSummary,
      onFlashcards: () => setCardsOpen(true),
      settings,
    },
  };

  const origPage = pageForSection(sections, current);
  const showOriginal = originalOpen && source;

  return (
    <div
      className={`rd fra-theme${minimal ? ' rd-minimal' : ''}${wide && railOpen && !distractionFree ? ' has-rail' : ''}${showOriginal ? ' has-orig' : ''}${distractionFree ? ' is-df' : ''}${settings.showPageNumbers ? '' : ' rd-hide-pages'}`}
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
          aria-label={wide ? (railOpen ? 'Hide contents and summary' : 'Show contents and summary') : 'Contents and summary'}
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
        <button
          type="button"
          className="btn btn-icon btn-quiet"
          onClick={() => updateSettings({ theme: settings.theme === 'dark' || settings.theme === 'high-contrast' ? 'light' : 'dark' })}
          aria-label={settings.theme === 'dark' || settings.theme === 'high-contrast' ? 'Light theme' : 'Dark theme'}
          title={settings.theme === 'dark' || settings.theme === 'high-contrast' ? 'Light theme' : 'Dark theme'}
        >
          {settings.theme === 'dark' || settings.theme === 'high-contrast' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
      </header>

      <div className="rd-body">
        {wide && railOpen && !distractionFree && (
          <aside className="rd-rail" id="rd-rail" aria-label="Contents and summary">
            <SideRail {...railProps} />
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
          {(atEnd || (focusMode && current === n - 1)) && (
            <section className="rd-recall" aria-labelledby="rd-recall-h">
              <h2 id="rd-recall-h" className="rd-recall-h">
                <Layers size={18} aria-hidden="true" /> Check what you remember
              </h2>
              <p className="rd-recall-text">
                {doc.flashcards?.cards?.length
                  ? `You have ${doc.flashcards.cards.length} flashcards from this document. Practise them, or take a quick quiz.`
                  : 'Turn the key points into flashcards and a short quiz.'}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => setCardsOpen(true)}>
                {doc.flashcards?.cards?.length ? 'Practise flashcards' : 'Make flashcards'} <AiBadge what="Flashcards" />
              </button>
            </section>
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
            <Dialog className="rd-sheet-dialog" aria-label="Contents and summary">
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

      <CommandPalette key={paletteKey} isOpen={paletteOpen} onOpenChange={setPaletteOpen} groups={groups} onRun={(it) => (it.sel ? runSelection(it.sel) : it.run())} />
      <DownloadDialog
        isOpen={download.open}
        initialFormat={download.format}
        onOpenChange={(o) => setDownload((d) => ({ ...d, open: o }))}
        doc={doc}
        settings={settings}
        onDone={(message) => setToast({ id: Date.now(), message, duration: 4000 })}
      />
      <ModalOverlay className="modal-overlay more-overlay" isOpen={moreOpen} onOpenChange={setMoreOpen} isDismissable>
        <Modal className="more-sheet">
          <Dialog className="more-dialog" aria-label="More reading settings">
            {({ close }) => (
              <>
                <div className="rd-sheet-head">
                  <Heading slot="title" className="rd-sheet-title">
                    More settings
                  </Heading>
                  <button type="button" className="btn btn-icon btn-quiet" onClick={close} aria-label="Close">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <SettingsPanel>
                  <div className="set-group more-doc">
                    <p className="set-label">This document</p>
                    <div className="more-actions">
                      {source && (
                        <button type="button" className="btn btn-sm" aria-pressed={originalOpen} onClick={() => setOriginalOpen((o) => !o)}>
                          <Columns2 size={15} aria-hidden="true" /> {originalOpen ? 'Hide the original' : 'Show the original beside it'}
                        </button>
                      )}
                      <Link to={`/read/${encodeURIComponent(doc.id)}/edit`} className="btn btn-sm">
                        <FilePenLine size={15} aria-hidden="true" /> Fix structure
                      </Link>
                    </div>
                    <p className="hint">
                      Shortcuts: <kbd className="kbd">F</kbd> focus line · <kbd className="kbd">Ctrl K</kbd> all commands ·{' '}
                      <kbd className="kbd">Ctrl Shift E</kbd> explain selected text
                    </p>
                  </div>
                </SettingsPanel>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
      <Flashcards isOpen={cardsOpen} onOpenChange={setCardsOpen} doc={doc} onSaveCards={saveCards} settings={settings} />
      <ReadingBar
        prefs={prefs}
        speech={speech}
        showSpeech={showSpeech}
        onReadAloud={readCurrent}
        onMore={() => setMoreOpen(true)}
        onDownload={() => setDownload({ open: true, format: 'pdf' })}
        onSummary={() => openRail('summary')}
        onAnnounce={setAnnouncement}
        hidden={distractionFree}
      />
      {distractionFree && (
        <button type="button" className="rd-df-exit" onClick={() => setDistractionFree(false)} aria-keyshortcuts="D Escape">
          Exit distraction-free <kbd className="kbd">D</kbd>
        </button>
      )}
      <SelectionPopover ref={selRef} rootRef={mainRef} onSpeak={speakText} settings={settings} />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <FocusLine
        active={settings.focusLine}
        lineHeightPx={Math.round(18 * (settings.textScale || 1) * (settings.lineHeight || 1.6))}
        lines={settings.focusLineSize}
        blur={settings.focusBlur}
        noMotion={noMotion}
        followSelector={speech.highlight ? '.rd-doc .fra-word-current' : undefined}
        followKey={speech.highlight ? `${speech.highlight.blockId}:${speech.highlight.start}` : undefined}
      />
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
