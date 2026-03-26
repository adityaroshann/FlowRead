import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const THEMES = [
  { id: 'cream', label: 'Light', dot: '#FAFAF8' },
  { id: 'dark', label: 'Dark', dot: '#101210' },
  { id: 'sepia', label: 'Sepia', dot: '#F7F3EC' },
  { id: 'high-contrast', label: 'High Contrast', dot: '#000000' },
];

const FONTS = [
  { id: 'default', label: 'Literata', preview: 'Aa' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', preview: 'Aa' },
  { id: 'dyslexic', label: 'OpenDyslexic', preview: 'Aa' },
];

const FONT_SIZES = ['sm', 'md', 'lg', 'xl'];
const LINE_HEIGHTS = ['normal', 'relaxed', 'spacious'];

export default function SettingsPanel({ open, onClose, settings, onChange }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => panelRef.current?.focus(), 100);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.2)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 200,
            }}
          />

          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Reading Settings"
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100dvh',
              width: 340,
              background: 'var(--bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 201,
              padding: '1.75rem 1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                color: 'var(--text)',
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}>
                Settings
              </h2>
              <button
                onClick={onClose}
                aria-label="Close settings"
                style={{
                  background: 'var(--bg-surface)',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Bold Intensity */}
            <Section label="Bold Intensity">
              <div style={{ display: 'flex', gap: 6 }}>
                {[0.35, 0.45, 0.55].map((v) => (
                  <ChipBtn key={v} active={settings.intensity === v} onClick={() => onChange({ intensity: v })}>
                    {v === 0.35 ? 'Light' : v === 0.45 ? 'Medium' : 'Strong'}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Font Size */}
            <Section label="Text Size">
              <div style={{ display: 'flex', gap: 6 }}>
                {FONT_SIZES.map((s) => (
                  <ChipBtn key={s} active={settings.fontSize === s} onClick={() => onChange({ fontSize: s })}>
                    {s.toUpperCase()}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Line Spacing */}
            <Section label="Line Spacing">
              <div style={{ display: 'flex', gap: 6 }}>
                {LINE_HEIGHTS.map((lh) => (
                  <ChipBtn key={lh} active={settings.lineHeight === lh} onClick={() => onChange({ lineHeight: lh })}>
                    {lh.charAt(0).toUpperCase() + lh.slice(1)}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Color Theme */}
            <Section label="Theme">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onChange({ theme: t.id })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0.5rem 0.85rem',
                      border: `1.5px solid ${settings.theme === t.id ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: settings.theme === t.id ? 'var(--accent-subtle)' : 'transparent',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.82rem',
                      fontWeight: settings.theme === t.id ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      flex: '1 1 auto',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: t.dot,
                      border: '1.5px solid var(--border-strong)',
                      flexShrink: 0,
                    }} />
                    {t.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* Font Family */}
            <Section label="Font">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {FONTS.map((f) => (
                  <ChipBtn
                    key={f.id}
                    active={settings.fontFamily === f.id}
                    onClick={() => onChange({ fontFamily: f.id })}
                    style={{ justifyContent: 'flex-start', width: '100%' }}
                  >
                    {f.label}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <p style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                lineHeight: 1.45,
              }}>
                Press <kbd style={kbdStyle}>?</kbd> for keyboard shortcuts
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p style={{
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        marginBottom: '0.65rem',
      }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function ChipBtn({ active, onClick, children, style: extraStyle }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 0.8rem',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text)',
        fontFamily: 'var(--font-display)',
        fontSize: '0.82rem',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        ...extraStyle,
      }}
    >
      {children}
    </button>
  );
}

const kbdStyle = {
  display: 'inline-block',
  padding: '1px 5px',
  fontSize: '0.68rem',
  fontFamily: 'var(--font-mono)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
};
