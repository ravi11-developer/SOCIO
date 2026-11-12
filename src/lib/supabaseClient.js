import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  import.meta.env.MODE !== 'test' &&
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase Configuration] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured. ' +
    'The application will run in local-resilient simulation mode. ' +
    'To connect your live database, please copy .env.example to .env and configure your Supabase project credentials.'
  );
}

// Fallback dummy client for build/tests if env is not configured
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
