import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://kmruofopvgjutpioesow.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttcnVvZm9wdmdqdXRwaW9lc293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MjcyNjcsImV4cCI6MjA3NTUwMzI2N30.wh_kBMsc7vPL49khM0i7ysNQryS-EdNV2q7f7Rljm88";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);