import { NavLink } from 'react-router-dom';
import { BookMarked, Moon, Sun } from 'lucide-react';
import Brand from './Brand.jsx';
import { updateSettings, usePrefs } from '../access/reader/readerPrefs.js';

/**
 * Page frame for the landing page and the library: skip link, header,
 * one <main>, footer.
 */
export default function AppShell({ children, mainClass = '' }) {
  const { settings } = usePrefs();
  const dark = settings.theme === 'dark' || settings.theme === 'high-contrast';
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
            <button
              type="button"
              className="btn btn-icon btn-quiet topnav-theme"
              onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
              aria-label={dark ? 'Light theme' : 'Dark theme'}
              title={dark ? 'Light theme' : 'Dark theme'}
            >
              {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
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
