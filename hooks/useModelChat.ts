import { useState, useRef, useEffect, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { ChatMessage, APIKeys } from '../types';
import { useApiKeys } from './useApiKeys';
import {
  loadSelectedModelId,
  saveSelectedModelId,
  getProviderForModel,
  getModelById,
} from '../utils/llmModels';
import { filterHistoryForModel, getOutgoingThread, countThreadMessages } from '../utils/chatModelThread';
import { summarizeChatHandoff } from '../services/aiService';
import { saveChatMessage } from '../services/chatService';
import { showToast } from '../utils/toast';
import debugLog from '../utils/debugLog';

const generateId = () => crypto.randomUUID();

export interface UseModelChatResult {
  apiKeys: APIKeys;
  persistKeys: (keys: APIKeys) => void;
  selectedModelId: string;
  chatHistoryForModel: ChatMessage[];
  isChatProcessing: boolean;
  setIsChatProcessing: Dispatch<SetStateAction<boolean>>;
  isHandoffProcessing: boolean;
  handoffContextRef: React.MutableRefObject<string | null>;
  isApiKeyModalOpen: boolean;
  setIsApiKeyModalOpen: Dispatch<SetStateAction<boolean>>;
  apiKeyModalVariant: 'settings' | 'ai-required';
  requiredProvider: 'google' | 'openai' | 'anthropic';
  openApiKeyModal: (variant: 'settings' | 'ai-required', provider?: 'google' | 'openai' | 'anthropic') => void;
  ensureKeyForModel: (modelId: string) => boolean;
  handleModelChange: (newModelId: string) => Promise<void>;
}

interface UseModelChatOptions {
  userId?: string;
  sessionId: string;
  sessionName: string;
  chatHistory: ChatMessage[];
  setChatHistory: Dispatch<SetStateAction<ChatMessage[]>>;
}

export function useModelChat({
  userId,
  sessionId,
  sessionName,
  chatHistory,
  setChatHistory,
}: UseModelChatOptions): UseModelChatResult {
  const { apiKeys, persistKeys, hasKeyForModel } = useApiKeys(userId);

  const [selectedModelId, setSelectedModelId] = useState(() => loadSelectedModelId(userId));
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [isHandoffProcessing, setIsHandoffProcessing] = useState(false);
  const handoffContextRef = useRef<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyModalVariant, setApiKeyModalVariant] = useState<'settings' | 'ai-required'>('settings');
  const [requiredProvider, setRequiredProvider] = useState<'google' | 'openai' | 'anthropic'>('google');

  useEffect(() => {
    setSelectedModelId(loadSelectedModelId(userId));
  }, [userId]);

  const chatHistoryForModel = useMemo(
    () => filterHistoryForModel(chatHistory, selectedModelId),
    [chatHistory, selectedModelId]
  );

  const openApiKeyModal = useCallback((
    variant: 'settings' | 'ai-required',
    provider?: 'google' | 'openai' | 'anthropic'
  ) => {
    setApiKeyModalVariant(variant);
    setRequiredProvider(provider || getProviderForModel(selectedModelId));
    setIsApiKeyModalOpen(true);
  }, [selectedModelId]);

  const ensureKeyForModel = useCallback((modelId: string): boolean => {
    if (hasKeyForModel(modelId)) return true;
    openApiKeyModal('ai-required', getProviderForModel(modelId));
    return false;
  }, [hasKeyForModel, openApiKeyModal]);

  const handleModelChange = useCallback(async (newModelId: string) => {
    if (newModelId === selectedModelId) return;

    const prevModelId = selectedModelId;
    const outgoingThread = getOutgoingThread(chatHistory, prevModelId);

    setSelectedModelId(newModelId);
    saveSelectedModelId(userId, newModelId);
    handoffContextRef.current = null;

    if (countThreadMessages(outgoingThread) === 0) return;

    if (!ensureKeyForModel(prevModelId)) {
      setSelectedModelId(prevModelId);
      saveSelectedModelId(userId, prevModelId);
      return;
    }
    if (!ensureKeyForModel(newModelId)) {
      setSelectedModelId(prevModelId);
      saveSelectedModelId(userId, prevModelId);
      return;
    }

    setIsHandoffProcessing(true);
    try {
      const summary = await summarizeChatHandoff(outgoingThread, apiKeys, prevModelId, sessionName);
      const fromName = getModelById(prevModelId).name;
      const handoffMsg: ChatMessage = {
        id: generateId(),
        role: 'model',
        text: `**Context from ${fromName}**\n\n${summary}`,
        timestamp: Date.now(),
        model: newModelId,
        isHandoff: true,
      };

      handoffContextRef.current = summary;
      setChatHistory(prev => [...prev, handoffMsg]);
      const saveResult = await saveChatMessage(sessionId, handoffMsg);
      if (!saveResult.ok) {
        debugLog.error('useModelChat', 'Failed to save handoff message', saveResult.error);
      }
    } catch (err) {
      debugLog.error('useModelChat', 'Model handoff failed', err);
      showToast(
        `Could not switch model: ${err instanceof Error ? err.message : 'Check API keys and try again.'}`,
        'error'
      );
      setSelectedModelId(prevModelId);
      saveSelectedModelId(userId, prevModelId);
    } finally {
      setIsHandoffProcessing(false);
    }
  }, [selectedModelId, chatHistory, userId, ensureKeyForModel, apiKeys, sessionName, sessionId, setChatHistory]);

  return {
    apiKeys,
    persistKeys,
    selectedModelId,
    chatHistoryForModel,
    isChatProcessing,
    setIsChatProcessing,
    isHandoffProcessing,
    handoffContextRef,
    isApiKeyModalOpen,
    setIsApiKeyModalOpen,
    apiKeyModalVariant,
    requiredProvider,
    openApiKeyModal,
    ensureKeyForModel,
    handleModelChange,
  };
}
