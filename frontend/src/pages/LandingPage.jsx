import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';
import ThemeToggle from '../components/ThemeToggle';
import HeroDemo from '../components/HeroDemo';
import UploadZone from '../components/UploadZone';
import AIShowcase from '../components/AIShowcase';

const FEATURES = [
  { icon: '👁', title: 'Bionic Reading', desc: 'Bold the first half of every word. Your brain fills in the rest — up to 2× faster.' },
  { icon: '🤖', title: 'AI Summaries', desc: 'Get a TL;DR and key bullets for any document in seconds via Claude Haiku.' },
  { icon: '📄', title: 'Any Format', desc: 'PDF, DOCX, TXT, or paste a URL. We handle the extraction.' },
  { icon: '♿', title: 'Accessibility First', desc: 'Designed for ADHD and dyslexia. OpenDyslexic font, high-contrast mode, and TTS built in.' },
  { icon: '🔊', title: 'Text to Speech', desc: 'Listen to your documents read aloud with natural-sounding voice synthesis.' },
  { icon: '📤', title: 'Export Anywhere', desc: 'Export your bionic text as PDF or DOCX. Copy to clipboard in one click.' },
];

const fadeUp = (i) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
});

const scrollReveal = {
  initial: { opacity: 0, y: 50 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
};

function WaveDivider() {
  return (
    <div style={{ overflow: 'hidden', lineHeight: 0 }}>
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none"
        style={{ width: '100%', height: 50, display: 'block' }}>
        <path
          d="M0,60 C200,100 400,20 600,60 C800,100 1000,20 1200,60 L1200,120 L0,120 Z"
          fill="var(--bg-surface)"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

function FeatureCard({ feature, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '2rem',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 16,
        border: `1px solid ${hovered ? 'var(--accent)' : 'var(--glass-border)'}`,
        boxShadow: hovered
          ? '0 8px 32px rgba(0,0,0,0.12), 0 0 20px var(--glow-color)'
          : '0 4px 20px rgba(0,0,0,0.06)',
        transition: 'transform 250ms ease, box-shadow 300ms ease, border-color 250ms ease',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        cursor: 'default',
      }}
    >
      <motion.div
        animate={hovered ? { scale: 1.15, rotate: 5 } : { scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}
      >
        {feature.icon}
      </motion.div>
      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.05rem',
        marginBottom: '0.5rem',
        color: 'var(--text)',
        fontWeight: 600,
      }}>
        {feature.title}
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.65 }}>
        {feature.desc}
      </p>
    </motion.div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleContent = (content) => {
    navigate('/reader', { state: content });
  };

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)', transition: 'background 220ms ease' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.25rem 2rem',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'var(--bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 50,
        transition: 'background 220ms ease',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
          Flow<span style={{ color: 'var(--accent)' }}>Read</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <NavLink href="https://github.com/adityaroshannn/flowread">GitHub ↗</NavLink>
          <ThemeToggle theme={theme} onToggle={toggleTheme} size={18} />
        </div>
      </nav>

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', maxWidth: 800, margin: '0 auto', padding: '5rem 2rem 3rem', textAlign: 'center' }}>
        {/* Dot grid background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
          backgroundSize: '40px 40px',
          opacity: 0.3,
          pointerEvents: 'none',
        }} />

        <motion.div {...fadeUp(0)} style={{ position: 'relative' }}>
          <motion.span
            animate={{
              boxShadow: [
                '0 0 15px var(--glow-color)',
                '0 0 30px var(--glow-color-strong)',
                '0 0 15px var(--glow-color)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              display: 'inline-block',
              background: 'var(--accent)',
              color: '#1A1A1A',
              fontSize: '0.75rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              padding: '0.3rem 0.85rem',
              borderRadius: 100,
              marginBottom: '1.5rem',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Accessibility-first reading
          </motion.span>
        </motion.div>

        <motion.h1 {...fadeUp(1)} style={{
          position: 'relative',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 700,
          lineHeight: 1.1,
          background: 'linear-gradient(135deg, var(--text) 0%, var(--accent) 50%, var(--text) 100%)',
          backgroundSize: '200% 200%',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'gradient-shift 6s ease infinite',
          marginBottom: '1.25rem',
        }}>
          Read faster.<br />Focus better.
        </motion.h1>

        <motion.p {...fadeUp(2)} style={{
          position: 'relative',
          fontSize: '1.15rem',
          color: 'var(--text-muted)',
          maxWidth: 520,
          margin: '0 auto 3rem',
          lineHeight: 1.7,
        }}>
          FlowRead transforms any document, PDF, or URL into a bionic reading experience — designed for ADHD and dyslexia.
        </motion.p>

        {/* Live demo */}
        <motion.div {...fadeUp(3)} style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Try it live
          </p>
          <HeroDemo />
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          onClick={() => document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' })}
          style={{
            position: 'relative',
            marginTop: '2.5rem',
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            cursor: 'pointer',
            opacity: 0.6,
          }}
        >
          ↓
        </motion.div>
      </section>

      <WaveDivider />

      {/* Upload section */}
      <section id="upload-section" style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 2rem' }}>
        <motion.h2
          {...scrollReveal}
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', textAlign: 'center', marginBottom: '2rem', color: 'var(--text)', fontWeight: 700 }}
        >
          Load your document
        </motion.h2>
        <UploadZone onContent={handleContent} />
      </section>

      <WaveDivider />

      {/* AI Showcase */}
      <AIShowcase />

      <WaveDivider />

      {/* Features */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '4rem 2rem' }}>
        <motion.div {...scrollReveal} style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <p style={{
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.75rem',
            fontWeight: 700,
          }}>
            Features
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
            color: 'var(--text)',
            fontWeight: 700,
          }}>
            Everything you need to read better
          </h2>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '3rem 2rem 2rem' }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '2rem',
          marginBottom: '2rem',
        }}>
          {/* Brand */}
          <div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
              Flow<span style={{ color: 'var(--accent)' }}>Read</span>
            </span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: 1.6 }}>
              Accessibility-first reading, powered by AI.
            </p>
          </div>
          {/* Links */}
          <div>
            <p style={footerHeadingStyle}>Links</p>
            <FooterLink href="https://github.com/adityaroshannn/flowread">GitHub</FooterLink>
            <FooterLink href="#upload-section">Upload</FooterLink>
          </div>
          {/* Tech */}
          <div>
            <p style={footerHeadingStyle}>Built With</p>
            <p style={footerItemStyle}>React + Vite</p>
            <p style={footerItemStyle}>Claude API</p>
            <p style={footerItemStyle}>Framer Motion</p>
          </div>
        </div>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          textAlign: 'center',
          paddingTop: '1.5rem',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: '0.8rem',
        }}>
          Built by{' '}
          <a href="https://github.com/adityaroshannn" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            @adityaroshannn
          </a>{' '}
          · Powered by Claude
        </div>
      </footer>
    </main>
  );
}

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 150ms ease' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {children}
    </a>
  );
}

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      target={href.startsWith('#') ? undefined : '_blank'}
      rel={href.startsWith('#') ? undefined : 'noreferrer'}
      style={{
        display: 'block',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
        textDecoration: 'none',
        marginBottom: '0.4rem',
        transition: 'color 150ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {children}
    </a>
  );
}

const footerHeadingStyle = {
  fontSize: '0.7rem',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '0.75rem',
  fontWeight: 700,
};

const footerItemStyle = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  marginBottom: '0.4rem',
};
