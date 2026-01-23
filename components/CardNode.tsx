import React, { useRef, useEffect } from 'react';
import { IdeaCard, CardStyle } from '../types';
import { Trash2, GripHorizontal, Sparkles, Bold, Italic, Type, Image as ImageIcon, FileText } from 'lucide-react';

interface CardNodeProps {
  card: IdeaCard;
  isSelected: boolean;
  scale: number;
  onUpdate: (id: string, updates: Partial<IdeaCard>) => void;
  onDelete: (id: string) => void;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onDoubleClick?: (e: React.MouseEvent, id: string) => void;
  onConnectStart: (e: React.MouseEvent, id: string) => void;
  onGenerateAI: (id: string) => void;
  isProcessingAI: boolean;
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

export const CardNode: React.FC<CardNodeProps> = ({
  card,
  isSelected,
  scale,
  onUpdate,
  onDelete,
  onMouseDown,
  onDoubleClick,
  onConnectStart,
  onGenerateAI,
  isProcessingAI
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize height based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [card.text, card.style]);

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
      className={`absolute flex flex-col shadow-sm transition-shadow duration-200 group
        ${isSelected ? 'ring-2 ring-white shadow-xl z-20' : 'hover:shadow-md z-10'}
      `}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        minHeight: card.height,
        backgroundColor: card.color,
        borderRadius: '12px',
        transform: `translate(-50%, -50%)`,
        cursor: 'default'
      }}
      onMouseDown={(e) => onMouseDown(e, card.id)}
      onDoubleClick={(e) => onDoubleClick?.(e, card.id)}
    >
      {/* Formatting Toolbar - Now attached to the card so it moves instantly */}
      {isSelected && (
        <div 
          className="absolute flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in duration-200"
          style={{ 
            top: -50,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap'
          }}
          onMouseDown={(e) => e.stopPropagation()} // Prevent deselection
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
            {['#ffffff', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3'].map(c => (
                <button
                key={c}
                className={`w-4 h-4 rounded-full border border-gray-200 ${card.color === c ? 'ring-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onUpdate(card.id, { color: c })}
                />
            ))}
           </div>
        </div>
      )}

      {/* Drag Handle */}
      <div className="h-6 w-full cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/5 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity">
        <GripHorizontal className="w-4 h-4 text-gray-400" />
      </div>

      {/* Image Content */}
      {card.image && (
        <div className="w-full h-32 overflow-hidden border-b border-black/5 bg-gray-50">
          <img src={card.image} alt="Card attachment" className="w-full h-full object-cover pointer-events-none" />
        </div>
      )}

      {/* File Indicator */}
      {card.fileName && (
          <div className="flex items-center gap-2 px-3 py-2 bg-black/5 mx-3 mt-2 rounded text-xs text-gray-600 overflow-hidden">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">{card.fileName}</span>
          </div>
      )}

      {/* Text Content */}
      <div className="p-3 flex-grow flex flex-col">
        <textarea
          ref={textareaRef}
          value={card.text}
          onChange={(e) => onUpdate(card.id, { text: e.target.value })}
          placeholder={card.image ? "Add caption..." : "Enter idea..."}
          className={`w-full bg-transparent resize-none outline-none text-gray-800 placeholder-gray-400 text-center flex-grow overflow-hidden ${getFontFamily(card.style.fontFamily)}`}
          style={{ 
            minHeight: card.image ? '40px' : '60px',
            fontWeight: card.style.isBold ? 'bold' : 'normal',
            fontStyle: card.style.isItalic ? 'italic' : 'normal',
            fontSize: `${card.style.fontSize}px`
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* Action Bar */}
      <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 translate-y-full flex gap-2 transition-opacity duration-200 ${isSelected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
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
          className={`p-2 bg-white rounded-full shadow-md hover:bg-purple-50 text-purple-600 border border-purple-100 ${isProcessingAI ? 'animate-pulse' : ''}`}
          title="AI Brainstorm"
          disabled={isProcessingAI}
        >
          <Sparkles className="w-4 h-4" />
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
};