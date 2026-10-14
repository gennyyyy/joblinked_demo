import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../hooks/useAuth';
import { DEMO_USERS } from '../lib/mockData';

const PORTAL_SEGMENTS = ['super-admin', 'employer', 'job-seeker'];

// Demo: the user is read straight off the URL. Any `/<portal>/…` path resolves to
// that portal's demo account, except `/<portal>/login`, which stays a guest so
// the sign-in screen renders instead of instantly bouncing back into the portal.
function demoUserForPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (!PORTAL_SEGMENTS.includes(parts[0])) return null;
  if (parts.length === 2 && parts[1] === 'login') return null;
  return DEMO_USERS[parts[0]];
}

function AuthProvider({ children }) {
  const location = useLocation();
  const [user, setUser] = useState(() => demoUserForPath(window.location.pathname));

  useEffect(() => {
    // In-app navigation updates `location`; browser back/forward fires popstate.
    // Both funnel through one re-read of the current path.
    const sync = () => setUser(demoUserForPath(location.pathname));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [location]);

  const value = {
    user,
    role: user?.role ?? null,
    loading: false,
    // ponytail: logout is a no-op so the AFK timer can't eject a demo viewer; wire to real sign-out when this demo grows a backend
    logout: async () => {},
    refreshUser: async () => user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
