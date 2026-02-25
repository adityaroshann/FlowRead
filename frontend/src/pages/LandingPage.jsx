import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import HeroDemo from '../components/HeroDemo';
import UploadZone from '../components/UploadZone';

const FEATURES = [
  { icon: '👁', title: 'Bionic Reading', desc: 'Bold the first half of every word. Your brain fills in the rest — up to 2× faster.' },
  { icon: '🤖', title: 'AI Summaries', desc: 'Get a TL;DR and key bullets for any document in seconds via Claude Haiku.' },
  { icon: '📄', title: 'Any Format', desc: 'PDF, DOCX, TXT, or paste a URL. We handle the extraction.' },
  { icon: '♿', title: 'Accessibility First', desc: 'Designed for ADHD and dyslexia. OpenDyslexic font, high-contrast mode, and TTS built in.' },
];

const fadeUp = (i) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.06, duration: 0.35 },
});

export default function LandingPage() {
  const navigate = useNavigate();

  const handleContent = (content) => {
    navigate('/reader', { state: content });
  };

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.25rem 2rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)' }}>
          Flow<span style={{ color: 'var(--accent)' }}>Read</span>
        </span>
        <a
          href="https://github.com/adityaroshann/flowread"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textDecoration: 'none' }}
        >
          GitHub ↗
        </a>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '5rem 2rem 3rem', textAlign: 'center' }}>
        <motion.div {...fadeUp(0)}>
          <span style={{
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
          }}>
            Accessibility-first reading
          </span>
        </motion.div>

        <motion.h1 {...fadeUp(1)} style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.5rem, 6vw, 4rem)',
          fontWeight: 700,
          lineHeight: 1.1,
          color: 'var(--text)',
          marginBottom: '1.25rem',
        }}>
          Read faster.<br />Focus better.
        </motion.h1>

        <motion.p {...fadeUp(2)} style={{
          fontSize: '1.15rem',
          color: 'var(--text-muted)',
          maxWidth: 520,
          margin: '0 auto 3rem',
          lineHeight: 1.7,
        }}>
          FlowRead transforms any document, PDF, or URL into a bionic reading experience — designed for ADHD and dyslexia.
        </motion.p>

        {/* Live demo */}
        <motion.div {...fadeUp(3)}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Try it live
          </p>
          <HeroDemo />
        </motion.div>
      </section>

      {/* Upload section */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 2rem', borderTop: '1px solid var(--border)' }}>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', textAlign: 'center', marginBottom: '2rem', color: 'var(--text)' }}
        >
          Load your document
        </motion.h2>
        <UploadZone onContent={handleContent} />
      </section>

      {/* Features */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 2rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.3 }}
              style={{ padding: '1.5rem', background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)' }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: '0.5rem', color: 'var(--text)' }}>{f.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.65 }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '2rem', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        Built by{' '}
        <a href="https://github.com/adityaroshann" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
          @adityaroshann
        </a>{' '}
        · Powered by Claude
      </footer>
    </main>
  );
}
