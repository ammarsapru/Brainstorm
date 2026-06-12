import { useState, useRef, useEffect, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { Connection, IdeaCard, Point } from '../types';
import { DEFAULT_CONNECTION_STYLE, DEFAULT_ARROW_START, DEFAULT_ARROW_END, DEFAULT_RELATION_TYPE } from '../constants';
import { generateId } from '../utils/generateId';

export interface UseConnectionManagerResult {
  connections: Connection[];
  setConnections: Dispatch<SetStateAction<Connection[]>>;
  connectionsRef: MutableRefObject<Connection[]>;
  selectedConnectionId: string | null;
  setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
  connectingFromId: string | null;
  setConnectingFromId: Dispatch<SetStateAction<string | null>>;
  connColorPickerOpen: boolean;
  setConnColorPickerOpen: Dispatch<SetStateAction<boolean>>;
  handleUpdateConnection: (id: string, updates: Partial<Connection>) => void;
  startConnection: (e: React.MouseEvent, id: string, cardsRef: MutableRefObject<IdeaCard[]>) => void;
  getSelectedConnection: () => Connection | undefined;
  getConnToolbarPos: (cards: IdeaCard[]) => Point;
}

interface UseConnectionManagerOptions {
  initialConnections: Connection[];
  isDirtyRef: MutableRefObject<boolean>;
  syncUpdateConnection: (conn: Connection) => void;
  deleteConnection: (id: string) => void;
}

export function useConnectionManager({
  initialConnections,
  isDirtyRef,
  syncUpdateConnection,
  deleteConnection,
}: UseConnectionManagerOptions): UseConnectionManagerResult {
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const connectionsRef = useRef(connections);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connColorPickerOpen, setConnColorPickerOpen] = useState(false);

  const handleUpdateConnection = useCallback((id: string, updates: Partial<Connection>) => {
    isDirtyRef.current = true;
    const existing = connectionsRef.current.find(c => c.id === id);
    if (existing) syncUpdateConnection({ ...existing, ...updates });
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, [isDirtyRef, syncUpdateConnection]);

  const startConnection = useCallback((
    e: React.MouseEvent,
    id: string,
    cardsRef: MutableRefObject<IdeaCard[]>
  ) => {
    e.stopPropagation();
    setConnectingFromId(id);
  }, []);

  const getSelectedConnection = useCallback(() => {
    return connectionsRef.current.find(c => c.id === selectedConnectionId);
  }, [selectedConnectionId]);

  const getConnToolbarPos = useCallback((cards: IdeaCard[]): Point => {
    const sel = connectionsRef.current.find(c => c.id === selectedConnectionId);
    if (!sel) return { x: 0, y: 0 };

    const c1 = cards.find(c => c.id === sel.fromId);
    const c2 = cards.find(c => c.id === sel.toId);
    if (!c1 || !c2) return { x: 0, y: 0 };

    const getEdge = (center: Point, target: Point, card: IdeaCard): Point => {
      const w = card.width || 256;
      const h = card.height || 100;
      const dx = target.x - center.x;
      const dy = target.y - center.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return center;
      const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
      const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
      const t = Math.min(tX, tY);
      return { x: center.x + dx * t, y: center.y + dy * t };
    };

    const center1 = { x: c1.x, y: c1.y };
    const center2 = { x: c2.x, y: c2.y };
    const start = getEdge(center1, center2, c1);
    const end = getEdge(center2, center1, c2);
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }, [selectedConnectionId]);

  return {
    connections, setConnections, connectionsRef,
    selectedConnectionId, setSelectedConnectionId,
    connectingFromId, setConnectingFromId,
    connColorPickerOpen, setConnColorPickerOpen,
    handleUpdateConnection,
    startConnection,
    getSelectedConnection,
    getConnToolbarPos,
  };
}
