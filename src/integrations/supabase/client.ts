import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- START DEBUG LOGS ---
console.log('Vercel Debug: VITE_SUPABASE_URL:', supabaseUrl);
console.log('Vercel Debug: VITE_SUPABASE_ANON_KEY (first 5 chars):', supabaseAnonKey ? supabaseAnonKey.substring(0, 5) + '...' : 'undefined/empty');
// --- END DEBUG LOGS ---

let supabase: SupabaseClient; // Declare supabase variable with type

console.log('Supabase Client: Attempting to create client...'); // New debug log

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your .env.local file or Vercel environment variables.');
  // Dummy client definition
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
  supabase = dummyClient as SupabaseClient; // Assign dummy client
} else {
  console.log('Supabase Client Init: URL:', supabaseUrl);
  console.log('Supabase Client Init: Anon Key (first 5 chars):', supabaseAnonKey.substring(0, 5) + '...');
  supabase = createClient(supabaseUrl, supabaseAnonKey); // Assign real client
}

export { supabase };