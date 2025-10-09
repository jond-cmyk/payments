import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- START DEBUG LOGS ---
console.log('Vercel Debug: VITE_SUPABASE_URL:', supabaseUrl);
console.log('Vercel Debug: VITE_SUPABASE_ANON_KEY (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'undefined/empty');
// --- END DEBUG LOGS ---

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your .env.local file or Vercel environment variables.');
  // You might want to throw an error or handle this more gracefully in a production app
  // For now, we'll return a dummy client to prevent crashing, but the app won't function.
  // In a real app, you'd likely want to throw an error or show a user-friendly message.
  // Returning a dummy client to allow the app to at least load and show the console errors.
  // This is a temporary measure for debugging.
  const dummyClient = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
          order: () => Promise.resolve({ data: [], error: new Error("Supabase not configured") }),
        }),
        order: () => Promise.resolve({ data: [], error: new Error("Supabase not configured") }),
        insert: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
        update: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }),
      }),
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: new Error("Supabase storage not configured") }),
        getPublicUrl: () => ({ publicUrl: '' }),
      }),
    },
  };
  return dummyClient as any; // Cast to any to match SupabaseClient type for now
} else {
  console.log('Supabase Client Init: URL:', supabaseUrl);
  console.log('Supabase Client Init: Anon Key (first 5 chars):', supabaseAnonKey.substring(0, 5) + '...');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);