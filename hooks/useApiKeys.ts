import { useState, useEffect, useCallback } from 'react';
import { APIKeys } from '../components/APIKeyModal';
import { loadApiKeys, saveApiKeys, getStorageScope } from '../utils/apiKeyStorage';
import { getProviderForModel, getApiKeyFieldForProvider, LLMProvider } from '../utils/llmModels';

const EMPTY: APIKeys = { openai: '', anthropic: '', gemini: '' };

export function useApiKeys(userId?: string) {
  const scope = getStorageScope(userId);
  const [apiKeys, setApiKeys] = useState<APIKeys>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    loadApiKeys(scope).then(keys => {
      if (!cancelled) {
        setApiKeys({ ...EMPTY, ...keys });
        setReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [scope]);

  const persistKeys = useCallback(async (keys: APIKeys) => {
    await saveApiKeys(scope, keys);
    setApiKeys(keys);
  }, [scope]);

  const hasKeyForProvider = useCallback((provider: LLMProvider): boolean => {
    const field = getApiKeyFieldForProvider(provider);
    return !!(apiKeys[field]?.trim());
  }, [apiKeys]);

  const hasKeyForModel = useCallback((modelId: string): boolean => {
    return hasKeyForProvider(getProviderForModel(modelId));
  }, [apiKeys, hasKeyForProvider]);

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
  };
}
