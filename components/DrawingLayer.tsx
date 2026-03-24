import React from 'react';
import { Stroke, Viewport } from '../types';

interface DrawingLayerProps {
  strokes: Stroke[];
  currentStroke: Stroke | null;
  viewport: Viewport;
  mousePos?: {x: number, y: number} | null;
  eraserRadius?: number;
}

export const DrawingLayer: React.FC<DrawingLayerProps> = ({ strokes, currentStroke, viewport, mousePos, eraserRadius }) => {
  
  const generatePath = (points: {x: number, y: number}[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x} ${points[0].y}`;
    
    // Smooth path generation using quadratic bezier curves
    let d = `M ${points[0].x} ${points[0].y} `;
    for (let i = 1; i < points.length; i++) {
        d += `L ${points[i].x} ${points[i].y} `;
    }
    return d;
  };

  const renderStroke = (stroke: Stroke) => {
    const isMarker = stroke.tool === 'marker';
    // The core feedback is precise pens and distinct markers.
    // Pen = precise (radius * 1), rounded.
    // Marker = thick (radius * 6), flat (square cap), translucent.
    return (
      <path
        key={stroke.id}
        d={generatePath(stroke.points)}
        fill="none"
        stroke={stroke.color}
        strokeWidth={isMarker ? stroke.radius * 6 : stroke.radius}
        strokeLinecap={isMarker ? "square" : "round"}
        strokeLinejoin={isMarker ? "miter" : "round"}
        opacity={isMarker ? 0.4 : 1}
        style={{ mixBlendMode: isMarker ? 'multiply' : 'normal' }}
      />
    );
  };

  const drawStrokes = strokes.filter(s => s.tool !== 'eraser');
  const eraserStrokes = strokes.filter(s => s.tool === 'eraser');
  
  if (currentStroke) {
    if (currentStroke.tool === 'eraser') {
      eraserStrokes.push(currentStroke);
    } else {
      drawStrokes.push(currentStroke);
    }
  }

  // HACK: Browsers often fail to repaint a masked element when the contents of its <mask > change.
  // By generating a dynamic mask ID based on the eraser content size, we force the <g> to update its mask attribute, triggering a repaint.
  const maskHash = eraserStrokes.reduce((acc, s) => acc + s.points.length, 0) + (currentStroke?.tool === 'eraser' ? currentStroke.points.length : 0);
  const maskId = `eraser-mask-${maskHash}`;

  return (
    <svg 
      className="absolute pointer-events-none"
      style={{
        zIndex: 5,
        left: -50000,
        top: -50000,
        width: 100000,
        height: 100000,
        overflow: 'visible'
      }}
      viewBox="-50000 -50000 100000 100000"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">
          <rect x="-100000" y="-100000" width="200000" height="200000" fill="white" />
          {eraserStrokes.map(stroke => (
            <path
              key={stroke.id}
              d={generatePath(stroke.points)}
              fill="none"
              stroke="black"
              strokeWidth={stroke.radius * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </mask>
      </defs>

      <g 
        mask={`url(#${maskId})`} 
        style={{ WebkitMask: `url(#${maskId})` }}
      >
        {drawStrokes.map(renderStroke)}
      </g>
      
      {mousePos && eraserRadius && (
        <circle 
          cx={mousePos.x} 
          cy={mousePos.y} 
          r={eraserRadius} 
          fill="rgba(0,0,0,0.8)" 
          pointerEvents="none" 
        />
      )}
    </svg>
  );
};
