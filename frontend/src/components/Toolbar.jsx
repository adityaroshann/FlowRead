import { motion } from 'framer-motion';
import { exportToPDF, exportToDOCX, copyToClipboard } from '../utils/export';
import ThemeToggle from './ThemeToggle';
import {
  Volume2, Square, Sparkles, Settings, Clipboard,
  FileText, FileDown, Focus, EyeOff, Timer
} from 'lucide-react';

export default function Toolbar({
  readerRef, plainText, wordCount, readingTime,
  speaking, onTTSToggle, onSettings, onSummary,
  theme, onThemeToggle,
  focusMode, onFocusToggle,
  distractionFree, onDistractionFreeToggle,
  pomodoroActive, onPomodoroToggle,
}) {
  const handleExportPDF = () => {
    if (readerRef?.current) exportToPDF(readerRef.current);
  };

  const handleExportDOCX = () => {
    if (!plainText) return;
    const paragraphs = plainText.split(/\n+/).filter(Boolean);
    exportToDOCX(paragraphs);
  };

  const handleCopy = async () => {
    if (plainText) {
      await copyToClipboard(plainText);
    }
  };

  if (distractionFree) return null;

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, type: 'spring', damping: 26, stiffness: 200 }}
      style={{
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '0.45rem 0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.1rem',
        zIndex: 100,
        boxShadow: 'var(--shadow-toolbar)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 'calc(100vw - 2rem)',
      }}
    >
      {wordCount > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          paddingRight: '0.65rem',
          borderRight: '1px solid var(--border)',
          marginRight: '0.25rem',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {wordCount.toLocaleString()} words · {readingTime} min
        </span>
      )}

      <ThemeToggle theme={theme} onToggle={onThemeToggle} size={15} />

      <ToolBtn onClick={onTTSToggle} title={speaking ? 'Stop reading' : 'Read aloud'} active={speaking}>
        {speaking ? <Square size={14} /> : <Volume2 size={14} />}
      </ToolBtn>

      <ToolBtn onClick={onFocusToggle} title="Focus mode (line reader)" active={focusMode}>
        <Focus size={14} />
      </ToolBtn>

      <ToolBtn onClick={onDistractionFreeToggle} title="Distraction-free mode">
        <EyeOff size={14} />
      </ToolBtn>

      <ToolBtn onClick={onPomodoroToggle} title={pomodoroActive ? 'Stop timer' : 'Reading timer'} active={pomodoroActive}>
        <Timer size={14} />
      </ToolBtn>

      <ToolBtn onClick={onSummary} title="AI Summary">
        <Sparkles size={14} />
      </ToolBtn>

      <ToolBtn onClick={onSettings} title="Reading settings">
        <Settings size={14} />
      </ToolBtn>

      <Divider />

      <ToolBtn onClick={handleCopy} title="Copy to clipboard">
        <Clipboard size={14} />
      </ToolBtn>

      <ToolBtn onClick={handleExportPDF} title="Export as PDF">
        <FileText size={14} />
      </ToolBtn>

      <ToolBtn onClick={handleExportDOCX} title="Export as DOCX">
        <FileDown size={14} />
      </ToolBtn>
    </motion.div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border-strong)', margin: '0 0.2rem', borderRadius: 1 }} />;
}

function ToolBtn({ onClick, title, children, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '0.4rem',
        borderRadius: 'var(--radius-sm)',
        color: active ? '#fff' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background var(--transition-fast), color var(--transition-fast), transform 100ms ease',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--accent-subtle)'; e.currentTarget.style.color = 'var(--text)'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}
