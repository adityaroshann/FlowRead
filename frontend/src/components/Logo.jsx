export default function Logo({ size = 28, showText = true, style = {} }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        textDecoration: 'none',
        ...style,
      }}
      aria-label="FlowRead"
    >
      {/* Leaf-book icon: a leaf shape with a line down the middle like a book spine */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Leaf body */}
        <path
          d="M16 3C10 3 4 9 4 17c0 6 4 10 8 12 1.5-1 3-3 4-6 1 3 2.5 5 4 6 4-2 8-6 8-12C28 9 22 3 16 3z"
          fill="var(--accent)"
          opacity="0.15"
        />
        <path
          d="M16 3C10 3 4 9 4 17c0 6 4 10 8 12 1.5-1 3-3 4-6 1 3 2.5 5 4 6 4-2 8-6 8-12C28 9 22 3 16 3z"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Center vein / book spine */}
        <path
          d="M16 7v16"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Small veins / text lines */}
        <path d="M12 12h-2" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        <path d="M12 15.5h-3" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        <path d="M20 12h2" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        <path d="M20 15.5h3" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      </svg>
      {showText && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: size * 0.58,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          Flow<span style={{ color: 'var(--accent)', fontWeight: 700 }}>Read</span>
        </span>
      )}
    </span>
  );
}
