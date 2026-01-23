
import { createClient } from '@supabase/supabase-js';

// Replace these with your actual environment variables or process.env calls
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper to check if supabase is configured
export const isSupabaseConfigured = () => !!supabase;
