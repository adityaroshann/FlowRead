import { useEffect, useRef, useState } from 'react';

/**
 * Focus line: a reading band that follows you down the page.
 *
 * It follows, in order of what happened last:
 * - the pointer (mouse, pen or touch),
 * - the text caret or selection (keyboard reading with caret browsing),
 * - keyboard focus,
 * - the word being read aloud (`followSelector`).
 *
 * `lines` (1-3) sets the band height in lines of text; `dim` darkens the page
 * above and below. Purely visual (aria-hidden), never blocks clicks.
 */
export default function FocusLine({ active, lineHeightPx = 30, lines = 2, dim = false, followSelector, followKey, noMotion = false }) {
  const [y, setY] = useState(() => (typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.4) : 300));
  const raf = useRef(0);

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
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('focusin', onFocus);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [active]);

  // Follow the word being read aloud.
  useEffect(() => {
    if (!active || !followSelector) return undefined;
    // Measure after the highlight has rendered.
    const id = requestAnimationFrame(() => {
      const r = document.querySelector(followSelector)?.getBoundingClientRect?.();
      if (r && r.height > 0) setY(Math.round(r.top + r.height / 2));
    });
    return () => cancelAnimationFrame(id);
  }, [active, followSelector, followKey]);

  if (!active) return null;
  const n = Math.min(3, Math.max(1, Math.round(lines) || 2));
  const band = Math.round(lineHeightPx * n + lineHeightPx * 0.5);
  const top = Math.max(0, y - band / 2);
  return (
    <div className={`fra-focusline${dim ? ' is-dim' : ''}${noMotion ? ' no-motion' : ''}`} aria-hidden="true">
      {dim && <div className="fra-focusline-dim" style={{ top: 0, height: top }} />}
      <div className="fra-focusline-band" style={{ top, height: band }} />
      {dim && <div className="fra-focusline-dim" style={{ top: top + band, bottom: 0 }} />}
    </div>
  );
}
