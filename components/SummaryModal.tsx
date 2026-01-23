import React from 'react';
import { X, Printer, Download } from 'lucide-react';

interface SummaryModalProps {
  content: string;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({ content, onClose }) => {
  
  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = "brainstorm-summary.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="w-[800px] h-[90%] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800">Project Summary</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleDownload} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600" title="Download Markdown">
                <Download className="w-5 h-5" />
            </button>
            <button onClick={handlePrint} className="p-2 hover:bg-gray-200 rounded-lg text-gray-600" title="Print to PDF">
                <Printer className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-500">
                <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div id="summary-content" className="flex-1 overflow-y-auto p-8 bg-white text-gray-800 leading-relaxed">
            <div className="prose prose-blue max-w-none">
                <pre className="whitespace-pre-wrap font-sans text-sm">{content}</pre>
            </div>
        </div>
      </div>
    </div>
  );
};
