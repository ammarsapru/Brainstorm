import React, { useState } from 'react';
import { X, ExternalLink, Globe } from 'lucide-react';

interface FullScreenBrowserOverlayProps {
  src: string;
  title?: string;
  onClose: () => void;
}

export const FullScreenBrowserOverlay: React.FC<FullScreenBrowserOverlayProps> = ({ src, title, onClose }) => {
  const [inputUrl] = useState(src);

  const open = () => {
    if (!inputUrl) return;
    if ((window as any).electronAPI?.openExternal) (window as any).electronAPI.openExternal(inputUrl);
    else window.open(inputUrl, '_blank', 'noopener,noreferrer');
  };

  let domain = '';
  let faviconSrc = '';
  try {
    const parsed = new URL(src);
    domain = parsed.hostname;
    faviconSrc = `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
  } catch {}

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-gray-900"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 shrink-0">
        <span className="flex-1 px-3 py-1 text-sm text-gray-400 font-mono truncate">{src}</span>
        <button onClick={open}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          title="Open in browser">
          <ExternalLink className="w-4 h-4" />
        </button>
        <button onClick={onClose}
          className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {domain ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center overflow-hidden">
              <img
                src={faviconSrc}
                alt=""
                className="w-10 h-10 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="text-center">
              <p className="text-white text-lg font-semibold">{title || domain}</p>
              <p className="text-gray-500 text-sm font-mono mt-1 truncate max-w-[400px]">{src}</p>
            </div>
            <button
              onClick={open}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Browser
            </button>
          </>
        ) : (
          <Globe className="w-16 h-16 text-gray-600" />
        )}
      </div>
    </div>
  );
};
