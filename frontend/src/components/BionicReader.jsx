import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { simplifyParagraph } from '../utils/api';

const fontSizeMap = { sm: '0.9rem', md: '1.05rem', lg: '1.2rem', xl: '1.4rem' };
const lineHeightMap = { normal: 1.6, relaxed: 1.85, spacious: 2.1 };
const fontFamilyMap = {
  default: 'var(--font-body)',
  dyslexic: 'var(--font-dyslexic)',
  atkinson: 'var(--font-atkinson)',
};

/**
 * Build a flat list of { html, original, isHeading, pageBreakBefore, pageNum }
 * from the paragraphsHtml array and the optional structured pages array.
 */
function buildItems(paragraphsHtml, originalParagraphs, pages, source) {
  // Build a page-start index map: paragraphIndex → pageNum
  const pageStartMap = new Map(); // flat index → page number
  if (pages && source === 'file') {
    let idx = 0;
    for (const page of pages) {
      if (page.pageNum > 1) {
        pageStartMap.set(idx, page.pageNum);
      }
      idx += page.paragraphs.length;
    }
  }

  return paragraphsHtml.map((html, i) => {
    const original = originalParagraphs[i] || '';
    const isHeading = original.startsWith('## ');
    return {
      html,
      original,
      isHeading,
      pageBreakBefore: pageStartMap.has(i) ? pageStartMap.get(i) : null,
    };
  });
}

function PageSeparator({ pageNum }) {
  return (
    <div
      aria-label={`Page ${pageNum}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        margin: '3rem 0 2rem',
        userSelect: 'none',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{
        fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        letterSpacing: '0.08em',
        padding: '0.2rem 0.6rem',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)',
      }}>
        Page {pageNum}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}

export default function BionicReader({
  paragraphsHtml,
  originalParagraphs = [],
  pages,
  source,
  fontSize = 'md',
  lineHeight = 'relaxed',
  fontFamily = 'default',
}) {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [simplifiedMap, setSimplifiedMap] = useState({});
  const [loadingIdx, setLoadingIdx] = useState(null);
  const shouldReduceMotion = useReducedMotion();

  const items = useMemo(
    () => buildItems(paragraphsHtml, originalParagraphs, pages, source),
    [paragraphsHtml, originalParagraphs, pages, source]
  );

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

  const textStyle = {
    fontFamily: fontFamilyMap[fontFamily] || fontFamilyMap.default,
    fontSize: fontSizeMap[fontSize] || fontSizeMap.md,
    lineHeight: lineHeightMap[lineHeight] || lineHeightMap.relaxed,
    color: 'var(--text)',
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
        {items.map((item, i) => {
          const isSimplified = simplifiedMap[i] !== undefined;
          const isLoading = loadingIdx === i;
          const canSimplify = !item.isHeading && item.original?.length >= 50;

          // Strip the ## prefix for heading display
          const headingText = item.isHeading
            ? item.html.replace(/^(<b>)?## (<\/b>)?/, '').replace(/## /, '')
            : null;

          return (
            <div key={i}>
              {/* Page break marker */}
              {item.pageBreakBefore && (
                <PageSeparator pageNum={item.pageBreakBefore} />
              )}

              {item.isHeading ? (
                /* Heading */
                <motion.h2
                  {...animationProps}
                  transition={shouldReduceMotion ? undefined : { delay: Math.min(i * 0.02, 0.4), duration: 0.25 }}
                  style={{
                    ...textStyle,
                    fontSize: `calc(${textStyle.fontSize} * 1.25)`,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    marginTop: '2em',
                    marginBottom: '0.6em',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '-0.01em',
                  }}
                  dangerouslySetInnerHTML={{ __html: headingText }}
                />
              ) : (
                /* Body paragraph */
                <div style={{ position: 'relative', marginBottom: '1.5em' }}>
                  <motion.p
                    className="bionic-text"
                    {...animationProps}
                    transition={shouldReduceMotion ? undefined : { delay: Math.min(i * 0.02, 0.4), duration: 0.25 }}
                    dangerouslySetInnerHTML={{ __html: isSimplified ? simplifiedMap[i] : item.html }}
                    style={{
                      ...textStyle,
                      cursor: canSimplify ? 'pointer' : 'default',
                      borderLeft: isSimplified ? '3px solid var(--accent)' : '3px solid transparent',
                      paddingLeft: '0.75rem',
                      transition: 'border-color 200ms ease',
                    }}
                    onClick={() => canSimplify && handleSimplify(i)}
                    title={canSimplify ? (isSimplified ? 'Click to show original' : 'Click to simplify') : undefined}
                  />

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
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
