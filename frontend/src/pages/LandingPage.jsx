import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useSettings } from '../hooks/useSettings';
import ThemeToggle from '../components/ThemeToggle';
import HeroDemo from '../components/HeroDemo';
import UploadZone from '../components/UploadZone';
import AIShowcase from '../components/AIShowcase';
import { FileText, Brain, Sparkles, Accessibility, Volume2, Download } from 'lucide-react';

const FEATURES = [
  { icon: FileText, title: 'Any Format', desc: 'PDF, DOCX, TXT, or paste a URL. We extract the content automatically.' },
  { icon: Brain, title: 'Bionic Reading', desc: 'Bold the first half of every word. Your brain fills in the rest — faster, focused reading.' },
  { icon: Sparkles, title: 'AI Summaries', desc: 'Get a TL;DR and key points for any document in seconds.' },
  { icon: Accessibility, title: 'Built for ADHD', desc: 'Focus mode, reading timer, paragraph simplification, and dyslexia-friendly fonts.' },
  { icon: Volume2, title: 'Read Aloud', desc: 'Listen to your documents with sentence-by-sentence tracking.' },
  { icon: Download, title: 'Export', desc: 'Save as PDF or Word document with bionic formatting preserved.' },
];

function FeatureCard({ feature, index }) {
  const [hovered, setHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const Icon = feature.icon;

  return (
    <motion.div
      {...(shouldReduceMotion ? {} : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: '-40px' },
        transition: { delay: index * 0.06, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2rem',
        background: hovered ? 'var(--bg-surface)' : 'transparent',
        borderRadius: 'var(--radius-lg)',
        transition: 'background 300ms ease',
        cursor: 'default',
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 'var(--radius-md)',
        background: hovered ? 'var(--accent)' : 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1.25rem',
        transition: 'background 300ms ease',
      }}>
        <Icon size={20} style={{ color: hovered ? '#fff' : 'var(--text)', transition: 'color 300ms ease' }} />
      </div>
      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.05rem',
        marginBottom: '0.5rem',
        color: 'var(--text)',
        fontWeight: 600,
        letterSpacing: '-0.01em',
      }}>
        {feature.title}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.55 }}>
        {feature.desc}
      </p>
    </motion.div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { settings, toggleTheme } = useSettings();
  const shouldReduceMotion = useReducedMotion();

  const handleContent = (content) => {
    navigate('/reader', { state: content });
  };

  const fade = (delay = 0) => shouldReduceMotion ? {} : {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  };

  const reveal = shouldReduceMotion ? {} : {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', transition: 'background var(--transition-base)' }}>
      {/* Skip-to-content */}
      <a href="#upload-section" style={{
        position: 'absolute', top: -40, left: 0,
        background: 'var(--accent)', color: '#fff',
        padding: '0.5rem 1rem', zIndex: 1000, fontWeight: 600, fontSize: '0.85rem',
        borderRadius: '0 0 var(--radius-sm) 0',
      }}
        onFocus={(e) => { e.currentTarget.style.top = '0'; }}
        onBlur={(e) => { e.currentTarget.style.top = '-40px'; }}
      >
        Skip to upload
      </a>

      {/* Nav */}
      <nav role="navigation" aria-label="Main navigation" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.875rem 2rem',
        position: 'sticky',
        top: 0,
        background: 'var(--panel-bg)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid var(--border)',
        zIndex: 50,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.15rem',
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-0.02em',
        }}>
          FlowRead
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <a
            href="https://github.com/adityaroshann/flowread"
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              textDecoration: 'none',
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              transition: 'color var(--transition-fast)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            GitHub
          </a>
          <ThemeToggle theme={settings.theme} onToggle={toggleTheme} size={16} />
        </div>
      </nav>

      <main role="main">
        {/* Hero */}
        <section style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '6rem 2rem 3rem',
          textAlign: 'center',
        }}>
          <motion.h1
            {...fade(0)}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.5rem, 6vw, 4rem)',
              fontWeight: 700,
              lineHeight: 1.05,
              color: 'var(--text)',
              letterSpacing: '-0.035em',
              marginBottom: '1.25rem',
            }}
          >
            Read faster.{' '}
            <span style={{ color: 'var(--accent)' }}>Focus better.</span>
          </motion.h1>

          <motion.p
            {...fade(0.08)}
            style={{
              fontSize: '1.2rem',
              color: 'var(--text-muted)',
              maxWidth: 440,
              margin: '0 auto 3rem',
              lineHeight: 1.5,
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
            }}
          >
            Transform any document into an accessible reading experience. Built for ADHD and dyslexia.
          </motion.p>

          {/* Try it live */}
          <motion.div {...fade(0.14)}>
            <p style={{
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 500,
            }}>
              Try it live
            </p>
            <HeroDemo />
          </motion.div>
        </section>

        {/* Upload */}
        <section id="upload-section" style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '4rem 2rem',
        }}>
          <motion.h2
            {...reveal}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              textAlign: 'center',
              marginBottom: '2rem',
              color: 'var(--text)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
            }}
          >
            Start reading
          </motion.h2>
          <UploadZone onContent={handleContent} />
        </section>

        {/* AI Showcase */}
        <section style={{ padding: '2rem 0' }}>
          <AIShowcase />
        </section>

        {/* Features */}
        <section style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '4rem 2rem 6rem',
        }}>
          <motion.div {...reveal} style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
              color: 'var(--text)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
            }}>
              Everything you need
            </h2>
            <p style={{
              color: 'var(--text-muted)',
              fontSize: '1.05rem',
              fontFamily: 'var(--font-display)',
              marginTop: '0.5rem',
            }}>
              Accessibility features that actually make a difference.
            </p>
          </motion.div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.5rem',
          }}>
            {FEATURES.map((f, i) => (
              <FeatureCard key={f.title} feature={f} index={i} />
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer role="contentinfo" style={{
        borderTop: '1px solid var(--border)',
        padding: '1.5rem 2rem',
      }}>
        <div style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}>
            FlowRead
          </span>
          <span style={{
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
            fontFamily: 'var(--font-display)',
          }}>
            by{' '}
            <a href="https://github.com/adityaroshann" target="_blank" rel="noreferrer"
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
              @adityaroshann
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
