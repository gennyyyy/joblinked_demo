import { DEMO_USERS } from './mockData';

// Demo stub — no network, no @supabase/supabase-js. Auth resolves synchronously
// so register / reset / change-password flows render instead of hanging on a
// pending promise.

const anonUser = { id: 'demo-anon', email: 'demo@joblinked.ph', user_metadata: {} };

// The demo user whose email matches (case-insensitive), else the anonymous
// placeholder — lets a login form pre-filled with a demo email resolve to that role.
function matchUserByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  return Object.values(DEMO_USERS).find((u) => String(u.email || '').toLowerCase() === target) || anonUser;
}

export const supabase = {
  auth: {
    onAuthStateChange(cb) {
      // Fire once async with no session, like the real client's INITIAL_SESSION.
      const t = setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe() { clearTimeout(t); } } } };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async ({ email }) => ({ data: { user: matchUserByEmail(email), session: {} }, error: null }),
    signUp: async () => ({ data: { user: anonUser, session: {} }, error: null }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: anonUser }, error: null }),
    updateUser: async () => ({ data: { user: anonUser }, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
  },
};
