import { motion, AnimatePresence } from 'framer-motion';

const THEMES = [
  { id: 'cream', label: 'Cream' },
  { id: 'dark', label: 'Dark' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'high-contrast', label: 'High Contrast' },
];

const FONTS = [
  { id: 'default', label: 'Default (Literata)' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible' },
  { id: 'dyslexic', label: 'OpenDyslexic' },
];

const FONT_SIZES = ['sm', 'md', 'lg', 'xl'];
const LINE_HEIGHTS = ['normal', 'relaxed', 'spacious'];

export default function SettingsPanel({ open, onClose, settings, onChange }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 200,
            }}
          />

          {/* Panel */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              height: '100dvh',
              width: 320,
              background: 'var(--panel-bg)',
              borderLeft: '1px solid var(--border)',
              zIndex: 201,
              padding: '2rem 1.5rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--text)' }}>
                Reading Settings
              </h2>
              <button onClick={onClose} style={iconBtnStyle} aria-label="Close settings">✕</button>
            </div>

            {/* Bold Intensity */}
            <Section label="Bold Intensity">
              <div style={{ display: 'flex', gap: 8 }}>
                {[0.35, 0.45, 0.55].map((v) => (
                  <ChipBtn key={v} active={settings.intensity === v} onClick={() => onChange({ intensity: v })}>
                    {v === 0.35 ? 'Light' : v === 0.45 ? 'Medium' : 'Strong'}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Font Size */}
            <Section label="Font Size">
              <div style={{ display: 'flex', gap: 8 }}>
                {FONT_SIZES.map((s) => (
                  <ChipBtn key={s} active={settings.fontSize === s} onClick={() => onChange({ fontSize: s })}>
                    {s.toUpperCase()}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Line Spacing */}
            <Section label="Line Spacing">
              <div style={{ display: 'flex', gap: 8 }}>
                {LINE_HEIGHTS.map((lh) => (
                  <ChipBtn key={lh} active={settings.lineHeight === lh} onClick={() => onChange({ lineHeight: lh })}>
                    {lh.charAt(0).toUpperCase() + lh.slice(1)}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Color Theme */}
            <Section label="Color Theme">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {THEMES.map((t) => (
                  <ChipBtn key={t.id} active={settings.theme === t.id} onClick={() => onChange({ theme: t.id })}>
                    {t.label}
                  </ChipBtn>
                ))}
              </div>
            </Section>

            {/* Font Family */}
            <Section label="Font Family">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {FONTS.map((f) => (
                  <ChipBtn key={f.id} active={settings.fontFamily === f.id} onClick={() => onChange({ fontFamily: f.id })}>
                    {f.label}
                  </ChipBtn>
                ))}
              </div>
            </Section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function ChipBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0.45rem 0.85rem',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 6,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#1A1A1A' : 'var(--text)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.875rem',
        fontWeight: active ? 700 : 400,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

const iconBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: 4,
  lineHeight: 1,
};
