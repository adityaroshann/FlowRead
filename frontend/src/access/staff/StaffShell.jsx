import { Link } from 'react-router-dom';
import { BrandMark } from '../../app/Brand.jsx';
import './staff.css';

/**
 * Page chrome for the workspace and the "fix structure" editor: skip link,
 * header, and a <main> landmark the skip link targets.
 */
export default function StaffShell({ children, actions = null, mainClassName = '', mode = 'workspace' }) {
  const personal = mode === 'personal';
  return (
    <div className="fa-staff">
      <a className="fa-skip" href="#fa-main">Skip to main content</a>
      <header className="fa-header">
        <div className="fa-header__inner">
          <Link to={personal ? '/library' : '/workspace'} className="fa-brand">
            <BrandMark size={22} />
            <span>FlowRead</span>
            <span className="fa-brand__tag">{personal ? 'Library' : 'For institutions'}</span>
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
