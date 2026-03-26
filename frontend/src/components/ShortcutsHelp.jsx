import { motion, AnimatePresence } from 'framer-motion';

const SHORTCUTS = [
  { keys: 'F', desc: 'Toggle focus mode' },
  { keys: 'D', desc: 'Toggle distraction-free mode' },
  { keys: 'S', desc: 'Open settings' },
  { keys: 'Shift + Space', desc: 'Toggle read aloud' },
  { keys: 'Esc', desc: 'Close panels / exit modes' },
  { keys: '↑ / ↓ or J / K', desc: 'Move focus line (in focus mode)' },
  { keys: '?', desc: 'Show this help' },
];

export default function ShortcutsHelp({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="shortcuts-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300 }}
          />
          <motion.div
            key="shortcuts-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--panel-bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '2rem',
              zIndex: 301,
              width: 360,
              maxWidth: 'calc(100vw - 2rem)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text)', fontWeight: 600, margin: 0 }}>
                Keyboard Shortcuts
              </h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }} aria-label="Close">
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {SHORTCUTS.map(({ keys, desc }) => (
                <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{desc}</span>
                  <kbd style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '0.15rem 0.45rem',
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                  }}>
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
