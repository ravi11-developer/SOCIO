import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert, LogOut } from 'lucide-react';
import { adminSupabase, isAdminConfigured } from './adminClient';
import LoginScreen from './LoginScreen';
import { CenteredCard } from './ui';
import Dashboard from './Dashboard';

/**
 * Auth gate for /admin.
 *   signed out          -> magic-link login
 *   signed in, not admin -> "not authorized" (and the database returns nothing anyway)
 *   signed in, admin     -> dashboard
 */
export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState('loading'); // loading | signed_out | checking | denied | admin
  const [urlError, setUrlError] = useState(null);

  const checkAdmin = useCallback(async (currentSession) => {
    if (!currentSession) {
      setState('signed_out');
      return;
    }
    setState('checking');
    const { data, error } = await adminSupabase.rpc('is_admin');
    setState(!error && data === true ? 'admin' : 'denied');
  }, []);

  useEffect(() => {
    if (!isAdminConfigured) return undefined;

    // Errors from an expired / reused magic link come back in the URL.
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, '&'));
    const errDesc = params.get('error_description');
    if (errDesc) setUrlError(errDesc.replace(/\+/g, ' '));

    adminSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      checkAdmin(data.session);
    });

    const { data: listener } = adminSupabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        // Strip ?code=... / #error=... from the address bar after the magic-link redirect.
        window.history.replaceState(null, '', '/admin');
        // Defer the RPC so it doesn't run inside the auth callback (supabase-js recommendation).
        setTimeout(() => checkAdmin(newSession), 0);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [checkAdmin]);

  const signOut = () => adminSupabase.auth.signOut();

  if (!isAdminConfigured) {
    return (
      <CenteredCard icon={<ShieldAlert className="w-6 h-6 text-red-600" />} title="Supabase is not configured">
        VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were not present when this site was built. Add them in your
        Cloudflare project settings and redeploy.
      </CenteredCard>
    );
  }

  if (state === 'loading' || state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-secondary gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">{state === 'checking' ? 'Checking access…' : 'Loading…'}</span>
      </div>
    );
  }

  if (state === 'signed_out') {
    return <LoginScreen initialError={urlError} />;
  }

  if (state === 'denied') {
    return (
      <CenteredCard icon={<ShieldAlert className="w-6 h-6 text-red-600" />} title="Not authorized">
        <p>
          You are signed in as <strong>{session?.user?.email}</strong>, but this account is not on the admin list.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-slate-50"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </CenteredCard>
    );
  }

  return <Dashboard email={session?.user?.email} onSignOut={signOut} />;
}
