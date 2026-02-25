import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { extractFile, scrapeUrl } from '../utils/api';

const TABS = ['Upload File', 'Paste URL', 'Paste Text'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function UploadZone({ onContent }) {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback(async (file) => {
    setError(null);
    setLoading(true);
    try {
      const data = await extractFile(file);
      const allParagraphs = data.pages.flatMap((p) => p.paragraphs);
      onContent({ title: data.title, paragraphs: allParagraphs, source: 'file' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not read file. Try a PDF, DOCX, or TXT.');
    } finally {
      setLoading(false);
    }
  }, [onContent]);

  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      setError('File too large or unsupported type. Max 10MB, accepted: PDF, DOCX, TXT, MD.');
      return;
    }
    if (accepted[0]) handleFile(accepted[0]);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive, isDragAccept } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt', '.md'] },
    maxSize: MAX_SIZE,
    multiple: false,
    noClick: false,
  });

  const handleURL = async () => {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const data = await scrapeUrl(url.trim());
      onContent({ title: data.title, paragraphs: data.paragraphs, sourceUrl: data.sourceUrl, source: 'url' });
    } catch (err) {
      setError(err.response?.data?.detail || "We couldn't read this page — try pasting the text directly.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasteText = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.split(/\n{2,}/).map(l => l.trim()).filter(Boolean);
    onContent({ title: lines[0]?.slice(0, 80) || 'Pasted Document', paragraphs: lines, source: 'paste' });
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Tabs with animated indicator */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: '1.25rem',
        background: 'var(--bg-surface)',
        borderRadius: 10,
        padding: 4,
        position: 'relative',
      }}>
        {TABS.map((label, i) => (
          <button
            key={label}
            onClick={() => { setTab(i); setError(null); }}
            style={{
              flex: 1,
              padding: '0.5rem 0',
              border: 'none',
              borderRadius: 7,
              background: 'transparent',
              color: tab === i ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              fontWeight: tab === i ? 600 : 400,
              cursor: 'pointer',
              transition: 'color 150ms ease',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {label}
            {tab === i && (
              <motion.div
                layoutId="upload-tab-indicator"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--panel-bg)',
                  borderRadius: 7,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  zIndex: -1,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 0 && (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <div
              {...getRootProps()}
              style={{
                position: 'relative',
                border: `2px dashed ${isDragAccept ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 16,
                padding: '3rem 2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragActive ? 'var(--bg-surface)' : 'transparent',
                transition: 'all 250ms ease',
                transform: isDragActive ? 'scale(1.02)' : 'scale(1)',
                boxShadow: isDragActive
                  ? '0 0 40px var(--glow-color-strong), inset 0 0 20px var(--glow-color)'
                  : '0 0 0 transparent',
                overflow: 'hidden',
              }}
            >
              <input {...getInputProps()} />

              {/* Drag overlay */}
              <AnimatePresence>
                {isDragActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--glass-bg)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                      borderRadius: 14,
                    }}
                  >
                    <motion.span
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      style={{ fontSize: '3rem' }}
                    >
                      📥
                    </motion.span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
              <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '0.25rem' }}>
                {isDragActive ? 'Drop it here!' : 'Drag & drop your file'}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                PDF, DOCX, TXT, MD — up to 10MB
              </p>
              <div style={{ marginTop: '1rem', color: 'var(--accent)', fontSize: '0.875rem', fontWeight: 600 }}>
                or click to browse
              </div>
            </div>
          </motion.div>
        )}

        {tab === 1 && (
          <motion.div key="url" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleURL()}
                placeholder="https://example.com/article"
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 200ms ease, box-shadow 200ms ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--glow-color)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button onClick={handleURL} disabled={loading} style={btnStyle}>
                {loading ? '…' : 'Fetch'}
              </button>
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Works on most articles, blog posts, and news pages.
            </p>
          </motion.div>
        )}

        {tab === 2 && (
          <motion.div key="paste" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your text here…"
              rows={8}
              style={{
                width: '100%',
                padding: '1rem',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text)',
                fontFamily: 'var(--font-body)',
                fontSize: '1rem',
                lineHeight: 1.7,
                resize: 'vertical',
                outline: 'none',
                display: 'block',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--glow-color)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <button onClick={handlePasteText} disabled={!pasteText.trim()} style={{ ...btnStyle, marginTop: 8 }}>
              Transform
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ marginTop: '1rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}
        >
          Loading…
        </motion.p>
      )}

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ marginTop: '1rem', color: '#E53E3E', fontSize: '0.875rem', textAlign: 'center' }}
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}

const btnStyle = {
  padding: '0.75rem 1.5rem',
  background: 'var(--accent)',
  color: '#1A1A1A',
  border: 'none',
  borderRadius: 8,
  fontFamily: 'var(--font-body)',
  fontSize: '0.95rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 150ms ease, transform 120ms ease',
  whiteSpace: 'nowrap',
};
