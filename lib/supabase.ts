import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Debug logging for development
if (import.meta.env.DEV) {
  console.log('🔧 Supabase Configuration:', {
    url: supabaseUrl ? '✅ Set' : '❌ Missing',
    keyLength: supabaseAnonKey?.length || 0,
    hasKey: !!supabaseAnonKey
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase is not configured. Authentication features will not work.');
  console.warn('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

export const isSupabaseConfigured = () => !!supabase;

export const uploadFileToS3 = async (file: File | Blob): Promise<string | null> => {
  if (!supabase) return null;

  // Since it can be a file or blob from clipboard, handle missing names
  const originalName = (file as File).name || 'pasted-image.png';
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const fileName = `public/${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from('workspace-files')
    .upload(fileName, file);

  if (error) {
    console.error("Supabase upload error:", error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('workspace-files')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};
