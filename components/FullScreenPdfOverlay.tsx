import React from 'react';
import { X } from 'lucide-react';
import { usePdfBlobUrl } from './CardNode';

export const FullScreenPdfOverlay = ({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) => {
  const pdfBlobUrl = usePdfBlobUrl(src);
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col p-8 animate-in fade-in duration-200"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex justify-between items-center text-white mb-4 shrink-0 px-4 w-full max-w-6xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-medium truncate pr-4">{title || 'PDF Document'}</h2>
        <button
          className="text-white/70 hover:text-white p-2 bg-black/50 hover:bg-black/80 rounded-full transition-colors shrink-0"
          onClick={onClose}
        >
          <X className="w-6 h-6" />
        </button>
      </div>
      <div
        className="flex-1 w-full max-w-6xl mx-auto bg-white rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <embed src={pdfBlobUrl || src} type="application/pdf" className="w-full h-full border-none bg-white" title="PDF Viewer" />
      </div>
    </div>
  );
};
