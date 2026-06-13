import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { showToast } from '../utils/toast';

const runtimeEnv = window.__APP_ENV__ || {};
export const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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

// Resilient storage adapter for Supabase auth.
//
// Chrome's LevelDB (backing localStorage/IndexedDB) can hit FILE_ERROR_NO_SPACE
// on specific origins. sessionStorage is held in the renderer's in-process memory
// and is NOT backed by LevelDB, so it remains writable when LevelDB is full.
// Cookies (SQLite) are a further fallback — a separate file from LevelDB.
//
// For the PKCE code_verifier: sessionStorage is ideal because it survives same-tab
// cross-origin redirects (Google → back to app) without touching disk.

const COOKIE_PREFIX = 'sb_pkce_';
const COOKIE_TTL = 300; // 5 min — enough for one OAuth round-trip

const _cookieName = (key: string) =>
  COOKIE_PREFIX + btoa(key).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c] ?? c));

const _cookieRead = (key: string): string | null => {
  const name = _cookieName(key);
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const _cookieWrite = (key: string, value: string) => {
  const secure = location.protocol === 'https:' ? ';Secure' : '';
  document.cookie = `${_cookieName(key)}=${encodeURIComponent(value)};path=/;SameSite=Lax;max-age=${COOKIE_TTL}${secure}`;
};

const _cookieClear = (key: string) => {
  document.cookie = `${_cookieName(key)}=;path=/;max-age=0`;
};

const resilientStorage = {
  getItem: (key: string): string | null => {
    // 1. sessionStorage — in-memory, no LevelDB, survives same-tab redirects
    try { const v = sessionStorage.getItem(key); if (v !== null) return v; } catch {}
    // 2. cookie — SQLite file, separate from LevelDB
    const cv = _cookieRead(key);
    if (cv !== null) return cv;
    // 3. localStorage — may be broken, last resort
    try { return localStorage.getItem(key); } catch {}
    return null;
  },
  setItem: (key: string, value: string): void => {
    if (key.includes('code-verifier')) {
      // PKCE verifier: sessionStorage + cookie; skip localStorage to avoid LevelDB writes
      try { sessionStorage.setItem(key, value); } catch {}
      _cookieWrite(key, value);
      return;
    }
    // Session token and other keys: localStorage preferred (persistent), sessionStorage fallback
    try { localStorage.setItem(key, value); } catch {}
    try { sessionStorage.setItem(key, value); } catch {}
  },
  removeItem: (key: string): void => {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
    _cookieClear(key);
  },
};

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce', storage: resilientStorage },
    })
  : null;

export const isSupabaseConfigured = () => !!supabase;

export const callAIProxy = async (body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> => {
  if (!supabase || !supabaseUrl) throw new Error('Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Proxy error ${res.status}`);
  return data;
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'text/plain',
  'text/markdown',
];

// Magic byte signatures for the allowed types — guards against renamed files
const MAGIC_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  { bytes: [0xFF, 0xD8, 0xFF],        mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46],        mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46],  mime: 'image/webp' }, // RIFF header; full check in sniffMime
  { bytes: [0x25, 0x50, 0x44, 0x46],  mime: 'application/pdf' },
];

const sniffMime = async (file: File | Blob): Promise<boolean> => {
  const header = await file.slice(0, 8).arrayBuffer();
  const bytes = new Uint8Array(header);
  return MAGIC_SIGNATURES.some(sig =>
    sig.bytes.every((b, i) => bytes[i] === b)
  );
};

export const uploadFileToS3 = async (file: File | Blob): Promise<string | null> => {
  if (!supabase) return null;

  if (file.size > MAX_UPLOAD_BYTES) {
    showToast('File too large. Maximum upload size is 50 MB.', 'error');
    return null;
  }

  const mimeType = file.type || '';
  if (mimeType && !ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
    showToast(`File type "${mimeType}" is not supported. Use images, PDFs, or text files.`, 'error');
    return null;
  }

  // For binary types, validate magic bytes so a renamed .html can't sneak through
  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    const valid = await sniffMime(file);
    if (!valid) {
      showToast('File contents do not match its type. Upload rejected.', 'error');
      return null;
    }
  }

  // Use a UUID + extension so non-ASCII filenames never get mangled.
  // Display name is preserved separately in the FileSystem item name.
  const originalName = (file as File).name || 'upload';
  const ext = originalName.includes('.') ? '.' + originalName.split('.').pop()!.toLowerCase() : '';
  const fileName = `public/${crypto.randomUUID()}${ext}`;

  const { data, error } = await supabase.storage
    .from('workspace-files')
    .upload(fileName, file);

  if (error) {
    showToast('Upload failed. Check your connection and try again.', 'error');
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('workspace-files')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};
