import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';

export const DocxViewer: React.FC<{ url: string }> = ({ url }) => {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(buf => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then(({ value }) => {
        if (!cancelled) {
          setHtml(DOMPurify.sanitize(value));
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load document');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) return (
    <div className="flex items-center justify-center p-6">
      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="p-4 text-red-500 text-xs text-center">{error}</div>
  );
  return (
    <div
      className="prose prose-sm max-w-none p-3 overflow-auto text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
