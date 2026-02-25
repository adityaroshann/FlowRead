import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useBionicTransform } from '../hooks/useBionicTransform';

const PLACEHOLDER = `Paste or type any text here and watch it transform in real time. Bionic reading bolds the first part of each word, guiding your eye and helping you read faster with less effort.`;

export default function HeroDemo() {
  const [input, setInput] = useState('');
  const { result, loading, transformDebounced } = useBionicTransform();

  useEffect(() => {
    transformDebounced(input || PLACEHOLDER, 0.45, 300);
  }, [input, transformDebounced]);

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      maxWidth: 680,
      margin: '0 auto',
    }}>
      {/* Input area */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={PLACEHOLDER}
        style={{
          width: '100%',
          minHeight: 120,
          padding: '1.25rem 1.5rem',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: '1rem',
          lineHeight: 1.7,
          resize: 'none',
          outline: 'none',
        }}
      />

      {/* Output: bionic rendered */}
      <div style={{ padding: '1.25rem 1.5rem', minHeight: 80 }}>
        <div
          style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Bionic View
        </div>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Transforming…</div>
        ) : result ? (
          <motion.div
            key={result.html.slice(0, 40)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="bionic-text"
            dangerouslySetInnerHTML={{ __html: result.html }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              lineHeight: 1.8,
              color: 'var(--text)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
