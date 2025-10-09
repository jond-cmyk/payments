import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your .env.local file.');
  // You might want to throw an error or handle this more gracefully in a production app
} else {
  console.log('Supabase Client Init: URL:', supabaseUrl);
  console.log('Supabase Client Init: Anon Key (first 5 chars):', supabaseAnonKey.substring(0, 5) + '...');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);