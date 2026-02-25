import { motion } from 'framer-motion';
import { exportToPDF, exportToDOCX, copyToClipboard } from '../utils/export';

export default function Toolbar({ readerRef, plainText, wordCount, readingTime, speaking, onTTSToggle, onSettings, onSummary }) {
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

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3, type: 'spring', damping: 24, stiffness: 220 }}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 50,
        padding: '0.6rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        zIndex: 100,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {wordCount > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          paddingRight: '0.75rem',
          borderRight: '1px solid var(--border)',
          marginRight: '0.5rem',
          whiteSpace: 'nowrap',
        }}>
          {wordCount.toLocaleString()} words · {readingTime} min
        </span>
      )}

      <ToolBtn onClick={onTTSToggle} title={speaking ? 'Stop reading' : 'Read aloud'}>
        {speaking ? '⏹' : '🔊'}
      </ToolBtn>

      <ToolBtn onClick={onSummary} title="AI Summary">
        ✨
      </ToolBtn>

      <ToolBtn onClick={onSettings} title="Reading settings">
        ⚙️
      </ToolBtn>

      <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 0.25rem' }} />

      <ToolBtn onClick={handleCopy} title="Copy to clipboard">
        📋
      </ToolBtn>

      <ToolBtn onClick={handleExportPDF} title="Export as PDF">
        PDF
      </ToolBtn>

      <ToolBtn onClick={handleExportDOCX} title="Export as DOCX">
        DOC
      </ToolBtn>
    </motion.div>
  );
}

function ToolBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0.4rem 0.6rem',
        borderRadius: 8,
        fontSize: '0.8rem',
        color: 'var(--text)',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        transition: 'background 150ms ease, transform 120ms ease',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {children}
    </button>
  );
}
