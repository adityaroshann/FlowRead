import { motion } from 'framer-motion';

function SunIcon({ size }) {
  const r = size * 0.25;
  const rayLen = size * 0.12;
  const rayOff = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx={cx} cy={cy} r={r} fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (r + 2);
        const y1 = cy + Math.sin(rad) * (r + 2);
        const x2 = cx + Math.cos(rad) * rayOff;
        const y2 = cy + Math.sin(rad) * rayOff;
        return (
          <line
            key={angle}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function MoonIcon({ size }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32;
  const cutR = size * 0.25;
  const cutOff = size * 0.18;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <mask id="moon-mask">
        <rect width={size} height={size} fill="white" />
        <circle cx={cx + cutOff} cy={cy - cutOff} r={cutR} fill="black" />
      </mask>
      <circle cx={cx} cy={cy} r={r} fill="currentColor" mask="url(#moon-mask)" />
    </svg>
  );
}

export default function ThemeToggle({ theme, onToggle, size = 20 }) {
  const isDark = theme === 'dark';

  return (
    <motion.button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: '50%',
        width: size + 16,
        height: size + 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--text)',
        transition: 'border-color 200ms ease',
      }}
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {isDark ? <SunIcon size={size} /> : <MoonIcon size={size} />}
      </motion.div>
    </motion.button>
  );
}
