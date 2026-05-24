import { ChatMessage } from '../types';

/** Messages belonging to one LLM thread within a session. */
export const filterHistoryForModel = (
  history: ChatMessage[],
  modelId: string
): ChatMessage[] => {
  const anyTagged = history.some(m => m.model);
  if (!anyTagged) return history;
  return history.filter(m => m.model === modelId);
};

/** Thread to hand off when leaving a model (includes legacy untagged rows). */
export const getOutgoingThread = (
  history: ChatMessage[],
  fromModelId: string
): ChatMessage[] =>
  history.filter(m => m.model === fromModelId || !m.model);

export const countThreadMessages = (thread: ChatMessage[]): number =>
  thread.filter(m => m.text?.trim()).length;
