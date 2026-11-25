import { Link } from 'react-router-dom';

/** The FlowRead leaf-book mark. Decorative: the link text names it. */
export function BrandMark({ size = 24 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M16 3C10 3 4 9 4 17c0 6 4 10 8 12 1.5-1 3-3 4-6 1 3 2.5 5 4 6 4-2 8-6 8-12C28 9 22 3 16 3z"
        fill="var(--accent)"
        opacity="0.14"
      />
      <path
        d="M16 3C10 3 4 9 4 17c0 6 4 10 8 12 1.5-1 3-3 4-6 1 3 2.5 5 4 6 4-2 8-6 8-12C28 9 22 3 16 3z"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 7v16" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12h-2M12 15.5h-3M20 12h2M20 15.5h3" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export default function Brand({ to = '/', label = 'FlowRead', compact = false }) {
  return (
    <Link to={to} className="brand" aria-label={compact ? `${label} home` : undefined}>
      <BrandMark />
      {!compact && <span>{label}</span>}
    </Link>
  );
}
