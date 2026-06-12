import React, { useState, useRef, useEffect } from 'react';

export const FullScreenImageOverlay = ({ src, onClose }: { src: string; onClose: () => void }) => {
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setScale(s => Math.min(Math.max(0.1, s - e.deltaY * 0.003), 20));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 animate-in fade-in duration-200"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <img
        src={src}
        alt="Full screen view"
        className="max-w-[90vw] max-h-[90vh] object-contain shadow-2xl rounded"
        style={{ transform: `scale(${scale})`, transition: 'transform 0.05s linear' }}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/80 px-4 py-2 rounded-full text-sm backdrop-blur pointer-events-none">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
};
