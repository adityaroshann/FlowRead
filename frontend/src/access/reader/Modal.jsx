import { useEffect, useRef } from 'react';

/**
 * Native <dialog> modal: focus is trapped by the browser, Esc closes it and
 * focus returns to the opener. The first `[data-autofocus]` element (or the
 * first focusable one) gets focus on open.
 */
export default function Modal({ open, onClose, labelledBy, describedBy, className = '', children }) {
  const ref = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      openerRef.current = document.activeElement;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      const target = d.querySelector('[data-autofocus]');
      if (target) target.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const handleClose = () => {
    const opener = openerRef.current;
    onClose?.();
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      requestAnimationFrame(() => opener.focus());
    }
  };

  return (
    <dialog
      ref={ref}
      className={`fra-dialog ${className}`.trim()}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={handleClose}
    >
      {open ? children : null}
    </dialog>
  );
}
