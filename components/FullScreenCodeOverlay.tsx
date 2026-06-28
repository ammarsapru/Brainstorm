import React, { useState } from 'react';
import { X, Copy, Check, Download } from 'lucide-react';
import { CodeViewer } from './cards/CodeViewer';
import { extToLanguage } from '../utils/codeLanguages';

interface FullScreenCodeOverlayProps {
  src: string;
  fileName?: string;
  onClose: () => void;
}

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: 'JavaScript', jsx: 'JSX', typescript: 'TypeScript', tsx: 'TSX',
  python: 'Python', java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#',
  go: 'Go', rust: 'Rust', ruby: 'Ruby', php: 'PHP', swift: 'Swift',
  kotlin: 'Kotlin', dart: 'Dart', bash: 'Shell', css: 'CSS', scss: 'SCSS',
  json: 'JSON', yaml: 'YAML', html: 'HTML', xml: 'XML', sql: 'SQL',
  graphql: 'GraphQL', r: 'R', lua: 'Lua', toml: 'TOML', text: 'Plain text',
};

export const FullScreenCodeOverlay: React.FC<FullScreenCodeOverlayProps> = ({ src, fileName, onClose }) => {
  const [copied, setCopied] = useState(false);
  const language = extToLanguage(fileName ?? '');
  const langLabel = LANGUAGE_LABEL[language] ?? language;

  const handleCopy = async () => {
    try {
      const text = await fetch(src).then(r => r.text());
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = fileName || 'file';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#1e1e1e]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#252526] border-b border-[#3c3c3c] shrink-0">
        {/* Language badge */}
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#0e639c] text-white shrink-0">
          {langLabel}
        </span>

        {/* Filename */}
        <span className="flex-1 text-sm text-[#cccccc] font-mono truncate">
          {fileName || 'Untitled'}
        </span>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-[#cccccc] hover:text-white px-2.5 py-1 rounded hover:bg-[#3c3c3c] transition-colors shrink-0"
          title="Copy all"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 text-xs text-[#cccccc] hover:text-white px-2.5 py-1 rounded hover:bg-[#3c3c3c] transition-colors shrink-0"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>

        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-[#3c3c3c] text-[#cccccc] hover:text-white transition-colors shrink-0"
          title="Close (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Code body — full height, scrollable */}
      <div className="flex-1 overflow-hidden">
        <CodeViewer url={src} language={language} />
      </div>
    </div>
  );
};
