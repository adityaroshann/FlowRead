import { useEffect } from 'react';

/**
 * One transient message with an optional action (for example Undo).
 * The region is always in the DOM so screen readers hear new messages.
 */
export default function Toast({ toast, onDismiss, duration = 8000 }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => onDismiss?.('timeout'), toast.duration || duration);
    return () => clearTimeout(t);
  }, [toast, onDismiss, duration]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <p>{toast.message}</p>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                toast.action.onAction();
                onDismiss?.('action');
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
