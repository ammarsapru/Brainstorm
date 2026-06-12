import { APIKeys } from '../types';

const LEGACY_PREFIX = 'brainstorm_api_keys:';
const ENCRYPTED_PREFIX = 'brainstorm_api_keys_enc:';
const LEGACY_DEVICE_KEY = 'brainstorm_device_secret';

const IDB_DB = 'brainstorm-security';
const IDB_STORE = 'keys';
const IDB_DEVICE_KEY = 'device-key';

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });

const idbGet = <T>(db: IDBDatabase, key: string): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });

const idbSet = (db: IDBDatabase, key: string, value: unknown): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

// ── Key management ───────────────────────────────────────────────────────────

/**
 * Returns the non-extractable AES-GCM device key stored in IndexedDB.
 * On first call: migrates from the old localStorage secret if present, then
 * generates a fresh key and removes the legacy secret from localStorage.
 */
const getDeviceKey = async (): Promise<CryptoKey> => {
  const db = await openDb();
  const existing = await idbGet<CryptoKey>(db, IDB_DEVICE_KEY);
  if (existing) return existing;

  // Generate a new non-extractable AES-GCM key — JS can never read the raw bytes
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await idbSet(db, IDB_DEVICE_KEY, key);

  // Clean up old plaintext secret now that we have a proper key in IDB
  localStorage.removeItem(LEGACY_DEVICE_KEY);

  return key;
};

// ── Encoding helpers ─────────────────────────────────────────────────────────

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

// ── Encrypt / decrypt ────────────────────────────────────────────────────────

const encryptPayload = async (userScope: string, keys: APIKeys): Promise<string> => {
  const deviceKey = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(userScope);
  const encoded = new TextEncoder().encode(JSON.stringify(keys));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    deviceKey,
    encoded
  );
  return `${toBase64(iv.buffer)}.${toBase64(cipher)}`;
};

const decryptPayload = async (userScope: string, payload: string): Promise<APIKeys | null> => {
  const [ivB64, cipherB64] = payload.split('.');
  if (!ivB64 || !cipherB64) return null;
  const deviceKey = await getDeviceKey();
  const iv = fromBase64(ivB64);
  const cipher = fromBase64(cipherB64);
  const aad = new TextEncoder().encode(userScope);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      deviceKey,
      cipher
    );
    return JSON.parse(new TextDecoder().decode(plain)) as APIKeys;
  } catch {
    return null;
  }
};

// ── Legacy decryption (old localStorage-based secret) ───────────────────────

const decryptLegacy = async (userScope: string, payload: string): Promise<APIKeys | null> => {
  const secret = localStorage.getItem(LEGACY_DEVICE_KEY);
  if (!secret) return null;
  try {
    const [ivB64, cipherB64] = payload.split('.');
    if (!ivB64 || !cipherB64) return null;
    const material = new TextEncoder().encode(`${secret}::${userScope}`);
    const hash = await crypto.subtle.digest('SHA-256', material);
    const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = fromBase64(ivB64);
    const cipher = fromBase64(cipherB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as APIKeys;
  } catch {
    return null;
  }
};

// ── Legacy plaintext migration ───────────────────────────────────────────────

const emptyKeys = (): APIKeys => ({ openai: '', anthropic: '', gemini: '' });

const migratePlaintext = async (userScope: string): Promise<APIKeys> => {
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

// ── Public API ───────────────────────────────────────────────────────────────

export const saveApiKeys = async (userScope: string, keys: APIKeys): Promise<void> => {
  const encrypted = await encryptPayload(userScope, keys);
  localStorage.setItem(`${ENCRYPTED_PREFIX}${userScope}`, encrypted);
};

export const loadApiKeys = async (userScope: string): Promise<APIKeys> => {
  const enc = localStorage.getItem(`${ENCRYPTED_PREFIX}${userScope}`);
  if (enc) {
    // Try new IDB-key decryption first
    const decrypted = await decryptPayload(userScope, enc);
    if (decrypted) return { ...emptyKeys(), ...decrypted };

    // If that fails, try the old localStorage-secret decryption (migration path)
    const legacy = await decryptLegacy(userScope, enc);
    if (legacy) {
      // Successfully read old-format data — re-encrypt with new IDB key and persist
      await saveApiKeys(userScope, legacy);
      localStorage.removeItem(LEGACY_DEVICE_KEY);
      return { ...emptyKeys(), ...legacy };
    }

    console.warn('[apiKeyStorage] Decryption failed; keys may need re-entry.');
  }
  return migratePlaintext(userScope);
};

export const getStorageScope = (userId?: string): string => userId || 'anon';
