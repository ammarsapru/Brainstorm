import { useState, useEffect, useCallback } from 'react';
import { APIKeys } from '../components/APIKeyModal';
import { loadApiKeys, saveApiKeys, getStorageScope } from '../utils/apiKeyStorage';
import { getProviderForModel, getApiKeyFieldForProvider, LLMProvider } from '../utils/llmModels';
import { callAIProxy } from '../lib/supabase';
import debugLog from '../utils/debugLog';

const EMPTY: APIKeys = { openai: '', anthropic: '', gemini: '' };

const PROVIDER_MAP: Record<keyof APIKeys, string> = {
  gemini: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
};

const LLMPROVIDER_TO_STORAGE: Record<LLMProvider, string> = {
  google: 'google',
  openai: 'openai',
  anthropic: 'anthropic',
};

export function useApiKeys(userId?: string) {
  const scope = getStorageScope(userId);
  const [apiKeys, setApiKeys] = useState<APIKeys>(EMPTY);
  const [ready, setReady] = useState(false);
  // Tracks which providers have server-side keys (proxy can use them without local key)
  const [serverProviders, setServerProviders] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    // Load local encrypted keys (fast, always available)
    loadApiKeys(scope).then(keys => {
      if (!cancelled) {
        setApiKeys({ ...EMPTY, ...keys });
        setReady(true);
      }
    });

    // Check which providers are configured server-side (async, updates after render)
    if (userId) {
      callAIProxy({ action: 'check_keys' })
        .then(data => {
          if (!cancelled && Array.isArray(data.providers)) {
            setServerProviders(new Set(data.providers as string[]));
          }
        })
        .catch(() => {
          // Not authenticated yet or Supabase not configured — silent
        });
    }

    return () => { cancelled = true; };
  }, [scope, userId]);

  const persistKeys = useCallback(async (keys: APIKeys) => {
    // Always save locally (for fallback / image generation / offline)
    await saveApiKeys(scope, keys);
    setApiKeys(keys);

    // Also store server-side so the proxy can use them across devices
    if (userId) {
      const newServerProviders = new Set(serverProviders);
      for (const [field, storageProvider] of Object.entries(PROVIDER_MAP)) {
        const key = keys[field as keyof APIKeys]?.trim();
        if (!key) continue;
        try {
          await callAIProxy({ action: 'store_key', provider: storageProvider, apiKey: key });
          newServerProviders.add(storageProvider);
        } catch (e) {
          debugLog.warn('useApiKeys', `Failed to store ${storageProvider} key server-side`, e);
        }
      }
      setServerProviders(newServerProviders);
    }
  }, [scope, userId, serverProviders]);

  const hasKeyForProvider = useCallback((provider: LLMProvider): boolean => {
    const field = getApiKeyFieldForProvider(provider);
    const hasLocal = !!(apiKeys[field]?.trim());
    const hasServer = serverProviders.has(LLMPROVIDER_TO_STORAGE[provider]);
    return hasLocal || hasServer;
  }, [apiKeys, serverProviders]);

  const hasKeyForModel = useCallback((modelId: string): boolean => {
    return hasKeyForProvider(getProviderForModel(modelId));
  }, [hasKeyForProvider]);

  const getKeyForModel = useCallback((modelId: string): string | null => {
    const field = getApiKeyFieldForProvider(getProviderForModel(modelId));
    const key = apiKeys[field]?.trim();
    return key || null;
  }, [apiKeys]);

  return {
    apiKeys,
    ready,
    persistKeys,
    hasKeyForProvider,
    hasKeyForModel,
    getKeyForModel,
    serverProviders,
  };
}
