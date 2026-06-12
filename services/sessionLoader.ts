import { supabase } from '../lib/supabase';
import { Session, Stroke } from '../types';
import { mapSessionData } from '../src/utils/mappers';
import { loadChatHistory } from './chatService';
import debugLog from '../utils/debugLog';

/** Columns for dashboard — excludes heavy `strokes` JSONB. */
const SESSION_LIST_COLUMNS =
  'id, user_id, name, icon, thumbnail, viewport_x, viewport_y, viewport_zoom, last_modified';

/** Lightweight cards for session grid previews only. */
const CARD_PREVIEW_COLUMNS =
  'id, session_id, x, y, text, width, height, color, style, collection_id';

/** Full workspace metadata — strokes loaded separately (can be very large). */
const SESSION_WORKSPACE_COLUMNS =
  'id, user_id, name, icon, thumbnail, viewport_x, viewport_y, viewport_zoom, last_modified';

const LOAD_TIMEOUT_MS = 45_000;

const withTimeout = async <T>(
  promise: Promise<T>,
  label: string,
  ms = LOAD_TIMEOUT_MS
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
};

const parseStrokeRows = (rows: Record<string, unknown>[] | null): Stroke[] => {
  if (!rows?.length) return [];
  return rows.map(row => ({
    id: row.id as string,
    tool: (row.tool as Stroke['tool']) ?? 'pen',
    color: (row.color as string) ?? '#ffffff',
    radius: (row.radius as number) ?? 3,
    points: (row.points as Stroke['points']) ?? [],
  }));
};

/**
 * Fast dashboard load: session metadata + preview cards only.
 * Skips connections, file tree, strokes, card content/images.
 */
export const fetchSessionSummaries = async (
  userId: string
): Promise<Session[]> => {
  if (!supabase) return [];

  const t0 = performance.now();
  const { data: sessionsData, error: sessionsError } = await withTimeout(
    supabase
      .from('sessions')
      .select(SESSION_LIST_COLUMNS)
      .eq('user_id', userId)
      .order('last_modified', { ascending: false }),
    'fetchSessionSummaries'
  );

  if (sessionsError) throw sessionsError;
  if (!sessionsData?.length) return [];

  const sessionIds = sessionsData.map(s => s.id);
  const cardCounts = new Map<string, number>();
  const { data: cardRows, error: cardCountError } = await withTimeout(
    supabase
      .from('cards')
      .select('session_id')
      .in('session_id', sessionIds),
    'fetchSessionCardCounts'
  );

  if (!cardCountError && cardRows) {
    cardRows.forEach((row: { session_id?: string }) => {
      if (!row.session_id) return;
      cardCounts.set(row.session_id, (cardCounts.get(row.session_id) || 0) + 1);
    });
  }

  const mapped = sessionsData.map(s => {
    // Progressive loading: Load 0% card details on home screen mount to keep it instantaneous.
    // Cards are retrieved progressively only when a session is opened.
    return {
      ...mapSessionData(s, [], [], [], []),
      cardCount: cardCounts.get(s.id) || 0,
      isFullyLoaded: false,
    };
  });

  debugLog('sessionLoader', `summaries ${mapped.length} sessions`, {
    ms: Math.round(performance.now() - t0),
  });
  return mapped;
};

export type FetchFullSessionOptions = {
  /** Skip chat (load in background after canvas paints). Default false on open. */
  deferChat?: boolean;
  /** Skip strokes blob (load in background). Default true for faster open. */
  deferStrokes?: boolean;
};

/**
 * Full session payload when opening a workspace.
 */
export const fetchFullSession = async (
  sessionId: string,
  options: FetchFullSessionOptions = {}
): Promise<Session | null> => {
  if (!supabase) return null;

  const deferChat = options.deferChat ?? false;
  const deferStrokes = options.deferStrokes ?? true;
  const t0 = performance.now();

  const [
    { data: sessionData, error: sessionError },
    { data: cardsData, error: cardsError },
    { data: connsData, error: connsError },
    { data: filesData, error: filesError },
    { data: collectionsData, error: collectionsError },
    chatHistory,
  ] = await Promise.all([
    withTimeout(
      supabase
        .from('sessions')
        .select(SESSION_WORKSPACE_COLUMNS)
        .eq('id', sessionId)
        .maybeSingle(),
      'fetchSessionMeta'
    ),
    withTimeout(
      supabase.from('cards').select('*').eq('session_id', sessionId).limit(2000),
      'fetchSessionCards'
    ),
    withTimeout(
      supabase.from('connections').select('*').eq('session_id', sessionId).limit(2000),
      'fetchSessionConnections'
    ),
    withTimeout(
      supabase.from('file_system_nodes').select('*').eq('session_id', sessionId).limit(2000),
      'fetchSessionFiles'
    ),
    withTimeout(
      supabase.from('collections').select('*').eq('session_id', sessionId).limit(200),
      'fetchSessionCollections'
    ),
    deferChat
      ? Promise.resolve([])
      : withTimeout(loadChatHistory(sessionId), 'fetchSessionChat'),
  ]);

  if (sessionError) throw sessionError;
  if (!sessionData) return null;
  if (cardsError) throw cardsError;
  if (connsError) throw connsError;
  if (filesError) throw filesError;
  if (collectionsError) throw collectionsError;

  let strokes: Stroke[] = [];
  if (!deferStrokes) {
    const { data: strokeRows, error: strokeError } = await withTimeout(
      supabase.from('strokes').select('*').eq('session_id', sessionId).limit(10000),
      'fetchSessionStrokes'
    );
    if (strokeError) throw strokeError;
    strokes = parseStrokeRows(strokeRows as Record<string, unknown>[]);
  }

  const session = mapSessionData(
    { ...sessionData, strokes },
    cardsData || [],
    connsData || [],
    filesData || [],
    collectionsData || []
  );

  debugLog('sessionLoader', `full session ${sessionId.slice(0, 8)}…`, {
    ms: Math.round(performance.now() - t0),
    cards: cardsData?.length ?? 0,
    connections: connsData?.length ?? 0,
    deferChat,
    deferStrokes,
  });

  return { ...session, chatHistory, isFullyLoaded: true };
};

/** Load heavy blobs after the canvas is visible. */
export const fetchSessionHeavyData = async (
  sessionId: string
): Promise<{ strokes: Stroke[]; chatHistory: Awaited<ReturnType<typeof loadChatHistory>> }> => {
  if (!supabase) return { strokes: [], chatHistory: [] };

  const t0 = performance.now();
  const [{ data: strokeRows }, chatHistory] = await Promise.all([
    withTimeout(
      supabase.from('strokes').select('*').eq('session_id', sessionId).limit(10000),
      'fetchSessionStrokes'
    ),
    withTimeout(loadChatHistory(sessionId), 'fetchSessionChat'),
  ]);

  debugLog('sessionLoader', `heavy data ${sessionId.slice(0, 8)}…`, {
    ms: Math.round(performance.now() - t0),
  });

  return {
    strokes: parseStrokeRows(strokeRows as Record<string, unknown>[]),
    chatHistory,
  };
};

export const mergeSessionIntoList = (
  sessions: Session[],
  full: Session
): Session[] => sessions.map(s => (s.id === full.id ? full : s));
