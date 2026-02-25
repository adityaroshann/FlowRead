import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function BionicReader({ paragraphsHtml, fontSize = 'md', lineHeight = 'relaxed', fontFamily = 'default' }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);

  // Reading progress bar
  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalHeight = el.scrollHeight;
      const scrolled = -rect.top + window.innerHeight;
      const pct = Math.min(100, Math.max(0, (scrolled / totalHeight) * 100));
      setProgress(pct);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fontSizeMap = { sm: '0.9rem', md: '1.05rem', lg: '1.2rem', xl: '1.4rem' };
  const lineHeightMap = { normal: 1.6, relaxed: 1.85, spacious: 2.1 };
  const fontFamilyMap = {
    default: 'var(--font-body)',
    dyslexic: 'var(--font-dyslexic)',
    atkinson: 'var(--font-atkinson)',
  };

  return (
    <>
      {/* Progress bar */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: 3,
        width: `${progress}%`,
        background: 'var(--accent)',
        zIndex: 1000,
        transition: 'width 80ms linear',
        borderRadius: '0 2px 2px 0',
      }} />

      <div ref={containerRef}>
        {paragraphsHtml.map((html, i) => (
          <motion.p
            key={i}
            className="bionic-text"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.5), duration: 0.25 }}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
              fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.default,
              fontSize: fontSizeMap[fontSize] || fontSizeMap.md,
              lineHeight: lineHeightMap[lineHeight] || lineHeightMap.relaxed,
              color: 'var(--text)',
              marginBottom: '1.5em',
            }}
          />
        ))}
      </div>
    </>
  );
}
