import { useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

const getNavItems = (isAuthenticated) =>
  isAuthenticated
    ? [
        { label: 'Home', to: '/' },
        { label: 'Translate', to: '/translate' }
      ]
    : [
        { label: 'Home', to: '/' },
        { label: 'Translate', to: '/login' },
        { label: 'Login', to: '/login' }
      ];

function Navbar({ currentPath, session, setSession }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = getNavItems(session.authenticated);

  const activeLabel = useMemo(() => {
    const match = navItems.find((item) =>
      item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)
    );
    return match?.label ?? 'Home';
  }, [currentPath]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout/', {
        method: 'POST',
        credentials: 'include'
      });
    } finally {
      setSession({
        loading: false,
        authenticated: false,
        username: '',
        email: ''
      });
      setMenuOpen(false);
    }
  };

  return (
    <header className="site-header">
      <nav className="navbar glass-panel">
        <Link className="brand-lockup" to="/" onClick={() => setMenuOpen(false)} data-log-action="Open home from navbar" data-log-component="Navbar">
          <span className="brand-badge">S</span>
          <span className="brand-copy">
            <strong>SignMeet</strong>
            <small>AI ASL Translation</small>
          </span>
        </Link>

        <button
          type="button"
          className={`menu-toggle ${menuOpen ? 'is-open' : ''}`}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          data-log-action="Toggle navigation menu"
          data-log-component="Navbar"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className={`nav-cluster ${menuOpen ? 'is-open' : ''}`}>
          <div className="nav-links">
            {navItems.map((item) => (
              <NavLink
                key={`${item.label}-${item.to}`}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
                onClick={() => setMenuOpen(false)}
                end={item.to === '/'}
                data-log-action={`Navigate to ${item.label}`}
                data-log-component="Navbar"
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
          {session.authenticated ? (
            <div className="nav-session">
              <div className="nav-pill">Signed in as {session.username}</div>
              <button type="button" className="nav-logout" onClick={handleLogout} data-log-action="Logout" data-log-component="Navbar">
                Logout
              </button>
            </div>
          ) : (
            <div className="nav-pill">
              {session.loading ? 'Checking session...' : `Now viewing: ${activeLabel}`}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;
