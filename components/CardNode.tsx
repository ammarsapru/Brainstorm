import React, { useRef, useEffect, useState } from 'react';
import { IdeaCard, CardStyle } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Trash2, GripHorizontal, Bold, Italic, Type, Image as ImageIcon, FileText, Maximize2, Download, AlignLeft, AlignCenter, AlignRight, Heading } from 'lucide-react';
import { uploadFileToS3 } from '../lib/supabase';

interface CardNodeProps {
  card: IdeaCard;
  isSelected: boolean;
  scale: number;
  onUpdate: (id: string, updates: Partial<IdeaCard>) => void;
  onDelete: (id: string) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onDoubleClick?: (e: React.MouseEvent, id: string) => void;
  onConnectStart: (e: React.MouseEvent, id: string) => void;
  onGenerateAI: (id: string) => void;
  isProcessingAI: boolean;
  onGripDown?: (e: React.PointerEvent, id: string) => void;
  isConnecting?: boolean;
  onImageClick?: (url: string) => void;
  onOpenCard?: (card: IdeaCard) => void;
  onMoveFocusVertical?: (fromCardId: string, direction: 'up' | 'down') => void;
  onRegisterTextarea?: (cardId: string, el: HTMLTextAreaElement | null) => void;
}

const FONTS = [
  { value: 'sans', label: 'Default (Manrope)' },
  { value: 'inter', label: 'Inter' },
  { value: 'serif', label: 'Merriweather' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'slab', label: 'Roboto Slab' },
  { value: 'mono', label: 'JetBrains Mono' },
  { value: 'cursive', label: 'Patrick Hand' },
  { value: 'hand', label: 'Caveat' },
  { value: 'comic', label: 'Comic Neue' },
];

export const isPdfCard = (image?: string, fileName?: string): boolean =>
  !!image?.startsWith('data:application/pdf') ||
  (!!image && !!fileName?.toLowerCase().endsWith('.pdf'));

export const usePdfBlobUrl = (dataUrl: string | undefined) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (dataUrl && dataUrl.startsWith('data:application/pdf')) {
      try {
        const [header, data] = dataUrl.split(',');
        const mime = header.split(':')[1].split(';')[0];
        const byteString = atob(data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mime });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);

        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Failed to create blob for PDF", e);
        setBlobUrl(dataUrl); // Fallback
      }
    } else {
      setBlobUrl(null);
    }
  }, [dataUrl]);

  return blobUrl;
};

export const CardNode = React.memo<CardNodeProps>(({
  card,
  isSelected,
  scale,
  onUpdate,
  onDelete,
  onPointerDown,
  onDoubleClick,
  onConnectStart,
  onGenerateAI,
  isProcessingAI,
  onGripDown,
  isConnecting,
  onImageClick,
  onOpenCard,
  onMoveFocusVertical,
  onRegisterTextarea
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const isPdf = isPdfCard(card.image, card.fileName);
  const pdfBlobUrl = usePdfBlobUrl(card.image);

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardRef.current) return;

    try {
      setIsExporting(true);
      // Brief delay to allow UI to update (e.g. hiding selection rings if we wanted to)
      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 2, // High resolution
        backgroundColor: card.color || '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? 'l' : 'p',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${card.fileName || 'brainstorm-card'}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-resize height based on content
  useEffect(() => {
    if (textareaRef.current && cardRef.current) {
      // Reset height to auto to correctly measure text area
      textareaRef.current.style.height = 'auto';

      // Calculate content height for the textarea itself
      const scrollHeight = textareaRef.current.scrollHeight;

      // Calculate ideal width based on text length
      const idealWidth = Math.max(200, Math.min(400, card.text.length * 10));
      const targetWidth = Math.max(card.width, idealWidth);

      // Apply height directly to textarea
      textareaRef.current.style.height = scrollHeight + 'px';

      // Measure the TRUE full height of the rendered component
      const fullHeight = cardRef.current.offsetHeight;

      // Sync the true outer dimensions to the parent state so connections calculate correctly.
      if (Math.abs(fullHeight - card.height) > 5 || Math.abs(targetWidth - card.width) > 5) {
        const timer = setTimeout(() => {
          onUpdate(card.id, { height: fullHeight, width: targetWidth });
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [card.text, card.style, card.height, card.width, isSelected, card.image, card.fileName]);

  const updateStyle = (key: keyof CardStyle, value: any) => {
    onUpdate(card.id, { style: { ...card.style, [key]: value } });
  };

  const getFontFamily = (font: string) => {
    switch (font) {
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      case 'cursive': return 'font-cursive';
      case 'inter': return 'font-inter';
      case 'playfair': return 'font-playfair';
      case 'slab': return 'font-slab';
      case 'hand': return 'font-hand';
      case 'bebas': return 'font-bebas';
      case 'comic': return 'font-comic';
      default: return 'font-sans';
    }
  };

  return (
    <div
      ref={cardRef}
      className={`absolute flex flex-col shadow-sm transition-shadow duration-200 group
        ${isSelected ? 'ring-2 ring-emerald-500 shadow-xl z-20' : 'hover:shadow-md hover:ring-2 hover:ring-[#0055ff] z-10'}
      `}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        backgroundColor: card.color,
        borderRadius: '8px',
        transform: `translate(-50%, -50%)`,
        cursor: 'default',
        touchAction: 'none'
      }}
      onPointerDown={(e) => onPointerDown(e, card.id)}
      onDoubleClick={(e) => onDoubleClick?.(e, card.id)}
    >
      {/* Connection Selection Overlay */}
      {isConnecting && (
        <div
          data-html2canvas-ignore="true"

          className="absolute inset-0 z-50 rounded-xl cursor-crosshair bg-transparent"
          onClick={(e) => {
            // We want to trigger the card selection logic, basically acting as if we clicked the card body
            // But we want to bypass text editing.
            // The parent onMouseDown usually handles connection completion if passing event up?
            // Actually, Workspace.tsx handleMouseDownCard handles connection completion.
            // So we just need to ensure onMouseDown fires on the card.
            // But we are in a div separate from textarea.
          }}
        // Let mousedown propagate to parent div which calls onMouseDown
        />
      )}
      {/* Formatting Toolbar - Now attached to the card so it moves instantly */}
      {isSelected && (
        <div
          data-html2canvas-ignore="true"
          className="absolute flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in duration-200"
          style={{
            top: -50,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap'
          }}
          onPointerDown={(e) => e.stopPropagation()} // Prevent deselection
        >
          <button
            onClick={() => updateStyle('isBold', !card.style.isBold)}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.isBold ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateStyle('isItalic', !card.style.isItalic)}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.isItalic ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <button
            onClick={() => updateStyle('textAlign', 'left')}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.textAlign === 'left' ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateStyle('textAlign', 'center')}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.textAlign === 'center' || !card.style.textAlign ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateStyle('textAlign', 'right')}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.textAlign === 'right' ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <button
            onClick={() => updateStyle('isHeader', !card.style.isHeader)}
            className={`p-1.5 rounded hover:bg-gray-100 ${card.style.isHeader ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Header"
          >
            <Heading className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <select
            value={card.style.fontFamily}
            onChange={(e) => updateStyle('fontFamily', e.target.value)}
            className="text-xs border-none bg-transparent outline-none text-gray-700 font-medium cursor-pointer max-w-[80px]"
          >
            {FONTS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Color Picker */}
          <div className="flex gap-1">
            {['#ffffff', '#fef3c7', '#69f0ae', '#dbeafe', '#ff5252'].map(c => (
              <button
                key={c}
                className={`w-4 h-4 rounded-full border border-gray-200 ${card.color === c ? 'ring-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onUpdate(card.id, { color: c })}
              />
            ))}

            {/* Custom Color Input */}
            <label
              className={`w-4 h-4 rounded-full border border-gray-200 cursor-pointer flex items-center justify-center overflow-hidden
                ${!['#ffffff', '#fef3c7', '#69f0ae', '#dbeafe', '#ff5252'].includes(card.color) ? 'ring-2 ring-gray-400' : ''}
              `}
              style={{
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                boxShadow: 'inset 0 0 2px rgba(0,0,0,0.1)'
              }}
              title="Custom Color"
            >
              <input
                type="color"
                value={card.color}
                onChange={(e) => onUpdate(card.id, { color: e.target.value })}
                className="opacity-0 w-full h-full cursor-pointer p-0 border-none"
              />
            </label>
          </div>
        </div>
      )}

      {/* Drag Handle */}
      <div
        data-html2canvas-ignore="true"
        onPointerDown={(e) => {
          // Trigger mode switch if provided
          onGripDown?.(e, card.id);
        }}
        className="h-6 w-full cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/5 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripHorizontal className="w-4 h-4 text-gray-400" />
      </div>

      {/* Media Content */}
      {card.image && (
        <div
          className={`w-full overflow-hidden border-b border-black/5 bg-gray-50 ${isPdf ? 'flex-1 min-h-[300px]' : 'h-32 cursor-pointer hover:opacity-90 transition-opacity'}`}
          onPointerDown={(e) => {
            if (isPdf) {
              e.stopPropagation(); // Allow interacting with the PDF
            }
          }}
          onClick={(e) => {
            if (!isPdf) {
              e.stopPropagation();
              onImageClick?.(card.image!);
            }
          }}
        >
          {isPdf ? (
            <embed src={pdfBlobUrl || card.image} type="application/pdf" className="w-full h-full border-none bg-white" title="PDF Viewer" />
          ) : (
            <img src={card.image} alt="Card attachment" className="w-full h-full object-cover pointer-events-none" />
          )}
        </div>
      )}

      {/* File Indicator */}
      {card.fileName && (
        <div className="flex items-center justify-between px-3 py-2 bg-black/5 mx-3 mt-2 rounded text-xs text-gray-600 overflow-hidden">
          <div className="flex items-center gap-2 shrink overflow-hidden">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">{card.fileName}</span>
          </div>
          {isPdf && (
            <button
              data-html2canvas-ignore="true"
              onPointerDown={(e) => e.stopPropagation()}

              onClick={(e) => {
                e.stopPropagation();
                onOpenCard?.(card);
              }}
              className="flex items-center gap-1 bg-white/80 hover:bg-white text-gray-700 font-medium px-2 py-1 rounded shadow-sm border border-gray-200 shrink-0 transition-colors"
              title="Open PDF Full Screen"
            >
              <Maximize2 className="w-3 h-3" />
              Open
            </button>
          )}
        </div>
      )}

      {/* Text Content */}
      <div className={`p-3 flex flex-col ${isPdf ? 'shrink-0' : 'flex-grow'}`}>
        {isExporting ? (
          <div
            className={`w-full bg-transparent text-gray-800 whitespace-pre-wrap break-words ${getFontFamily(card.style.fontFamily)} ${isPdf ? '' : 'flex-grow'}`}
            style={{
              minHeight: card.image ? '40px' : '60px',
              fontWeight: card.style.isHeader ? '800' : card.style.isBold ? 'bold' : 'normal',
              fontStyle: card.style.isItalic ? 'italic' : 'normal',
              fontSize: card.style.isHeader ? '24px' : `${card.style.fontSize}px`,
              textAlign: card.style.textAlign || 'center'
            }}
          >
            {card.text || ' '}
          </div>
        ) : (
          <textarea
            ref={(el) => {
              textareaRef.current = el;
              onRegisterTextarea?.(card.id, el);
            }}
            value={card.text}
            onChange={(e) => onUpdate(card.id, { text: e.target.value })}
            data-card-id={card.id}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (items) {
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) {
                      const el = textareaRef.current;
                      const start = el?.selectionStart ?? card.text.length;
                      const end = el?.selectionEnd ?? start;
                      uploadFileToS3(blob).then(url => {
                        if (!url) return;
                        const insert = `\n${url}\n`;
                        const nextText = (card.text || '').slice(0, start) + insert + (card.text || '').slice(end);
                        onUpdate(card.id, { text: nextText });
                        requestAnimationFrame(() => {
                          const t = textareaRef.current;
                          if (!t) return;
                          const nextPos = start + insert.length;
                          t.selectionStart = nextPos;
                          t.selectionEnd = nextPos;
                        });
                      });
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                  }
                }
              }
            }}
            onDragOver={(e) => {
              // Needed to allow dropping if Workspace doesn't catch it
              e.stopPropagation();
              // Don't preventDefault if we want default text dragging? No, prevent default to allow drop.
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.stopPropagation();
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                  const el = textareaRef.current;
                  const start = el?.selectionStart ?? card.text.length;
                  const end = el?.selectionEnd ?? start;
                  uploadFileToS3(file).then(url => {
                    if (!url) return;
                    const insert = `\n${url}\n`;
                    const nextText = (card.text || '').slice(0, start) + insert + (card.text || '').slice(end);
                    onUpdate(card.id, { text: nextText });
                    requestAnimationFrame(() => {
                      const t = textareaRef.current;
                      if (!t) return;
                      const nextPos = start + insert.length;
                      t.selectionStart = nextPos;
                      t.selectionEnd = nextPos;
                    });
                  });
                  e.preventDefault();
                }
              } else {
                // Allow text drops to act normally
              }
            }}
            placeholder={card.image ? "Add caption..." : "Enter idea..."}
            className={`w-full bg-transparent resize-none outline-none text-gray-800 placeholder-gray-400 overflow-hidden ${getFontFamily(card.style.fontFamily)} ${isPdf ? '' : 'flex-grow'}`}
            style={{
              minHeight: card.image ? '40px' : '60px',
              fontWeight: card.style.isHeader ? '800' : card.style.isBold ? 'bold' : 'normal',
              fontStyle: card.style.isItalic ? 'italic' : 'normal',
              fontSize: card.style.isHeader ? '24px' : `${card.style.fontSize}px`,
              textAlign: card.style.textAlign || 'center'
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Action Bar */}
      <div data-html2canvas-ignore="true" className={`absolute -bottom-5 left-1/2 -translate-x-1/2 translate-y-full flex gap-2 transition-opacity duration-200 ${isSelected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onPointerDown={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenCard?.(card); }}
          className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100"
          title="Open"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button

          onClick={(e) => { e.stopPropagation(); onConnectStart(e, card.id); }}
          className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100"
          title="Connect"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onGenerateAI(card.id); }}
          className={`p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100 ${isProcessingAI ? 'animate-pulse' : ''}`}
          title="AI Brainstorm"
          disabled={isProcessingAI}
        >
          <span className="font-bold text-[11px] leading-none select-none">B</span>
        </button>

        <button
          onClick={handleExportPDF}
          className={`p-2 bg-white rounded-full shadow-md hover:bg-green-50 text-green-600 border border-green-100 ${isExporting ? 'animate-pulse' : ''}`}
          title="Export as PDF"
          disabled={isExporting}
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
          className="p-2 bg-white rounded-full shadow-md hover:bg-red-50 text-red-500 border border-red-100"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for performance
  return (
    prevProps.card.id === nextProps.card.id &&
    prevProps.card.x === nextProps.card.x &&
    prevProps.card.y === nextProps.card.y &&
    prevProps.card.text === nextProps.card.text &&
    prevProps.card.image === nextProps.card.image &&
    prevProps.card.fileName === nextProps.card.fileName &&
    prevProps.card.width === nextProps.card.width &&
    prevProps.card.height === nextProps.card.height &&
    prevProps.card.color === nextProps.card.color &&
    JSON.stringify(prevProps.card.content) === JSON.stringify(nextProps.card.content) &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isProcessingAI === nextProps.isProcessingAI &&
    prevProps.isConnecting === nextProps.isConnecting &&
    prevProps.scale === nextProps.scale && // Scale is important for potential internal sizing but usually pure CSS transform handles it
    JSON.stringify(prevProps.card.style) === JSON.stringify(nextProps.card.style)
  );
});