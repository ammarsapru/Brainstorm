import { useState, useCallback, MutableRefObject } from 'react';
import { Stroke, DrawingTool } from '../types';

export interface UseDrawingResult {
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  currentStroke: Stroke | null;
  setCurrentStroke: React.Dispatch<React.SetStateAction<Stroke | null>>;
  drawingTool: DrawingTool;
  setDrawingTool: React.Dispatch<React.SetStateAction<DrawingTool>>;
  strokeColor: string;
  setStrokeColor: React.Dispatch<React.SetStateAction<string>>;
  strokeRadius: number;
  setStrokeRadius: React.Dispatch<React.SetStateAction<number>>;
  finalizeStroke: (stroke: Stroke) => void;
}

export function useDrawing(
  initialStrokes: Stroke[],
  isDirtyRef: MutableRefObject<boolean>,
  syncStroke?: (stroke: Stroke) => void
): UseDrawingResult {
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pen');
  const [strokeColor, setStrokeColor] = useState('#ef4444');
  const [strokeRadius, setStrokeRadius] = useState(3);

  const finalizeStroke = useCallback((stroke: Stroke) => {
    isDirtyRef.current = true;
    setStrokes(prev => [...prev, stroke]);
    setCurrentStroke(null);
    syncStroke?.(stroke);
  }, [isDirtyRef, syncStroke]);

  return {
    strokes, setStrokes,
    currentStroke, setCurrentStroke,
    drawingTool, setDrawingTool,
    strokeColor, setStrokeColor,
    strokeRadius, setStrokeRadius,
    finalizeStroke,
  };
}
