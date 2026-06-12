import { APIKeys } from '../types';

export type LLMProvider = 'google' | 'openai' | 'anthropic';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  providerLabel: string;
}

export const LLM_MODELS: LLMModel[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', providerLabel: 'Google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', providerLabel: 'Google' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', providerLabel: 'OpenAI' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', providerLabel: 'OpenAI' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic', providerLabel: 'Anthropic' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'anthropic', providerLabel: 'Anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', providerLabel: 'Anthropic' },
];

export const DEFAULT_MODEL_ID = 'gemini-2.5-flash';

export const getModelById = (modelId: string): LLMModel =>
  LLM_MODELS.find(m => m.id === modelId) ?? LLM_MODELS[0];

export const getProviderForModel = (modelId: string): LLMProvider =>
  getModelById(modelId).provider;

export const getApiKeyFieldForProvider = (provider: LLMProvider): keyof APIKeys => {
  switch (provider) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    default: return 'gemini';
  }
};

export const selectedModelStorageKey = (userId?: string) =>
  `brainstorm_selected_model:${userId || 'anon'}`;

export const loadSelectedModelId = (userId?: string): string => {
  const saved = localStorage.getItem(selectedModelStorageKey(userId));
  if (saved && LLM_MODELS.some(m => m.id === saved)) return saved;
  return DEFAULT_MODEL_ID;
};

export const saveSelectedModelId = (userId: string | undefined, modelId: string) => {
  localStorage.setItem(selectedModelStorageKey(userId), modelId);
};

/** Image/icon generation currently requires Gemini Imagen. */
export const requiresGemini = (feature: 'image' | 'icon'): boolean =>
  feature === 'image' || feature === 'icon';
