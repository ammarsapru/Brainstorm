import { useState, useRef, useEffect, useCallback } from 'react';
import { Viewport } from '../types';

export interface UseCanvasViewportResult {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  viewportRef: React.MutableRefObject<Viewport>;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
}

export function useCanvasViewport(initial?: {
  x?: number;
  y?: number;
  scale?: number;
}): UseCanvasViewportResult {
  const [viewport, setViewport] = useState<Viewport>({
    x: initial?.x ?? window.innerWidth / 2,
    y: initial?.y ?? window.innerHeight / 2,
    scale: initial?.scale ?? 1,
  });

  const viewportRef = useRef(viewport);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);

  // Stable: reads from ref so callers don't need to re-subscribe on viewport changes
  const screenToWorld = useCallback((sx: number, sy: number) => ({
    x: (sx - viewportRef.current.x) / viewportRef.current.scale,
    y: (sy - viewportRef.current.y) / viewportRef.current.scale,
  }), []);

  return { viewport, setViewport, viewportRef, screenToWorld };
}
