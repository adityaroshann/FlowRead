import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: portals to <body>, makes the app root inert,
 * traps Tab, closes on Escape and returns focus to the opener.
 *
 * `initialFocusRef` lets the caller choose which control gets focus first
 * (e.g. the safe "Cancel" action in a destructive confirmation).
 */
export default function Dialog({ open, title, description, onClose, initialFocusRef, children, role = 'dialog' }) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const root = document.getElementById('root');
    if (root) root.inert = true;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusRef?.current || panel.querySelector(FOCUSABLE) || panel;
      target.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (root) root.inert = false;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className="fa-staff fa-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className="fa-dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descId}>{description}</p>}
        {children}
      </div>
    </div>,
    document.body
  );
}
