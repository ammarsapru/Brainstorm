import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownViewerProps {
  url: string;
  isMarkdown?: boolean;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ url, isMarkdown = true }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(text => {
        if (!cancelled) {
          if (isMarkdown) {
            const raw = marked.parse(text);
            setContent(DOMPurify.sanitize(typeof raw === 'string' ? raw : ''));
          } else {
            setContent(text);
          }
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message ?? 'Failed to load file');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [url, isMarkdown]);

  if (loading) return (
    <div className="flex items-center justify-center p-4">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
    </div>
  );
  if (error) return <div className="p-3 text-red-500 text-xs">{error}</div>;

  if (isMarkdown) return (
    <div
      className="prose prose-xs max-w-none p-3 text-xs"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
  return (
    <pre className="p-3 text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
      {content}
    </pre>
  );
};
