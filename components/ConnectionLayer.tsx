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

  // --- WORKFLOW EXPLANATION ---
  // 1. First, we identify the mathematical center of the two cards we want to connect.
  //    (Because in CardNode.tsx, card.x and card.y represent the absolute center of the card via `translate(-50%, -50%)`).
  const getCardCenter = (id: string): Point | null => {
    const card = cards.find(c => c.id === id);
    if (!card) return null;
    return { x: card.x, y: card.y };
  };

  // 2. To avoid lines crossing through the text inside the card, we want the lines to start exactly at the card's EDGE.
  //    This helper traces a straight line from the card's center toward the target card's center, 
  //    and stops exactly on the rectangular boundary of the card.
  //    We also return the outward 'normal' direction of that boundary edge to correctly curve the lines outward.
  const getCardEdgePoint = (center: Point, target: Point, cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    
    // We get the dimensions of the card box.
    const w = card ? card.width : CARD_WIDTH;
    const h = card ? card.height : CARD_HEIGHT;

    // Vector pointing from this card's center to the target card's center
    const dx = target.x - center.x;
    const dy = target.y - center.y;

    // If the cards directly overlap exactly, return the center safely.
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return { point: center, normal: { x: 0, y: 0 } };

    // Calculate when the ray hits the left or right vertical edges (distance from center is w/2)
    const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;

    // Calculate when the ray hits the top or bottom horizontal edges (distance from center is h/2)
    const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;

    // The true edge of the card is whichever "wall" the ray hits first (the smallest t)
    const t = Math.min(tX, tY);

    // Determine the outward normal vector for the edge we hit
    let nx = 0;
    let ny = 0;

    if (tX < tY) {
      // Ray hit vertical edge (Left or Right wall), normal is horizontal
      nx = Math.sign(dx);
    } else {
      // Ray hit horizontal edge (Top or Bottom wall), normal is vertical
      ny = Math.sign(dy);
    }

    // Return the exact coordinate on the boundary of the card along with the normal.
    return {
      point: {
        x: center.x + dx * t,
        y: center.y + dy * t
      },
      normal: { x: nx, y: ny }
    };
  };

  // 3. This function actually calculates the curvature of the connecting line between the two EDGE points we found above.
  const getPath = (p1: Point, n1: Point, p2: Point, n2: Point) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Control Point Offset logic (creates the "bend" in the Bezier curve)
    // The curve bows outwards based on distance
    const cpOffset = Math.min(dist * 0.5, 100);

    // Control points are calculated by moving directly AWAY from the card edge face along the outward normal.
    // This strictly ensures the curve is never directed 'inwards' into the card body.
    const cp1 = { x: p1.x + n1.x * cpOffset, y: p1.y + n1.y * cpOffset };
    const cp2 = { x: p2.x + n2.x * cpOffset, y: p2.y + n2.y * cpOffset };

    // Cubic bezier curve path data (SVG 'd' attribute syntax)
    return `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  };

  // Color Constants
  const COLOR_DEFAULT = "#3b82f6"; // Blue 500
  const COLOR_SELECTED = "#ffffff"; // White for contrast on dark bg

  // 4. Finally, this is the main render loop that stitches everything together and builds the SVG.
  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
      {connections.map(conn => {
        // Step A: Get perfect visual centers
        const centerStart = getCardCenter(conn.fromId);
        const centerEnd = getCardCenter(conn.toId);
        if (!centerStart || !centerEnd) return null;

        // Step B: Calculate edge points so arrows appear EXACTLY on the boundary of the card
        const startData = getCardEdgePoint(centerStart, centerEnd, conn.fromId);
        const endData = getCardEdgePoint(centerEnd, centerStart, conn.toId);

        // Step C: Draw the actual bezier curve using the points and boundary normals
        const pathD = getPath(startData.point, startData.normal, endData.point, endData.normal);
        const isSelected = selectedConnectionId === conn.id;
        const color = isSelected ? COLOR_SELECTED : (conn.color || COLOR_DEFAULT);

        let strokeDasharray = "";
        if (conn.style === ConnectionStyle.DASHED) strokeDasharray = "8,4";
        if (conn.style === ConnectionStyle.DOTTED) strokeDasharray = "2,4";

        // Determine Markers (Arrowheads/Circles) based on RelationType
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