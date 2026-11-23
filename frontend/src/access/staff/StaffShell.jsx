import { Link } from 'react-router-dom';
import { BookOpenCheck } from 'lucide-react';
import './staff.css';

/**
 * Page chrome for the staff workspace: skip link, header, and a <main>
 * landmark the skip link targets.
 */
export default function StaffShell({ children, actions = null, mainClassName = '' }) {
  return (
    <div className="fa-staff">
      <a className="fa-skip" href="#fa-main">Skip to main content</a>
      <header className="fa-header">
        <div className="fa-header__inner">
          <Link to="/access" className="fa-brand">
            <span className="fa-brand__mark" aria-hidden="true">
              <BookOpenCheck size={18} aria-hidden="true" />
            </span>
            <span>FlowRead Access</span>
            <span className="fa-brand__tag">Staff workspace</span>
          </Link>
          {actions && <div className="fa-header__nav">{actions}</div>}
        </div>
      </header>
      <main id="fa-main" tabIndex={-1} className={`fa-main ${mainClassName}`}>
        {children}
      </main>
    </div>
  );
}
