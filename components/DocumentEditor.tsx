import React, { useState, useEffect, useRef } from 'react';
import { FileSystemItem } from '../types';
import { X, Save, Bold, Italic, Underline, GripVertical, Plus, Trash2, Type, List } from 'lucide-react';

interface DocumentEditorProps {
  doc: FileSystemItem;
  onSave: (id: string, content: string, name: string) => void;
  onClose: () => void;
}

interface BlockStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;
  fontFamily: string;
  listType?: 'none' | 'bullet' | 'number';
}

interface DocBlock {
  id: string;
  text: string;
  style: BlockStyle;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_BLOCK_STYLE: BlockStyle = {
  bold: false,
  italic: false,
  underline: false,
  fontSize: 16,
  fontFamily: 'serif',
  listType: 'none'
};

const FONTS = [
  { value: 'sans', label: 'Default' },
  { value: 'inter', label: 'Inter' },
  { value: 'serif', label: 'Merriweather' },
  { value: 'playfair', label: 'Playfair Display' },
  { value: 'slab', label: 'Roboto Slab' },
  { value: 'mono', label: 'JetBrains Mono' },
  { value: 'cursive', label: 'Patrick Hand' },
  { value: 'hand', label: 'Caveat' },
  { value: 'comic', label: 'Comic Neue' },
];

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ doc, onSave, onClose }) => {
  // Initialize blocks from JSON content or fallback to plain text splitting
  const [blocks, setBlocks] = useState<DocBlock[]>(() => {
    if (!doc.content) return [{ id: generateId(), text: '', style: { ...DEFAULT_BLOCK_STYLE } }];
    try {
      const parsed = JSON.parse(doc.content);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
        // Ensure new properties exist on old blocks if loaded
        return parsed.map((b: any) => ({
          ...b,
          style: { ...DEFAULT_BLOCK_STYLE, ...b.style }
        }));
      }
      throw new Error("Not JSON blocks");
    } catch {
      // Fallback: Split by newline for legacy plain text files
      return doc.content.split('\n').map(line => ({
        id: generateId(),
        text: line,
        style: { ...DEFAULT_BLOCK_STYLE }
      }));
    }
  });

  const [title, setTitle] = useState(doc.name);
  const [isSaved, setIsSaved] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);

  // Auto-save effect
  useEffect(() => {
    const timer = setTimeout(() => {
      const contentString = JSON.stringify(blocks);
      if (contentString !== doc.content || title !== doc.name) {
        onSave(doc.id, contentString, title);
        setIsSaved(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [blocks, title, doc.id, onSave, doc.content, doc.name]);

  const handleBlockChange = (id: string, text: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text } : b));
    setIsSaved(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, id: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // inherit list style if bulleted
      const currentBlock = blocks[index];
      const newBlock: DocBlock = {
        id: generateId(),
        text: '',
        style: { ...currentBlock.style }
      };

      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      setBlocks(newBlocks);
      setIsSaved(false);
      setTimeout(() => document.getElementById(`block-${newBlock.id}`)?.focus(), 0);
    }

    if (e.key === 'Backspace' && blocks[index].text === '' && blocks.length > 1) {
      e.preventDefault();
      const newBlocks = blocks.filter(b => b.id !== id);
      setBlocks(newBlocks);
      setIsSaved(false);
      setTimeout(() => {
        const prevId = blocks[index - 1]?.id || blocks[index + 1]?.id;
        if (prevId) document.getElementById(`block-${prevId}`)?.focus();
      }, 0);
    }
  };

  // --- Formatting ---
  const updateActiveBlockStyle = (key: keyof BlockStyle, value: any) => {
    if (!activeBlockId) return;
    setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, style: { ...b.style, [key]: value } } : b));
    setIsSaved(false);
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);
  const currentStyle = activeBlock?.style || DEFAULT_BLOCK_STYLE;

  const toggleList = () => {
    if (!activeBlockId) return;
    const newValue = currentStyle.listType === 'bullet' ? 'none' : 'bullet';
    updateActiveBlockStyle('listType', newValue);
  };

  // --- Drag and Drop Reordering ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBlockIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedBlockIndex === null || draggedBlockIndex === index) return;

    const newBlocks = [...blocks];
    const draggedItem = newBlocks[draggedBlockIndex];
    newBlocks.splice(draggedBlockIndex, 1);
    newBlocks.splice(index, 0, draggedItem);

    setBlocks(newBlocks);
    setDraggedBlockIndex(index);
    setIsSaved(false);
  };

  const handleDragEnd = () => {
    setDraggedBlockIndex(null);
  };

  // --- Helpers for Render ---
  const getFontFamilyClass = (font: string) => {
    switch (font) {
      case 'sans': return 'font-sans';
      case 'mono': return 'font-mono';
      case 'cursive': return 'font-cursive';
      case 'inter': return 'font-inter';
      case 'playfair': return 'font-playfair';
      case 'slab': return 'font-slab';
      case 'hand': return 'font-hand';
      case 'bebas': return 'font-bebas';
      case 'comic': return 'font-comic';
      default: return 'font-serif';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-[900px] h-[95%] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header / Toolbar */}
        <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white shrink-0 z-10">

          {/* Formatting Controls */}
          <div className="flex items-center gap-2">
            <select
              value={currentStyle.fontFamily}
              onChange={(e) => updateActiveBlockStyle('fontFamily', e.target.value)}
              className="h-8 px-2 border border-gray-200 rounded text-sm text-gray-700 outline-none focus:border-black bg-white"
              title="Font Family"
            >
              {FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            <select
              value={currentStyle.fontSize}
              onChange={(e) => updateActiveBlockStyle('fontSize', parseInt(e.target.value))}
              className="h-8 w-16 px-2 border border-gray-200 rounded text-sm text-gray-700 outline-none focus:border-black bg-white"
              title="Font Size"
            >
              {[12, 14, 16, 18, 20, 24, 30, 36, 48].map(size => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>

            <div className="w-px h-6 bg-gray-200 mx-1" />

            <button
              onClick={() => updateActiveBlockStyle('bold', !currentStyle.bold)}
              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.bold ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => updateActiveBlockStyle('italic', !currentStyle.italic)}
              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.italic ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => updateActiveBlockStyle('underline', !currentStyle.underline)}
              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.underline ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
              title="Underline"
            >
              <Underline className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-gray-200 mx-1" />

            <button
              onClick={toggleList}
              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.listType === 'bullet' ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
              title="Bullet List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {isSaved ? (
              <span className="text-xs text-green-500 flex items-center gap-1 font-medium"><Save className="w-3 h-3" /> Saved</span>
            ) : (
              <span className="text-xs text-amber-500 font-medium">Saving...</span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 overflow-y-auto px-8 py-8 bg-gray-50/30">
          <div className="max-w-3xl mx-auto bg-white min-h-[800px] shadow-sm border border-gray-100 p-12 rounded-lg">

            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setIsSaved(false); }}
              placeholder="Untitled Document"
              className="w-full text-4xl font-bold text-gray-900 placeholder-gray-300 outline-none border-none bg-transparent mb-8 font-serif"
            />

            {/* Blocks List */}
            <div className="flex flex-col gap-1">
              {blocks.map((block, index) => (
                <div
                  key={block.id}
                  className="group relative flex items-start -ml-8 pr-4"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                >
                  {/* Drag Handle (Visible on Hover) */}
                  <div className="w-8 h-full flex items-start pt-1 justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity select-none text-gray-300 hover:text-gray-500">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* List Marker */}
                  {block.style.listType === 'bullet' && (
                    <div className="w-6 flex justify-center items-start pt-2 select-none text-gray-800">
                      •
                    </div>
                  )}

                  {/* Text Input */}
                  <textarea
                    id={`block-${block.id}`}
                    value={block.text}
                    onChange={(e) => {
                      handleBlockChange(block.id, e.target.value);
                      // Auto-resize
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onFocus={() => setActiveBlockId(block.id)}
                    onKeyDown={(e) => handleKeyDown(e, index, block.id)}
                    placeholder={block.style.listType === 'bullet' ? "List item..." : "Type '/' for commands"}
                    rows={1}
                    className={`flex-1 bg-transparent resize-none outline-none border-none text-gray-800 placeholder-gray-300 overflow-hidden leading-relaxed ${getFontFamilyClass(block.style.fontFamily)}`}
                    style={{
                      fontSize: `${block.style.fontSize}px`,
                      fontWeight: block.style.bold ? 'bold' : 'normal',
                      fontStyle: block.style.italic ? 'italic' : 'normal',
                      textDecoration: block.style.underline ? 'underline' : 'none',
                      // Fix for auto-height initial render
                      height: 'auto',
                    }}
                    // Trick to make auto-height work on mount
                    ref={el => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }
                    }}
                  />

                  {/* Delete Button (optional, for explicit deletion) */}
                  {blocks.length > 1 && (
                    <button
                      onClick={() => {
                        const newBlocks = blocks.filter(b => b.id !== block.id);
                        setBlocks(newBlocks);
                        setIsSaved(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-opacity absolute right-0 top-0"
                      title="Delete block"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* Add Block at End Area */}
              <div
                className="h-24 cursor-text"
                onClick={() => {
                  // Add a new block at the end if the last one isn't empty, otherwise focus last
                  const lastBlock = blocks[blocks.length - 1];
                  if (lastBlock.text.trim() !== "") {
                    const newBlock = { id: generateId(), text: '', style: { ...DEFAULT_BLOCK_STYLE } };
                    setBlocks([...blocks, newBlock]);
                    setTimeout(() => document.getElementById(`block-${newBlock.id}`)?.focus(), 0);
                  } else {
                    document.getElementById(`block-${lastBlock.id}`)?.focus();
                  }
                }}
              />
            </div>

          </div>

          <div className="max-w-3xl mx-auto mt-4 text-right text-xs text-gray-400 px-12">
            {blocks.length} blocks · {blocks.reduce((acc, b) => acc + b.text.length, 0)} characters
          </div>
        </div>
      </div>
    </div>
  );
};