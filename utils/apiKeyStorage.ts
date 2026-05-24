import { APIKeys } from '../components/APIKeyModal';

const LEGACY_PREFIX = 'brainstorm_api_keys:';
const ENCRYPTED_PREFIX = 'brainstorm_api_keys_enc:';
const DEVICE_KEY = 'brainstorm_device_secret';

/** API keys must be decryptable for outbound requests — use AES-GCM, not hashing. */
const getDeviceSecret = (): string => {
  let secret = localStorage.getItem(DEVICE_KEY);
  if (!secret) {
    secret = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, secret);
  }
  return secret;
};

const deriveKey = async (userScope: string): Promise<CryptoKey> => {
  const material = new TextEncoder().encode(`${getDeviceSecret()}::${userScope}`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

const fromBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const encryptPayload = async (userScope: string, keys: APIKeys): Promise<string> => {
  const key = await deriveKey(userScope);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(keys));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${toBase64(iv.buffer)}.${toBase64(cipher)}`;
};

const decryptPayload = async (userScope: string, payload: string): Promise<APIKeys | null> => {
  const [ivB64, cipherB64] = payload.split('.');
  if (!ivB64 || !cipherB64) return null;
  const key = await deriveKey(userScope);
  const iv = fromBase64(ivB64);
  const cipher = fromBase64(cipherB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain)) as APIKeys;
};

const emptyKeys = (): APIKeys => ({ openai: '', anthropic: '', gemini: '' });

const migrateLegacy = async (userScope: string): Promise<APIKeys> => {
  const legacyKey = `${LEGACY_PREFIX}${userScope}`;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return emptyKeys();
  try {
    const parsed = JSON.parse(raw) as APIKeys;
    await saveApiKeys(userScope, parsed);
    localStorage.removeItem(legacyKey);
    return parsed;
  } catch {
    return emptyKeys();
  }
};

export const saveApiKeys = async (userScope: string, keys: APIKeys): Promise<void> => {
  const encrypted = await encryptPayload(userScope, keys);
  localStorage.setItem(`${ENCRYPTED_PREFIX}${userScope}`, encrypted);
};

export const loadApiKeys = async (userScope: string): Promise<APIKeys> => {
  const enc = localStorage.getItem(`${ENCRYPTED_PREFIX}${userScope}`);
  if (enc) {
    try {
      const decrypted = await decryptPayload(userScope, enc);
      if (decrypted) return { ...emptyKeys(), ...decrypted };
    } catch {
      console.warn('[apiKeyStorage] Decryption failed; keys may need re-entry.');
    }
  }
  return migrateLegacy(userScope);
};

export const getStorageScope = (userId?: string): string => userId || 'anon';
