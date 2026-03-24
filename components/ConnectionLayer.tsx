import React from 'react';
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

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({
  connections,
  cards,
  connectingLine,
  selectedConnectionId,
  onSelectConnection
}) => {

  // Helper to find card center
  const getCardCenter = (id: string): Point | null => {
    const card = cards.find(c => c.id === id);
    if (!card) return null;
    return { x: card.x, y: card.y };
  };

  // Helper to calculate point on card edge
  const getCardEdgePoint = (center: Point, target: Point, cardId: string): Point => {
    const card = cards.find(c => c.id === cardId);
    // Fallback to default if card not found (shouldn't happen)
    const w = card ? card.width : CARD_WIDTH;
    const h = card ? card.height : CARD_HEIGHT;

    const dx = target.x - center.x;
    const dy = target.y - center.y;

    // If overlap or same point
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return center;

    // We model the card as a rectangle.
    // Line equation from center: P = center + t * (dx, dy)
    // We want to find smallest positive t where |x| = w/2 or |y| = h/2 (relative to center)

    // Check intersection with vertical edges (x = +/- w/2)
    // t_x * |dx| = w/2  => t_x = (w/2) / |dx|
    const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;

    // Check intersection with horizontal edges (y = +/- h/2)
    // t_y * |dy| = h/2  => t_y = (h/2) / |dy|
    const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;

    // The closest intersection gives us the edge point
    const t = Math.min(tX, tY);

    return {
      x: center.x + dx * t,
      y: center.y + dy * t
    };
  };

  const getPath = (p1: Point, p2: Point) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Control Point Offset logic
    const cpOffset = Math.min(dist * 0.5, 100);

    let cp1 = { x: p1.x + cpOffset, y: p1.y };
    let cp2 = { x: p2.x - cpOffset, y: p2.y };

    // Determine Orientation
    // If dy is significantly larger than dx, we treat it as a vertical connection.
    // We can also check direction.
    const isVertical = Math.abs(dy) > Math.abs(dx);

    if (isVertical) {
      // Vertical Logic
      const sign = Math.sign(dy); // 1 if Down (p2 below p1), -1 if Up (p2 above p1)

      // If going Down: Exit Bottom (y+), Enter Top (y-)
      // If going Up: Exit Top (y-), Enter Bottom (y+)

      cp1 = { x: p1.x, y: p1.y + cpOffset * sign };
      cp2 = { x: p2.x, y: p2.y - cpOffset * sign };

    } else {
      // Horizontal Logic
      const sign = Math.sign(dx); // 1 if Right, -1 if Left

      // If going Right: Exit Right (x+), Enter Left (x-)
      // If going Left: Exit Left (x-), Enter Right (x+)

      cp1 = { x: p1.x + cpOffset * sign, y: p1.y };
      cp2 = { x: p2.x - cpOffset * sign, y: p2.y };
    }

    // Cubic bezier 
    return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  };

  // Color Constants
  const COLOR_DEFAULT = "#3b82f6"; // Blue 500
  const COLOR_SELECTED = "#ffffff"; // White for contrast on dark bg

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
      {connections.map(conn => {
        const centerStart = getCardCenter(conn.fromId);
        const centerEnd = getCardCenter(conn.toId);
        if (!centerStart || !centerEnd) return null;

        // Calculate edge points so arrows appear on the boundary
        // Pass the ID of the card being targetted for edge calculation
        const start = getCardEdgePoint(centerStart, centerEnd, conn.fromId);
        const end = getCardEdgePoint(centerEnd, centerStart, conn.toId);

        const pathD = getPath(start, end);
        const isSelected = selectedConnectionId === conn.id;
        const color = isSelected ? COLOR_SELECTED : (conn.color || COLOR_DEFAULT);

        let strokeDasharray = "";
        if (conn.style === ConnectionStyle.DASHED) strokeDasharray = "8,4";
        if (conn.style === ConnectionStyle.DOTTED) strokeDasharray = "2,4";

        // Determine Markers based on RelationType
        let markerStart = undefined;
        let markerEnd = undefined;

        if (conn.relationType === RelationType.PARENT_TO_CHILD) {
          // Circle at Start, Arrow at End
          markerStart = `url(#marker-circle-start-${conn.id})`;
          markerEnd = `url(#marker-arrow-end-${conn.id})`;
        } else if (conn.relationType === RelationType.CHILD_TO_PARENT) {
          // Arrow at Start, Circle at End
          markerStart = `url(#marker-arrow-start-${conn.id})`;
          markerEnd = `url(#marker-circle-end-${conn.id})`;
        } else {
          // RelationType.EQUIVALENCE or Default: Double Arrow
          markerStart = `url(#marker-arrow-start-${conn.id})`;
          markerEnd = `url(#marker-arrow-end-${conn.id})`;
        }

        return (
          <g key={conn.id}
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
            {/* Invisible thicker path for easier hover/selection */}
            <path d={pathD} stroke="transparent" strokeWidth="20" fill="none" />

            {/* Visual Path */}
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