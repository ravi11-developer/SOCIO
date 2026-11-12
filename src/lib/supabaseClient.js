import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  import.meta.env.VITE_SUPABASE_URL || 'https://kdeqrmyluupkuzfkdrey.supabase.co';
const supabaseAnonKey = 
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_y23ZSpAt8h14N97ZZej2sQ_9ip7E1hk';

export const isSupabaseConfigured = Boolean(
  import.meta.env.MODE !== 'test' &&
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

if (!isSupabaseConfigured && import.meta.env.MODE !== 'test') {
  console.warn(
    '[Supabase Configuration] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not configured. ' +
    'The application will run in local-resilient simulation mode.'
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
