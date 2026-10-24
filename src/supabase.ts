import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const cloudConfigured = Boolean(
  url?.startsWith('https://') && key && !key.includes('REPLACE_ME'),
);
export const supabase = cloudConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'da-tracker-supabase-auth',
      },
    })
  : null;

export async function requireCloud() {
  if (!supabase) throw new Error('Supabase is not configured. Add the publishable key to .env.local and rebuild the app.');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Your session has expired. Sign in again.');
  return { client: supabase, userId: data.user.id };
}

export async function currentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
