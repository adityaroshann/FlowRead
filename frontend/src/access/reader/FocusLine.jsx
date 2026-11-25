import { useEffect, useRef, useState } from 'react';

/**
 * Focus line: a clear band over the lines you are reading, with the rest of
 * the page softly blurred and dimmed, so the band looks lifted off the page
 * (the original FlowRead focus overlay, refined).
 *
 * It follows, whichever happened last:
 * - the pointer (mouse, pen or touch),
 * - the text caret or selection, and keyboard focus,
 * - the word being read aloud (`followSelector` + `followKey`),
 * - ArrowUp/ArrowDown or j/k (one line at a time), as in the original.
 *
 * `lines` (1-3) sets the band height; `blur` is 'off' | 'soft' | 'strong'.
 * Purely visual (aria-hidden) and never blocks clicks.
 */
export default function FocusLine({ active, lineHeightPx = 30, lines = 2, blur = 'soft', followSelector, followKey, noMotion = false }) {
  const [y, setY] = useState(() => (typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.4) : 300));
  const raf = useRef(0);
  const step = Math.max(16, Math.round(lineHeightPx));

  useEffect(() => {
    if (!active) return undefined;
    const move = (next) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setY(Math.round(next)));
    };
    const onPointer = (e) => move(e.clientY);
    const centreOf = (r) => r && r.height > 0 && r.height < window.innerHeight * 0.6 && move(r.top + r.height / 2);
    const onFocus = (e) => {
      const el = e.target;
      if (el && typeof el.getBoundingClientRect === 'function') centreOf(el.getBoundingClientRect());
    };
    const onSelection = () => {
      const sel = window.getSelection?.();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0).getClientRects?.()[0];
      if (r) centreOf(r);
    };
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest?.('[role="dialog"],[role="toolbar"],[role="tablist"],[role="listbox"],[role="menu"]'))) return;
      const down = e.key === 'ArrowDown' || e.key === 'j';
      const up = e.key === 'ArrowUp' || e.key === 'k';
      if (!down && !up) return;
      e.preventDefault();
      setY((cur) => {
        const next = cur + (down ? step : -step);
        // Keep the band in the comfortable middle of the screen by scrolling the page instead.
        const lo = window.innerHeight * 0.25;
        const hi = window.innerHeight * 0.7;
        if (next > hi || next < lo) {
          window.scrollBy({ top: down ? step : -step, behavior: noMotion ? 'auto' : 'smooth' });
          return cur;
        }
        return next;
      });
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [active, step, noMotion]);

  // Follow the word being read aloud (measured after the highlight renders).
  useEffect(() => {
    if (!active || !followSelector) return undefined;
    const id = requestAnimationFrame(() => {
      const r = document.querySelector(followSelector)?.getBoundingClientRect?.();
      if (r && r.height > 0) setY(Math.round(r.top + r.height / 2));
    });
    return () => cancelAnimationFrame(id);
  }, [active, followSelector, followKey]);

  if (!active) return null;
  const n = Math.min(3, Math.max(1, Math.round(lines) || 2));
  const band = Math.round(lineHeightPx * n + lineHeightPx * 0.6);
  const top = Math.max(0, y - band / 2);
  const mode = blur === 'off' || blur === 'strong' ? blur : 'soft';
  return (
    <div className={`fra-focusline is-${mode}${noMotion ? ' no-motion' : ''}`} aria-hidden="true">
      <div className="fra-focusline-veil" style={{ top: 0, height: top }} />
      <div className="fra-focusline-band" style={{ top, height: band }} />
      <div className="fra-focusline-veil" style={{ top: top + band, bottom: 0 }} />
    </div>
  );
}
