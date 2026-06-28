import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Vite resolves this new URL() at build time — worker stays same-origin, no CSP issues
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
  /** preview = first page only, no nav, fits card width. false = full paginated viewer. */
  preview?: boolean;
  width?: number;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ url, preview = false, width }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);

  const renderPage = useCallback(async (pageNum: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !pdfDocRef.current) return;
    try {
      renderTaskRef.current?.cancel();
      const page = await pdfDocRef.current.getPage(pageNum);
      const containerWidth = width ?? canvas.parentElement?.clientWidth ?? 380;
      const unscaled = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaled.width;
      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      setLoading(false);
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        setError('Failed to render page');
        setLoading(false);
      }
    }
  }, [width]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageNumber(1);

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        await renderPage(1);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load PDF');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (pdfDocRef.current) renderPage(pageNumber);
  }, [pageNumber, renderPage]);

  return (
    <div className="flex flex-col items-center w-full bg-white">
      {loading && (
        <div className="flex items-center justify-center w-full h-40">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center w-full h-40 text-red-500 text-xs px-4 text-center">
          {error}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ display: loading || error ? 'none' : 'block' }}
      />
      {!preview && !loading && !error && numPages > 1 && (
        <div className="flex items-center gap-3 py-2 text-xs text-gray-600 border-t border-gray-100 w-full justify-center select-none">
          <button
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 transition-colors"
            disabled={pageNumber <= 1}
            onClick={(e) => { e.stopPropagation(); setPageNumber(p => p - 1); }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>{pageNumber} / {numPages}</span>
          <button
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 transition-colors"
            disabled={pageNumber >= numPages}
            onClick={(e) => { e.stopPropagation(); setPageNumber(p => p + 1); }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
