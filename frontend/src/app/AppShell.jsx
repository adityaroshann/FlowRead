import { NavLink } from 'react-router-dom';
import { BookMarked } from 'lucide-react';
import Brand from './Brand.jsx';

/**
 * Page frame for the landing page and the library: skip link, header,
 * one <main>, footer.
 */
export default function AppShell({ children, mainClass = '' }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <nav className="topnav" aria-label="Main">
            <NavLink to="/library">
              <BookMarked size={16} aria-hidden="true" />
              Library
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`page ${mainClass}`.trim()}>
        {children}
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <p>Documents you import are saved in this browser only.</p>
          <p>FlowRead supports reading; it is not a medical or diagnostic tool.</p>
        </div>
      </footer>
    </>
  );
}
