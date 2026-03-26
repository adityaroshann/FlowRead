import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SummaryPanel({ open, onClose, summary, rawStream, loading, error, onSummarize }) {
  const panelRef = useRef(null);

  // Focus panel when it opens
  useEffect(() => {
    if (open) setTimeout(() => panelRef.current?.focus(), 100);
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }}
          />

          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="AI Summary"
            key="summary-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100dvh',
              width: 360,
              background: 'var(--panel-bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 201,
              padding: '2rem 1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text)' }}>
                AI Summary
              </h2>
              <button onClick={onClose} style={iconBtnStyle} aria-label="Close">✕</button>
            </div>

            {!summary && !loading && !rawStream && (
              <button onClick={onSummarize} style={primaryBtnStyle}>
                Generate Summary
              </button>
            )}

            {loading && !summary && (
              <div role="status" aria-live="polite">
                <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
                  Summarizing…
                </p>
                <div style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 8,
                  padding: '1rem',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.9rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  minHeight: 80,
                }}>
                  {rawStream || '…'}
                </div>
              </div>
            )}

            {summary && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* TL;DR */}
                <div>
                  <p style={labelStyle}>TL;DR</p>
                  <p style={{ color: 'var(--text)', lineHeight: 1.7, fontSize: '0.95rem' }}>
                    {summary.tldr}
                  </p>
                </div>

                {/* Bullets */}
                <div>
                  <p style={labelStyle}>Key Points</p>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {summary.bullets?.map((bullet, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.2 }}
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          color: 'var(--text)',
                          fontSize: '0.9rem',
                          lineHeight: 1.6,
                        }}
                      >
                        <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>▸</span>
                        {bullet}
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Reading time */}
                {summary.readingTimeMinutes && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-surface)',
                    borderRadius: 8,
                    fontSize: '0.875rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {summary.readingTimeMinutes} min read · {summary.bullets?.length} key points
                  </div>
                )}

                {/* Re-summarize */}
                <button onClick={onSummarize} style={{ ...primaryBtnStyle, background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  Regenerate
                </button>
              </motion.div>
            )}

            {error && (
              <div style={{
                background: 'rgba(229, 62, 62, 0.08)',
                border: '1px solid rgba(229, 62, 62, 0.3)',
                borderRadius: 8,
                padding: '1rem',
              }}>
                <p style={{ color: '#E53E3E', fontSize: '0.875rem', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                  {error}
                </p>
                <button onClick={onSummarize} style={{ ...primaryBtnStyle, background: '#E53E3E', color: '#fff' }}>
                  Try again
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

const iconBtnStyle = {
  background: 'none', border: 'none', color: 'var(--text-muted)',
  fontSize: '1.1rem', cursor: 'pointer', padding: 4, lineHeight: 1,
};

const primaryBtnStyle = {
  padding: '0.75rem 1.5rem',
  background: 'var(--accent)',
  color: '#1A1A1A',
  border: 'none',
  borderRadius: 8,
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  width: '100%',
};

const labelStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontFamily: 'var(--font-mono)',
  marginBottom: '0.5rem',
};
