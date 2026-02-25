import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useBionicTransform } from '../hooks/useBionicTransform';
import { useSummarize } from '../hooks/useSummarize';
import { useTTS } from '../hooks/useTTS';
import { useTheme } from '../hooks/useTheme';
import BionicReader from '../components/BionicReader';
import Toolbar from '../components/Toolbar';
import SettingsPanel from '../components/SettingsPanel';
import SummaryPanel from '../components/SummaryPanel';

const DEFAULT_SETTINGS = {
  intensity: 0.45,
  fontSize: 'md',
  lineHeight: 'relaxed',
  theme: 'cream',
  fontFamily: 'default',
};

export default function ReaderPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const content = location.state; // { title, paragraphs, source, sourceUrl? }

  const { theme, setTheme, toggleTheme } = useTheme();
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, theme }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [paragraphsHtml, setParagraphsHtml] = useState([]);

  const readerRef = useRef(null);
  const { result, loading: transforming, transform } = useBionicTransform();
  const { summary, rawStream, loading: summarizing, error: summaryError, summarize } = useSummarize();
  const { speaking, toggle: toggleTTS } = useTTS();

  // Redirect if no content
  useEffect(() => {
    if (!content?.paragraphs?.length) {
      navigate('/');
    }
  }, [content, navigate]);

  // Apply font to document root (theme is handled by useTheme hook)
  useEffect(() => {
    document.documentElement.setAttribute('data-font', settings.fontFamily);
  }, [settings.fontFamily]);

  // Transform all paragraphs when intensity or content changes
  useEffect(() => {
    if (!content?.paragraphs?.length) return;
    const fullText = content.paragraphs.join('\n\n');
    transform(fullText, settings.intensity);
  }, [content, settings.intensity, transform]);

  // When transform result comes in, split back into paragraphs
  useEffect(() => {
    if (!result?.html) return;
    // Split on double newline (we joined with \n\n)
    const htmlParas = result.html.split('\n\n').filter(Boolean);
    setParagraphsHtml(htmlParas);
  }, [result]);

  const handleSettingChange = useCallback((patch) => {
    if (patch.theme) setTheme(patch.theme);
    setSettings((prev) => ({ ...prev, ...patch }));
  }, [setTheme]);

  const handleThemeToggle = useCallback(() => {
    const next = theme === 'dark' ? 'cream' : 'dark';
    setTheme(next);
    setSettings((prev) => ({ ...prev, theme: next }));
  }, [theme, setTheme]);

  const handleSummarize = useCallback(() => {
    if (!content?.paragraphs) return;
    const text = content.paragraphs.join(' ');
    summarize(text);
  }, [content, summarize]);

  const plainText = content?.paragraphs?.join('\n\n') || '';

  if (!content) return null;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', transition: 'background 220ms ease' }}>
      {/* Top nav */}
      <nav style={{
        position: 'sticky',
        top: 0,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        zIndex: 50,
      }}>
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
      </nav>

      {/* Document */}
      <article
        style={{
          maxWidth: 'var(--reader-max-width)',
          margin: '0 auto',
          padding: '3rem 2rem 10rem',
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
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            Applying bionic transform…
          </p>
        )}

        <div ref={readerRef}>
          {paragraphsHtml.length > 0 && (
            <BionicReader
              paragraphsHtml={paragraphsHtml}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              fontFamily={settings.fontFamily}
            />
          )}
        </div>
      </article>

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
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

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
    </div>
  );
}
