import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBionicTransform } from '../hooks/useBionicTransform';
import { useSummarize } from '../hooks/useSummarize';
import { useTTS } from '../hooks/useTTS';
import { useSettings } from '../hooks/useSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import BionicReader from '../components/BionicReader';
import Toolbar from '../components/Toolbar';
import SettingsPanel from '../components/SettingsPanel';
import SummaryPanel from '../components/SummaryPanel';
import FocusOverlay from '../components/FocusOverlay';
import ReadingTimer from '../components/ReadingTimer';
import ShortcutsHelp from '../components/ShortcutsHelp';

const SESSION_KEY = 'flowread-reader-content';

function loadSessionContent() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
}

function saveSessionContent(content) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(content));
  } catch { /* silent */ }
}

export default function ReaderPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Content: prefer location.state, fall back to sessionStorage
  const content = useMemo(() => {
    if (location.state?.paragraphs?.length) return location.state;
    return loadSessionContent();
  }, [location.state]);

  // Persist content to sessionStorage
  useEffect(() => {
    if (content?.paragraphs?.length) {
      saveSessionContent(content);
    }
  }, [content]);

  const { settings, updateSettings, toggleTheme } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [paragraphsHtml, setParagraphsHtml] = useState([]);
  const [focusMode, setFocusMode] = useState(false);
  const [distractionFree, setDistractionFree] = useState(false);
  const [pomodoroActive, setPomodoroActive] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const readerRef = useRef(null);
  const articleRef = useRef(null);
  const { result, loading: transforming, transform } = useBionicTransform();
  const { summary, rawStream, loading: summarizing, error: summaryError, summarize } = useSummarize();
  const { speaking, toggle: toggleTTS } = useTTS();

  // Redirect if no content
  useEffect(() => {
    if (!content?.paragraphs?.length) {
      navigate('/');
    }
  }, [content, navigate]);

  // Transform all paragraphs when intensity or content changes
  useEffect(() => {
    if (!content?.paragraphs?.length) return;
    const fullText = content.paragraphs.join('\n\n');
    transform(fullText, settings.intensity);
  }, [content, settings.intensity, transform]);

  // When transform result comes in, split back into paragraphs
  useEffect(() => {
    if (!result?.html) return;
    const htmlParas = result.html.split('\n\n').filter(Boolean);
    setParagraphsHtml(htmlParas);
  }, [result]);

  const handleSettingChange = useCallback((patch) => {
    updateSettings(patch);
  }, [updateSettings]);

  const handleSummarize = useCallback(() => {
    if (!content?.paragraphs) return;
    const text = content.paragraphs.join(' ');
    summarize(text);
  }, [content, summarize]);

  const plainText = content?.paragraphs?.join('\n\n') || '';

  // Close all panels/modes
  const handleEscape = useCallback(() => {
    if (shortcutsOpen) { setShortcutsOpen(false); return; }
    if (settingsOpen) { setSettingsOpen(false); return; }
    if (summaryOpen) { setSummaryOpen(false); return; }
    if (focusMode) { setFocusMode(false); return; }
    if (distractionFree) { setDistractionFree(false); return; }
  }, [shortcutsOpen, settingsOpen, summaryOpen, focusMode, distractionFree]);

  // Keyboard shortcuts
  const shortcutHandlers = useMemo(() => ({
    onEscape: handleEscape,
    onFocusMode: () => setFocusMode((p) => !p),
    onDistractionFree: () => setDistractionFree((p) => !p),
    onSettings: () => setSettingsOpen((p) => !p),
    onTTS: () => toggleTTS(plainText),
    onHelp: () => setShortcutsOpen((p) => !p),
  }), [handleEscape, toggleTTS, plainText]);

  useKeyboardShortcuts(shortcutHandlers);

  // Reading progress memory: save scroll position
  useEffect(() => {
    if (!content?.title) return;
    const key = `flowread-scroll-${btoa(content.title).slice(0, 20)}`;

    // Restore saved position
    const saved = sessionStorage.getItem(key);
    if (saved) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
      });
    }

    // Save on scroll (debounced)
    let timer;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem(key, String(window.scrollY));
      }, 500);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [content?.title]);

  if (!content) return null;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', transition: 'background 220ms ease' }}>
      {/* Skip-to-content link */}
      <a
        href="#reader-content"
        style={{
          position: 'absolute',
          top: -40,
          left: 0,
          background: 'var(--accent)',
          color: '#1A1A1A',
          padding: '0.5rem 1rem',
          zIndex: 1000,
          fontWeight: 600,
          fontSize: '0.85rem',
        }}
        onFocus={(e) => { e.currentTarget.style.top = '0'; }}
        onBlur={(e) => { e.currentTarget.style.top = '-40px'; }}
      >
        Skip to content
      </a>

      {/* Top nav */}
      <AnimatePresence>
        {!distractionFree && (
          <motion.nav
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            role="navigation"
            aria-label="Reader navigation"
            style={{
              position: 'sticky',
              top: 0,
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              padding: '0.75rem 2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              zIndex: 50,
            }}
          >
            <button
              onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
            >
              ← Back
            </button>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {content.title}
            </span>
            {content.sourceUrl && (
              <a href={content.sourceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textDecoration: 'none' }}>
                Source ↗
              </a>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Document */}
      <main role="main">
        <article
          id="reader-content"
          ref={articleRef}
          style={{
            maxWidth: 'var(--reader-max-width)',
            margin: '0 auto',
            padding: distractionFree ? '4rem 2rem' : '3rem 2rem 10rem',
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: '2rem',
              lineHeight: 1.2,
            }}
          >
            {content.title}
          </motion.h1>

          {transforming && (
            <p
              role="status"
              aria-live="polite"
              style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            >
              Applying bionic transform…
            </p>
          )}

          <div ref={readerRef}>
            {paragraphsHtml.length > 0 && (
              <BionicReader
                paragraphsHtml={paragraphsHtml}
                originalParagraphs={content.paragraphs}
                fontSize={settings.fontSize}
                lineHeight={settings.lineHeight}
                fontFamily={settings.fontFamily}
              />
            )}
          </div>
        </article>
      </main>

      {/* Focus overlay */}
      <FocusOverlay active={focusMode} containerRef={articleRef} />

      {/* Pomodoro timer */}
      <ReadingTimer active={pomodoroActive} onStop={() => setPomodoroActive(false)} />

      {/* Floating toolbar */}
      <Toolbar
        readerRef={readerRef}
        plainText={plainText}
        wordCount={result?.wordCount || 0}
        readingTime={result?.readingTimeMinutes || 0}
        speaking={speaking}
        onTTSToggle={() => toggleTTS(plainText)}
        onSettings={() => setSettingsOpen(true)}
        onSummary={() => setSummaryOpen(true)}
        theme={settings.theme}
        onThemeToggle={toggleTheme}
        focusMode={focusMode}
        onFocusToggle={() => setFocusMode((p) => !p)}
        distractionFree={distractionFree}
        onDistractionFreeToggle={() => setDistractionFree((p) => !p)}
        pomodoroActive={pomodoroActive}
        onPomodoroToggle={() => setPomodoroActive((p) => !p)}
      />

      {/* Distraction-free exit hint */}
      <AnimatePresence>
        {distractionFree && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              position: 'fixed',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              opacity: 0.5,
            }}
          >
            Press Esc or D to exit distraction-free mode
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings panel */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={handleSettingChange}
      />

      {/* Summary panel */}
      <SummaryPanel
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        summary={summary}
        rawStream={rawStream}
        loading={summarizing}
        error={summaryError}
        onSummarize={handleSummarize}
      />

      {/* Keyboard shortcuts help */}
      <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
