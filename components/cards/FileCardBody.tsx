import React from 'react';
import { FileText, FileType, Presentation, FileCode, File, Maximize2, Download } from 'lucide-react';
import { FileSubtype } from '../../types';
import { PdfViewer } from './PdfViewer';
import { DocxViewer } from './DocxViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { CodeViewer } from './CodeViewer';
import { extToLanguage } from '../../utils/codeLanguages';

interface FileCardBodyProps {
  url: string;
  fileName?: string;
  fileSubtype?: FileSubtype;
  onOpen: () => void;
}

function FileIcon({ subtype }: { subtype?: FileSubtype }) {
  switch (subtype) {
    case 'pdf':  return <FileText className="w-4 h-4 text-red-500 shrink-0" />;
    case 'docx': return <FileType className="w-4 h-4 text-blue-500 shrink-0" />;
    case 'pptx': return <Presentation className="w-4 h-4 text-orange-500 shrink-0" />;
    case 'md':   return <FileCode className="w-4 h-4 text-purple-500 shrink-0" />;
    case 'code': return <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />;
    case 'txt':  return <FileText className="w-4 h-4 text-gray-400 shrink-0" />;
    default:     return <File className="w-4 h-4 text-gray-400 shrink-0" />;
  }
}

export const FileCardBody: React.FC<FileCardBodyProps> = ({ url, fileName, fileSubtype, onOpen }) => {
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'file';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Preview area — each viewer handles its own loading/error state */}
      <div
        className="flex-1 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ maxHeight: 320 }}
      >
        {fileSubtype === 'pdf' && <PdfViewer url={url} preview />}
        {fileSubtype === 'docx' && <DocxViewer url={url} />}
        {(fileSubtype === 'md' || fileSubtype === 'txt') && (
          <MarkdownViewer url={url} isMarkdown={fileSubtype === 'md'} />
        )}
        {fileSubtype === 'code' && (
          <div className="h-full rounded overflow-hidden" style={{ maxHeight: 320 }}>
            <CodeViewer url={url} language={extToLanguage(fileName ?? '')} preview />
          </div>
        )}
        {(fileSubtype === 'pptx' || fileSubtype === 'other' || !fileSubtype) && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400">
            <FileIcon subtype={fileSubtype} />
            <span className="text-xs">No preview available</span>
            <button
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline mt-1"
              onClick={handleDownload}
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
        )}
      </div>

      {/* Footer: filename + open button */}
      <div className="flex items-center justify-between px-3 py-2 gap-2 border-t border-black/5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon subtype={fileSubtype} />
          <span className="truncate text-xs text-gray-700 font-medium">{fileName || 'File'}</span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="flex items-center gap-1 bg-white hover:bg-gray-50 text-gray-700 font-medium px-2 py-1 rounded shadow-sm border border-gray-200 shrink-0 transition-colors text-xs"
        >
          <Maximize2 className="w-3 h-3" />
          Open
        </button>
      </div>
    </div>
  );
};
