import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../app/AppShell.jsx';

export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · FlowRead';
  }, []);
  return (
    <AppShell>
      <h1 className="display" style={{ fontSize: 'var(--t-2xl)', margin: '0 0 var(--s-4)' }}>
        There’s no page here
      </h1>
      <p>
        The link may be out of date. <Link to="/">Import a document</Link> or open your <Link to="/library">library</Link>.
      </p>
    </AppShell>
  );
}
