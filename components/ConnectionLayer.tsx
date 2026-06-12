import React, { useMemo } from 'react';
import { Connection, IdeaCard, ConnectionStyle, RelationType } from '../types';
import { CARD_WIDTH, CARD_HEIGHT } from '../constants';

interface ConnectionLayerProps {
  connections: Connection[];
  cards: IdeaCard[];
  connectingLine: { from: Point; to: Point } | null;
  selectedConnectionId?: string | null;
  onSelectConnection?: (id: string) => void;
}

interface Point { x: number; y: number; }

// Pure helpers — no component closure, safe to call from useMemo
function getCardCenter(cards: IdeaCard[], id: string): Point | null {
  const card = cards.find(c => c.id === id);
  return card ? { x: card.x, y: card.y } : null;
}

function getCardEdgePoint(cards: IdeaCard[], center: Point, target: Point, cardId: string) {
  const card = cards.find(c => c.id === cardId);
  const w = card ? card.width : CARD_WIDTH;
  const h = card ? card.height : CARD_HEIGHT;
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { point: center, normal: { x: 0, y: 0 } };
  const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return {
    point: { x: center.x + dx * t, y: center.y + dy * t },
    normal: { x: tX < tY ? Math.sign(dx) : 0, y: tX < tY ? 0 : Math.sign(dy) },
  };
}

function getPath(p1: Point, n1: Point, p2: Point, n2: Point): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const cpOffset = Math.min(dist * 0.5, 100);
  const cp1 = { x: p1.x + n1.x * cpOffset, y: p1.y + n1.y * cpOffset };
  const cp2 = { x: p2.x + n2.x * cpOffset, y: p2.y + n2.y * cpOffset };
  return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
}

interface ComputedPath {
  conn: Connection;
  pathD: string;
}

const COLOR_DEFAULT = "#3b82f6";
const COLOR_SELECTED = "#ffffff";

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({
  connections,
  cards,
  connectingLine,
  selectedConnectionId,
  onSelectConnection
}) => {
  const computedPaths = useMemo((): ComputedPath[] => {
    return connections.flatMap(conn => {
      const centerStart = getCardCenter(cards, conn.fromId);
      const centerEnd = getCardCenter(cards, conn.toId);
      if (!centerStart || !centerEnd) return [];
      const startData = getCardEdgePoint(cards, centerStart, centerEnd, conn.fromId);
      const endData = getCardEdgePoint(cards, centerEnd, centerStart, conn.toId);
      return [{ conn, pathD: getPath(startData.point, startData.normal, endData.point, endData.normal) }];
    });
  }, [connections, cards]);

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
      {computedPaths.map(({ conn, pathD }) => {
          const isSelected = selectedConnectionId === conn.id;
          const color = isSelected ? COLOR_SELECTED : (conn.color || COLOR_DEFAULT);

          let strokeDasharray = "";
          if (conn.style === ConnectionStyle.DASHED) strokeDasharray = "8,4";
          if (conn.style === ConnectionStyle.DOTTED) strokeDasharray = "2,4";

          let markerStart = undefined;
          let markerEnd = undefined;

          if (conn.relationType === RelationType.PARENT_TO_CHILD) {
            markerStart = `url(#marker-circle-start-${conn.id})`;
            markerEnd = `url(#marker-arrow-end-${conn.id})`;
          } else if (conn.relationType === RelationType.CHILD_TO_PARENT) {
            markerStart = `url(#marker-arrow-start-${conn.id})`;
            markerEnd = `url(#marker-circle-end-${conn.id})`;
          } else {
            markerStart = `url(#marker-arrow-start-${conn.id})`;
            markerEnd = `url(#marker-arrow-end-${conn.id})`;
          }

          return (
            <g key={conn.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelectConnection?.(conn.id); }}
              className="pointer-events-auto cursor-pointer group"
            >
                <defs>
                <marker id={`marker-arrow-end-${conn.id}`} markerWidth="20" markerHeight="20" refX="16" refY="10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
                  <path d="M2,5 L2,15 L14,10 z" fill={color} />
                </marker>
                <marker id={`marker-arrow-start-${conn.id}`} markerWidth="20" markerHeight="20" refX="4" refY="10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
                  <path d="M18,5 L18,15 L6,10 z" fill={color} />
                </marker>
                <marker id={`marker-circle-start-${conn.id}`} markerWidth="20" markerHeight="20" refX="10" refY="10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
                  <circle cx="10" cy="10" r="4" fill={color} />
                </marker>
                <marker id={`marker-circle-end-${conn.id}`} markerWidth="20" markerHeight="20" refX="10" refY="10" orient="auto" markerUnits="userSpaceOnUse" overflow="visible">
                  <circle cx="10" cy="10" r="4" fill={color} />
                </marker>
              </defs>
              <path d={pathD} stroke="transparent" strokeWidth="20" fill="none" />
              <path
                d={pathD}
                stroke={color}
                strokeWidth={isSelected ? "3" : "2"}
                fill="none"
                strokeDasharray={strokeDasharray}
                markerStart={markerStart}
                markerEnd={markerEnd}
                className="transition-colors duration-200"
              />
            </g>
          );
      })}

      {connectingLine && (
        <line
          x1={connectingLine.from.x}
          y1={connectingLine.from.y}
          x2={connectingLine.to.x}
          y2={connectingLine.to.y}
          stroke={COLOR_SELECTED}
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      )}
    </svg>
  );
};