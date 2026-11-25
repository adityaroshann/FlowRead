import { useEffect, useRef } from 'react';

/**
 * Reading ruler: a band one line tall that follows the mouse, or the text
 * caret / selection when reading with the keyboard. Everything else is dimmed
 * slightly. Moves instantly (no easing) so it never lags behind the eye, which
 * also suits prefers-reduced-motion.
 */
export function FocusLine() {
  const top = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    let y = window.innerHeight / 3;
    const lineHeight = () => {
      const fs = parseFloat(getComputedStyle(document.body).fontSize) || 16;
      const lh = parseFloat(getComputedStyle(document.body).lineHeight);
      return Math.max(24, Math.min(96, (Number.isFinite(lh) ? lh : fs * 1.6) + 8));
    };
    let h = lineHeight();
    const paint = () => {
      frame = 0;
      const t = Math.max(0, y - h / 2);
      if (top.current) top.current.style.cssText = `top:0;height:${t}px`;
      if (band.current) band.current.style.cssText = `top:${t}px;height:${h}px`;
      if (bottom.current) bottom.current.style.cssText = `top:${t + h}px;bottom:0`;
    };
    const move = (ny: number) => {
      y = ny;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMouse = (e: MouseEvent) => move(e.clientY);
    const onCaret = () => {
      const sel = document.getSelection();
      if (!sel || !sel.rangeCount || !sel.focusNode) return;
      const r = document.createRange();
      try {
        r.setStart(sel.focusNode, sel.focusOffset);
        r.collapse(true);
      } catch {
        return;
      }
      const rect = r.getClientRects()[0] ?? (sel.focusNode.parentElement?.getBoundingClientRect() ?? null);
      if (rect && rect.height) move(rect.top + rect.height / 2);
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (el && el instanceof Element && !el.closest('flowread-ui')) {
        const r = el.getBoundingClientRect();
        if (r.height) move(r.top + Math.min(r.height, h) / 2);
      }
    };
    const onResize = () => {
      h = lineHeight();
      move(y);
    };
    paint();
    window.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('selectionchange', onCaret);
    document.addEventListener('focusin', onFocus);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('selectionchange', onCaret);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div aria-hidden="true">
      <div ref={top} className="fr-ruler fr-ruler-dim" />
      <div ref={band} className="fr-ruler fr-ruler-band" />
      <div ref={bottom} className="fr-ruler fr-ruler-dim" />
    </div>
  );
}
