import { supabase } from '../lib/supabase';
import { ChatMessage, ChatAttachment } from '../types';
import debugLog from '../utils/debugLog';

/** Supabase `chat_messages`: id, session_id, role, text, timestamp, model */
type ChatMessageRow = {
  id: string;
  session_id: string;
  role: string;
  text: string;
  timestamp: string;
  model: string | null;
};

const toDbRole = (role: ChatMessage['role']): string =>
  role === 'user' ? 'user' : 'assistant';

const fromDbRole = (role: string): ChatMessage['role'] =>
  role === 'user' ? 'user' : 'model';

const mapRowToMessage = (row: ChatMessageRow, attachments: ChatAttachment[] = []): ChatMessage => ({
  id: row.id,
  role: fromDbRole(row.role),
  text: row.text || '',
  timestamp: new Date(row.timestamp).getTime(),
  model: row.model || undefined,
  attachments: attachments.length > 0 ? attachments : undefined,
});

export const loadChatHistory = async (sessionId: string): Promise<ChatMessage[]> => {
  if (!supabase) return [];

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, session_id, role, text, timestamp, model')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });

  if (error) {
    debugLog.error('chatService', 'Failed to load messages', error);
    return [];
  }

  const realMessages = (messages || []).filter(m => (m.text?.length ?? 0) > 0);
  if (!realMessages.length) return [];

  const messageIds = realMessages.map(m => m.id);
  const { data: attachments, error: attLoadError } = await supabase
    .from('chat_attachments')
    .select('id, message_id, url, name')
    .in('message_id', messageIds);

  if (attLoadError) {
    debugLog.error('chatService', 'Failed to load attachments', attLoadError);
  }

  const attachmentsByMessage = new Map<string, ChatAttachment[]>();
  (attachments || []).forEach(att => {
    const list = attachmentsByMessage.get(att.message_id) || [];
    list.push({
      id: att.id,
      type: att.url?.match(/\.(png|jpe?g|gif|webp)/i) ? 'image' : 'file',
      url: att.url,
      name: att.name || 'attachment',
    });
    attachmentsByMessage.set(att.message_id, list);
  });

  return realMessages.map(m =>
    mapRowToMessage(m as ChatMessageRow, attachmentsByMessage.get(m.id) || [])
  );
};

export type SaveChatResult = { ok: true } | { ok: false; error: string };

const buildMessageRow = (sessionId: string, message: ChatMessage): ChatMessageRow => ({
  id: message.id,
  session_id: sessionId,
  role: toDbRole(message.role),
  text: message.text ?? '',
  timestamp: new Date(message.timestamp).toISOString(),
  model: message.model ?? null,
});

export const saveChatMessage = async (
  sessionId: string,
  message: ChatMessage
): Promise<SaveChatResult> => {
  if (!supabase) {
    return { ok: false, error: 'Supabase is not configured' };
  }

  if (!message.model) {
    return { ok: false, error: 'Message is missing model id — cannot save to chat_messages.model' };
  }

  try {
    const row = buildMessageRow(sessionId, message);
    const { error: msgError } = await supabase
      .from('chat_messages')
      .upsert(row, { onConflict: 'id' });

    if (msgError) {
      debugLog.error('chatService', 'Failed to save message', { row, error: msgError });
      return {
        ok: false,
        error: `${msgError.message} (${msgError.code ?? 'unknown'}). Run supabase/chat_messages_migration.sql if the model column is missing.`,
      };
    }

    if (message.attachments?.length) {
      const attachmentRows = message.attachments.map(att => ({
        id: att.id,
        message_id: message.id,
        url: att.url,
        name: att.name,
      }));
      const { error: attError } = await supabase
        .from('chat_attachments')
        .upsert(attachmentRows, { onConflict: 'id' });
      if (attError) {
        debugLog.error('chatService', 'Failed to save attachments', attError);
        return { ok: false, error: attError.message };
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error saving chat';
    debugLog.error('chatService', 'saveChatMessage exception', e);
    return { ok: false, error: msg };
  }
};

export const fetchSessionsWithChatFlags = async (
  sessionIds: string[]
): Promise<Set<string>> => {
  if (!supabase || sessionIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('chat_messages')
    .select('session_id')
    .in('session_id', sessionIds);

  if (error || !data) return new Set();
  return new Set(data.map(r => r.session_id));
};
