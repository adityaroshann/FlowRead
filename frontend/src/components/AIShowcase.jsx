import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const MOCK_TLDR =
  'This article explores how bionic reading transforms the way we process text by bolding key word segments, potentially doubling reading speed for neurodivergent readers.';

const MOCK_BULLETS = [
  'Bionic reading bolds the first half of each word to guide eye fixation',
  'Studies show up to 2x improvement in reading speed for ADHD readers',
  'The technique reduces cognitive load by leveraging pattern recognition',
  'FlowRead adds AI summaries, TTS, and export on top of bionic transform',
];

export default function AIShowcase() {
  const [visibleChars, setVisibleChars] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    if (visibleChars >= MOCK_TLDR.length) return;
    const timer = setTimeout(() => setVisibleChars((v) => v + 1), 18);
    return () => clearTimeout(timer);
  }, [visibleChars, started]);

  return (
    <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 2rem' }}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        onViewportEnter={() => setStarted(true)}
        style={{ textAlign: 'center' }}
      >
        <p style={{
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '0.75rem',
          fontWeight: 700,
        }}>
          Powered by Claude
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
          color: 'var(--text)',
          marginBottom: '0.75rem',
          fontWeight: 700,
        }}>
          AI that reads so you don't have to
        </h2>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '1rem',
          maxWidth: 500,
          margin: '0 auto 2.5rem',
          lineHeight: 1.7,
        }}>
          Get a TL;DR, key takeaways, and reading time estimate — streamed in real-time.
        </p>

        {/* Mock summary card */}
        <div style={{
          maxWidth: 580,
          margin: '0 auto',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          padding: '2rem',
          textAlign: 'left',
          animation: 'pulse-glow 4s ease-in-out infinite',
        }}>
          {/* TL;DR */}
          <p style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.5rem',
            fontWeight: 700,
          }}>
            TL;DR
          </p>
          <p style={{
            color: 'var(--text)',
            lineHeight: 1.7,
            fontSize: '0.95rem',
            minHeight: '3em',
            fontFamily: 'var(--font-body)',
          }}>
            {MOCK_TLDR.slice(0, visibleChars)}
            {visibleChars < MOCK_TLDR.length && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom' }}
              />
            )}
          </p>

          {/* Key Points */}
          <p style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginTop: '1.5rem',
            marginBottom: '0.75rem',
            fontWeight: 700,
          }}>
            Key Points
          </p>
          {MOCK_BULLETS.map((bullet, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 2 + i * 0.25, duration: 0.35 }}
              style={{
                display: 'flex',
                gap: '0.6rem',
                marginBottom: '0.6rem',
                color: 'var(--text)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>&#9656;</span>
              <span>{bullet}</span>
            </motion.div>
          ))}

          {/* Reading time */}
          <div style={{
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
          }}>
            <span>~3 min read</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span>1,247 words</span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
