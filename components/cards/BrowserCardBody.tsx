import React, { useState, useEffect } from 'react';
import { ExternalLink, Maximize2, Globe } from 'lucide-react';

interface BrowserCardBodyProps {
  url: string;
  onUrlChange: (url: string) => void;
  onOpenFullscreen: () => void;
}

export const BrowserCardBody: React.FC<BrowserCardBodyProps> = ({ url, onUrlChange, onOpenFullscreen }) => {
  const [inputUrl, setInputUrl] = useState(url || '');

  useEffect(() => { setInputUrl(url || ''); }, [url]);

  const commit = () => {
    let target = inputUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
    setInputUrl(target);
    onUrlChange(target);
  };

  const open = () => {
    const href = inputUrl || url;
    if (!href) return;
    if ((window as any).electronAPI?.openExternal) (window as any).electronAPI.openExternal(href);
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  let domain = '';
  let faviconSrc = '';
  try {
    const parsed = new URL(url || inputUrl);
    domain = parsed.hostname;
    faviconSrc = `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-b-xl bg-gray-50" onPointerDown={stop}>
      {/* URL bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 border-b border-gray-200 shrink-0">
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); }}
          onPointerDown={stop}
          onFocus={(e) => e.target.select()}
          placeholder="https://..."
          className="flex-1 px-2 py-0.5 text-xs bg-white rounded border border-gray-200 outline-none focus:border-blue-400 font-mono min-w-0"
        />
        <button onClick={open} onPointerDown={stop} title="Open in new tab"
          className="p-1 rounded hover:bg-gray-200 transition-colors shrink-0">
          <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <button onClick={onOpenFullscreen} onPointerDown={stop} title="Fullscreen"
          className="p-1 rounded hover:bg-gray-200 transition-colors shrink-0">
          <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Preview body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-5 text-center">
        {domain ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden">
              <img
                src={faviconSrc}
                alt=""
                className="w-8 h-8 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-gray-700 truncate max-w-[200px]">{domain}</p>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{url || inputUrl}</p>
            </div>
            <button
              onClick={open}
              onPointerDown={stop}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </button>
          </>
        ) : (
          <>
            <Globe className="w-10 h-10 text-gray-300" />
            <p className="text-sm text-gray-400">Enter a URL above and press Enter</p>
          </>
        )}
      </div>
    </div>
  );
};
