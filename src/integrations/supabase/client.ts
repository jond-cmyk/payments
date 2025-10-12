import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: SupabaseClient; // Declare supabase variable with type

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
        delete: () => Promise.resolve({ data: null, error: new Error("Supabase not configured") }), // Added delete for completeness
      }),
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: new Error("Supabase storage not configured") }),
        getPublicUrl: () => ({ publicUrl: '' }),
      }),
    },
    functions: { // Added functions for completeness
      invoke: () => Promise.resolve({ data: null, error: new Error("Supabase functions not configured") }),
    },
  };
  supabase = dummyClient as unknown as SupabaseClient; // Assign dummy client here, cast to unknown first
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true, // Explicitly set to true
    },
  }); // Assign real client
}

export { supabase };