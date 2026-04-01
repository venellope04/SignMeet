import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import { extractClickActivity, logActivity } from '../utils/activityLogger';

function MainLayout() {
  const location = useLocation();
  const [session, setSession] = useState({
    loading: true,
    authenticated: false,
    username: '',
    email: ''
  });

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await fetch('/api/auth/session/', {
          credentials: 'include'
        });
        const data = await response.json();

        if (!active) {
          return;
        }

        setSession({
          loading: false,
          authenticated: Boolean(data.authenticated),
          username: data.username || '',
          email: data.email || ''
        });
      } catch (error) {
        if (active) {
          setSession({
            loading: false,
            authenticated: false,
            username: '',
            email: ''
          });
        }
      }
    };

    loadSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session.authenticated) {
      return undefined;
    }

    const handleDocumentClick = (event) => {
      const payload = extractClickActivity(event.target);
      if (!payload) {
        return;
      }

      logActivity(payload);
    };

    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, [session.authenticated]);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />
      <Navbar currentPath={location.pathname} session={session} setSession={setSession} />
      <main className="page-shell">
        <Outlet context={{ session, setSession }} />
      </main>
    </div>
  );
}

export default MainLayout;
