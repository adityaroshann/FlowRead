import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { simplifyParagraph } from '../utils/api';

export default function BionicReader({ paragraphsHtml, originalParagraphs = [], fontSize = 'md', lineHeight = 'relaxed', fontFamily = 'default' }) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [simplifiedMap, setSimplifiedMap] = useState({});
  const [loadingIdx, setLoadingIdx] = useState(null);
  const shouldReduceMotion = useReducedMotion();

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

  const handleSimplify = useCallback(async (index) => {
    if (simplifiedMap[index] !== undefined) {
      // Toggle back to original
      setSimplifiedMap((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }

    const original = originalParagraphs[index];
    if (!original || original.length < 50) return;

    setLoadingIdx(index);
    try {
      const simplified = await simplifyParagraph(original);
      setSimplifiedMap((prev) => ({ ...prev, [index]: simplified }));
    } catch {
      // silently fail
    } finally {
      setLoadingIdx(null);
    }
  }, [originalParagraphs, simplifiedMap]);

  const fontSizeMap = { sm: '0.9rem', md: '1.05rem', lg: '1.2rem', xl: '1.4rem' };
  const lineHeightMap = { normal: 1.6, relaxed: 1.85, spacious: 2.1 };
  const fontFamilyMap = {
    default: 'var(--font-body)',
    dyslexic: 'var(--font-dyslexic)',
    atkinson: 'var(--font-atkinson)',
  };

  const animationProps = shouldReduceMotion
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <>
      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Reading progress"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: 3,
          width: `${progress}%`,
          background: 'var(--accent)',
          zIndex: 1000,
          transition: 'width 80ms linear',
          borderRadius: '0 2px 2px 0',
        }}
      />

      <div ref={containerRef}>
        {paragraphsHtml.map((html, i) => {
          const isSimplified = simplifiedMap[i] !== undefined;
          const isLoading = loadingIdx === i;
          const canSimplify = originalParagraphs[i]?.length >= 50;

          return (
            <div key={i} style={{ position: 'relative', marginBottom: '1.5em' }}>
              <motion.p
                className="bionic-text"
                {...animationProps}
                transition={shouldReduceMotion ? undefined : { delay: Math.min(i * 0.03, 0.5), duration: 0.25 }}
                dangerouslySetInnerHTML={{ __html: isSimplified ? simplifiedMap[i] : html }}
                style={{
                  fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.default,
                  fontSize: fontSizeMap[fontSize] || fontSizeMap.md,
                  lineHeight: lineHeightMap[lineHeight] || lineHeightMap.relaxed,
                  color: 'var(--text)',
                  cursor: canSimplify ? 'pointer' : 'default',
                  borderLeft: isSimplified ? '3px solid var(--accent)' : '3px solid transparent',
                  paddingLeft: '0.75rem',
                  transition: 'border-color 200ms ease',
                }}
                onClick={() => canSimplify && handleSimplify(i)}
                title={canSimplify ? (isSimplified ? 'Click to show original' : 'Click to simplify') : undefined}
              />

              {/* Simplify indicator */}
              <AnimatePresence>
                {isLoading && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: -24,
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                    }}
                  >
                    simplifying…
                  </motion.span>
                )}
              </AnimatePresence>

              {isSimplified && (
                <span style={{
                  display: 'inline-block',
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent)',
                  marginTop: '0.25rem',
                  paddingLeft: '0.75rem',
                }}>
                  simplified · click to restore
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
