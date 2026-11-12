import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isAdminConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * Separate client for the admin dashboard.
 * Unlike the participant client, it keeps a login session (magic link, PKCE flow)
 * in its own storage key so it never collides with participant state.
 *
 * Only the public publishable/anon key is used here. Access to data is enforced
 * by Postgres RLS (is_admin()), never by this code.
 */
export const adminSupabase = isAdminConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'socio-admin-auth',
      },
    })
  : null;
