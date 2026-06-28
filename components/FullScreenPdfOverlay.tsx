import React from 'react';
import { X } from 'lucide-react';
import { PdfViewer } from './cards/PdfViewer';

export const FullScreenPdfOverlay = ({ src, title, onClose }: { src: string; title?: string; onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[100] bg-black/90 flex flex-col p-6 animate-in fade-in duration-200"
    onClick={onClose}
    onPointerDown={(e) => e.stopPropagation()}
  >
    {/* Header */}
    <div
      className="flex justify-between items-center text-white mb-4 shrink-0 px-2 w-full max-w-4xl mx-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 className="text-lg font-medium truncate pr-4">{title || 'PDF Document'}</h2>
      <button
        className="text-white/70 hover:text-white p-2 bg-black/50 hover:bg-black/80 rounded-full transition-colors shrink-0"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>
    </div>

    {/* PDF viewer */}
    <div
      className="flex-1 overflow-auto w-full max-w-4xl mx-auto bg-white rounded-xl shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <PdfViewer url={src} preview={false} />
    </div>
  </div>
);
