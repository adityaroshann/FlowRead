import { useState, useEffect, useCallback } from 'react';

const LINE_HEIGHT_PX = 48;
const VISIBLE_LINES = 3;
const WINDOW_HEIGHT = LINE_HEIGHT_PX * VISIBLE_LINES;

export default function FocusOverlay({ active, containerRef }) {
  const [position, setPosition] = useState(200);

  const handleKeyDown = useCallback((e) => {
    if (!active) return;
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      setPosition((p) => p + LINE_HEIGHT_PX);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      setPosition((p) => Math.max(0, p - LINE_HEIGHT_PX));
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);

  // Auto-scroll to keep the focus window visible
  useEffect(() => {
    if (!active) return;
    const windowCenter = position + WINDOW_HEIGHT / 2;
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    if (Math.abs(windowCenter - viewportCenter) > window.innerHeight * 0.35) {
      window.scrollTo({ top: position - window.innerHeight / 3, behavior: 'smooth' });
    }
  }, [active, position]);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        pointerEvents: 'none',
      }}
    >
      {/* Top dim */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: position - window.scrollY,
        background: 'var(--bg)',
        opacity: 0.85,
        transition: 'height 150ms ease-out',
      }} />

      {/* Focus window - clear strip */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: position - window.scrollY,
        height: WINDOW_HEIGHT,
        borderTop: '2px solid var(--accent)',
        borderBottom: '2px solid var(--accent)',
        boxShadow: '0 0 20px var(--glow-color)',
        transition: 'top 150ms ease-out',
      }} />

      {/* Bottom dim */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: position - window.scrollY + WINDOW_HEIGHT,
        bottom: 0,
        background: 'var(--bg)',
        opacity: 0.85,
        transition: 'top 150ms ease-out',
      }} />

      {/* Instructions */}
      <div style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.4rem 0.85rem',
        fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        ↑↓ or j/k to move · Esc to exit
      </div>
    </div>
  );
}
