import { useEffect, useState } from 'react';

/**
 * Reading-line overlay: a clear band with the page dimmed above and below.
 * Follows the pointer, and keyboard focus. Purely visual (aria-hidden) and
 * never blocks clicks.
 */
export default function FocusLine({ active, bandPx = 96 }) {
  const [y, setY] = useState(() => (typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.4) : 300));

  useEffect(() => {
    if (!active) return undefined;
    const onMove = (e) => setY(e.clientY);
    const onFocus = (e) => {
      const el = e.target;
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < window.innerHeight * 0.6) setY(Math.round(r.top + r.height / 2));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('focusin', onFocus);
    };
  }, [active]);

  if (!active) return null;
  const top = Math.max(0, y - bandPx / 2);
  return (
    <div className="fra-focusline" aria-hidden="true">
      <div className="fra-focusline-dim" style={{ top: 0, height: top }} />
      <div className="fra-focusline-band" style={{ top, height: bandPx }} />
      <div className="fra-focusline-dim" style={{ top: top + bandPx, bottom: 0 }} />
    </div>
  );
}
