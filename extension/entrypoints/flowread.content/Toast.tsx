import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 12_000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div className="fr-toast" role="status" aria-live="polite">
      <p>
        <strong>FlowRead: </strong>
        {message}
      </p>
      <button type="button" className="fr-icon-btn" onClick={onClose} aria-label="Dismiss message">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
