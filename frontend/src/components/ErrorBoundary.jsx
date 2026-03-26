import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600 }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: 400 }}>
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.5rem',
              background: 'var(--accent)',
              color: '#1A1A1A',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
