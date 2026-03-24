import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { FileSystemItem } from '../types';
import { X, Save, Bold, Italic, Underline, GripVertical, Plus, Trash2, Type, List, ListOrdered } from 'lucide-react';

interface DocumentEditorProps {
  doc: FileSystemItem;
  onSave: (id: string, content: string, name: string) => void;
  onChange?: (id: string, content: string, name: string) => void;
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

const ContentBlock = React.memo(({
  html,
  tagName,
  className,
  style,
  onChange,
  onKeyDown,
  onFocus,
  id
}: {
  html: string,
  tagName?: string,
  className?: string,
  style?: React.CSSProperties,
  onChange: (id: string, html: string) => void,
  onKeyDown: (e: React.KeyboardEvent, id: string) => void,
  onFocus: (id: string) => void,
  id: string
}) => {
  const contentEditable = useRef<HTMLDivElement>(null);

  // MANUALLY manage innerHTML to prevent cursor jumps
  useLayoutEffect(() => {
    if (contentEditable.current && contentEditable.current.innerHTML !== html) {
      // Only update if content is different.
      // This allows the user to type without React overwriting the DOM and resetting cursor.
      contentEditable.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      id={`block-${id}`}
      ref={contentEditable}
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(id, e.currentTarget.innerHTML)}
      onKeyDown={(e) => onKeyDown(e, id)}
      onFocus={() => onFocus(id)}
    // Removed dangerouslySetInnerHTML to give us full control via useLayoutEffect
    />
  );
}, (prev, next) => {
  // We still want to perform basic prop comparison
  if (prev.className !== next.className || JSON.stringify(prev.style) !== JSON.stringify(next.style)) {
    return false;
  }
  if (prev.onChange !== next.onChange || prev.onKeyDown !== next.onKeyDown || prev.onFocus !== next.onFocus) {
    return false;
  }
  if (prev.html !== next.html) {
    return false;
  }
  return true;
});

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ doc, onSave, onChange, onClose, className = "w-[900px]", onSwap }) => {
  const [blocks, setBlocks] = useState<DocBlock[]>(() => {
    if (!doc.content) return [{ id: generateId(), text: '', style: { ...DEFAULT_BLOCK_STYLE } }];
    try {
      const parsed = JSON.parse(doc.content);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
        return parsed.map((b: any) => ({
          ...b,
          style: { ...DEFAULT_BLOCK_STYLE, ...b.style }
        }));
      }
      throw new Error("Not JSON blocks");
    } catch {
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
  const [dropTarget, setDropTarget] = useState<{ index: number, position: 'top' | 'bottom' } | null>(null);

  const focusRef = useRef<{ id: string, cursor: 'start' | 'end' | number } | null>(null);

  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  // Sync external title changes
  useEffect(() => {
    if (doc.name !== title) {
      setTitle(doc.name);
    }
  }, [doc.name]);

  useEffect(() => {
    if (focusRef.current) {
      const el = document.getElementById(`block-${focusRef.current.id}`);
      if (el) {
        el.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel) {
          if (focusRef.current.cursor === 'start') {
            range.setStart(el, 0);
            range.collapse(true);
          } else if (focusRef.current.cursor === 'end') {
            range.selectNodeContents(el);
            range.collapse(false);
          }
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      focusRef.current = null;
    }
  }, [blocks]); // Dependency on blocks ensures we wait for render?

  useEffect(() => {
    const timer = setTimeout(() => {
      const contentString = JSON.stringify(blocks);
      if (contentString !== doc.content || title !== doc.name) {
        onSave(doc.id, contentString, title);
        setIsSaved(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [blocks, title, doc.id, onSave, doc.content, doc.name]);

  const handleBlockChange = useCallback((id: string, html: string) => {
    const currentBlocks = blocksRef.current;

    // Check for slash commands
    const textContent = new DOMParser().parseFromString(html, 'text/html').body.textContent || "";
    const block = currentBlocks.find(b => b.id === id);
    if (!block) return;

    if (textContent.startsWith('/n ') && !block.style.listType) {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        text: html.replace('/n ', ''),
        style: { ...b.style, listType: 'number' }
      } : b));
      setIsSaved(false);
      return;
    }
    if (textContent.startsWith('/b ') && !block.style.listType) {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        text: html.replace('/b ', ''),
        style: { ...b.style, listType: 'bullet' }
      } : b));
      setIsSaved(false);
      return;
    }

    setBlocks(prev => prev.map(b => b.id === id ? { ...b, text: html } : b));
    setIsSaved(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, id: string) => {
    const currentBlocks = blocksRef.current;
    const index = currentBlocks.findIndex(b => b.id === id);
    if (index === -1) return;

    // Shift+Enter: Allow default behavior (L-Line)
    if (e.key === 'Enter' && e.shiftKey) {
      return; // Default contentEditable behavior creates a <br> or a new line within the block
    }

    // Enter (No Shift): New Block (T-Line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);

      // Use a span element as a marker instead of a text node to prevent merging
      const splitMarker = document.createElement('span');
      splitMarker.className = "temp-split-marker";
      // Ensure the marker is empty so it doesn't affect surrounding text layout significantly
      // We don't need text content for the split logic.

      range.deleteContents();
      range.insertNode(splitMarker);

      const el = document.getElementById(`block-${id}`);
      if (!el) return;

      // DO NOT NORMALIZE - this merges text nodes and invalidates our marker reference!
      // el.normalize();

      const rangeBefore = document.createRange();
      rangeBefore.setStart(el, 0);
      rangeBefore.setEndBefore(splitMarker);

      const rangeAfter = document.createRange();
      rangeAfter.setStartAfter(splitMarker);
      rangeAfter.setEnd(el, el.childNodes.length);

      const fragBefore = rangeBefore.cloneContents();
      const fragAfter = rangeAfter.cloneContents();

      const div = document.createElement('div');
      div.appendChild(fragBefore);
      const left = div.innerHTML;
      div.innerHTML = '';
      div.appendChild(fragAfter);
      const right = div.innerHTML;

      // Cleanup marker immediately
      if (splitMarker.parentNode) splitMarker.parentNode.removeChild(splitMarker);

      const newBlock: DocBlock = {
        id: generateId(),
        text: right,
        style: { ...currentBlocks[index].style }
      };

      const newBlocks = [...currentBlocks];
      newBlocks[index] = { ...currentBlocks[index], text: left };
      newBlocks.splice(index + 1, 0, newBlock);

      setBlocks(newBlocks);
      setIsSaved(false);
      focusRef.current = { id: newBlock.id, cursor: 'start' };
    }

    // Backspace: Merge if empty
    if (e.key === 'Backspace') {
      const el = document.getElementById(`block-${id}`);
      // Check if block is effectively empty (handling <br> remnants)
      const isEmpty = !el || el.textContent === '' || el.innerHTML === '<br>' || el.innerText.trim() === '';

      if (isEmpty && currentBlocks.length > 1) {
        e.preventDefault();
        const newBlocks = currentBlocks.filter(b => b.id !== id);
        setBlocks(newBlocks);
        setIsSaved(false);
        const prevId = currentBlocks[index - 1]?.id;
        if (prevId) focusRef.current = { id: prevId, cursor: 'end' };
      }
    }
  }, []);

  const updateActiveBlockStyle = (key: keyof BlockStyle, value: any) => {
    if (!activeBlockId) return;
    setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, style: { ...b.style, [key]: value } } : b));
    setIsSaved(false);
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);
  const currentStyle = activeBlock?.style || DEFAULT_BLOCK_STYLE;

  const toggleList = (type: 'bullet' | 'number') => {
    if (!activeBlockId) return;
    const newValue = currentStyle.listType === type ? 'none' : type;
    updateActiveBlockStyle('listType', newValue);
  };

  const execFormat = (command: string) => {
    document.execCommand(command, false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    // Check if we are dragging from the content editable text area
    // If so, we prevent the drag so that text selection works normally
    let target = e.target as HTMLElement;
    // e.target can be a text node in older browsers or specific contexts
    if (target.nodeType === Node.TEXT_NODE) {
      target = target.parentElement as HTMLElement;
    }

    if (target.closest && target.closest('[contenteditable="true"]')) {
      e.preventDefault();
      return;
    }

    e.stopPropagation();
    setDraggedBlockIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Clear any existing drop target just in case
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedBlockIndex === null || draggedBlockIndex === index) {
      setDropTarget(null);
      return;
    }

    // Calculate generic position based on height
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position = e.clientY < mid ? 'top' : 'bottom';

    setDropTarget({ index, position });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    // Only clear if we're actually leaving the container, but here simpler logic works
    // because dragOver fires continuously.
    // However, we might flicker if we clear on leave of one block before entering the next.
    // So we generally rely on DragOver to set it, and DragEnd to clear it.
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedBlockIndex === null || dropTarget === null) return;

    const newBlocks = [...blocks];
    const draggedItem = newBlocks[draggedBlockIndex];
    newBlocks.splice(draggedBlockIndex, 1);

    // Adjust index because removal shifts indices
    let targetIndex = dropTarget.index;
    if (draggedBlockIndex < dropTarget.index) {
      targetIndex -= 1;
    }

    if (dropTarget.position === 'bottom') {
      targetIndex += 1;
    }

    newBlocks.splice(targetIndex, 0, draggedItem);

    setBlocks(newBlocks);
    setDraggedBlockIndex(null);
    setDropTarget(null);
    setIsSaved(false);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedBlockIndex(null);
    setDropTarget(null);
  };

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

  const memoizedSetActiveBlockId = useCallback((id: string) => {
    setActiveBlockId(id);
  }, []);

  return (
    <div
      className={`${className} h-[95%] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 shrink-0`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-gray-100 flex flex-col bg-white shrink-0 z-10 shadow-sm">
        {/* Top Row: Title & Actions */}
        <div className="flex items-start justify-between px-6 pt-4 pb-3 gap-6">
          <textarea
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsSaved(false);
              e.target.style.height = '0px';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            placeholder="Untitled Document"
            className="w-full text-2xl font-bold text-gray-900 placeholder-gray-300 outline-none border-none bg-transparent resize-none overflow-hidden leading-snug"
            rows={1}
            style={{ minHeight: '36px' }}
            ref={(el) => {
              if (el && !el.dataset.resized) {
                el.dataset.resized = 'true';
                el.style.height = '0px';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
          />

          <div className="flex items-center gap-4 shrink-0 mt-1">
            {isSaved ? (
              <span className="text-xs text-green-500 flex items-center gap-1 font-medium"><Save className="w-3 h-3" /> Saved</span>
            ) : (
              <span className="text-xs text-amber-500 font-medium">Saving...</span>
            )}
            {onSwap && (
              <button
                onClick={onSwap}
                className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 rounded-lg text-gray-600 transition-colors border border-gray-200 hover:border-gray-300"
                title="Swap Card"
              >
                Swap
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Bottom Row: Formatting Tools */}
        <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto no-scrollbar">
          <select
            value={currentStyle.fontFamily}
            onChange={(e) => updateActiveBlockStyle('fontFamily', e.target.value)}
            className="h-8 px-2 border border-gray-200 rounded text-sm text-gray-700 outline-none focus:border-black bg-white"
          >
            {FONTS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={currentStyle.fontSize}
            onChange={(e) => updateActiveBlockStyle('fontSize', parseInt(e.target.value))}
            className="h-8 w-16 px-2 border border-gray-200 rounded text-sm text-gray-700 outline-none focus:border-black bg-white"
          >
            {[12, 14, 16, 18, 20, 24, 30, 36, 48].map(size => (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('underline'); }}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600`}
            title="Underline"
          >
            <Underline className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            onClick={() => toggleList('bullet')}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.listType === 'bullet' ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleList('number')}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.listType === 'number' ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8 bg-gray-50/30">
        <div className="max-w-3xl mx-auto bg-white min-h-[800px] shadow-sm border border-gray-100 p-12 rounded-lg">
          <div className="flex flex-col gap-1">
            {(() => {
              let listCounter = 0;
              return blocks.map((block, index) => {
                if (block.style.listType !== 'number') {
                  listCounter = 0;
                } else {
                  listCounter++;
                }

                // Determine distinct style for drop target
                const isDropTarget = dropTarget?.index === index;
                const dropStyle = isDropTarget ? (dropTarget.position === 'top' ? 'border-t-2 border-blue-500' : 'border-b-2 border-blue-500') : '';

                return (
                  <div
                    key={block.id}
                    className={`group relative flex items-start -ml-8 pr-4 transition-all ${dropStyle}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      // Ensure we don't trigger drag on text selection unless clicking the grip
                    }}
                  >
                    <div
                      className="w-8 h-full flex items-start pt-1 justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity select-none text-gray-300 hover:text-gray-500"
                      onMouseDown={(e) => {
                        // This is the only place drag should start
                      }}
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    {block.style.listType === 'bullet' && (
                      <div
                        className="w-6 flex justify-center select-none text-gray-800 shrink-0"
                        style={{ fontSize: `${block.style.fontSize}px`, lineHeight: 1.625 }}
                      >
                        •
                      </div>
                    )}
                    {block.style.listType === 'number' && (
                      <div
                        className="w-6 flex justify-end pr-1 select-none text-gray-800 shrink-0 font-medium"
                        style={{ fontSize: `${block.style.fontSize}px`, lineHeight: 1.625 }}
                      >
                        {listCounter}.
                      </div>
                    )}

                    <ContentBlock
                      id={block.id}
                      html={block.text}
                      className={`flex-1 bg-transparent outline-none border-none text-gray-800 leading-relaxed ${getFontFamilyClass(block.style.fontFamily)}`}
                      style={{
                        fontSize: `${block.style.fontSize}px`,
                        fontWeight: block.style.bold ? 'bold' : 'normal',
                        fontStyle: block.style.italic ? 'italic' : 'normal',
                        textDecoration: block.style.underline ? 'underline' : 'none',
                        minHeight: '1.625em'
                      }}
                      onChange={handleBlockChange}
                      onKeyDown={handleKeyDown}
                      onFocus={memoizedSetActiveBlockId}
                    />

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
                );
              });
            })()}

            <div
              className="h-24 cursor-text"
              onClick={() => {
                const lastBlock = blocks[blocks.length - 1];
                if (lastBlock.text.trim() !== "" && lastBlock.text !== "<br>") {
                  const newBlock = { id: generateId(), text: '', style: { ...DEFAULT_BLOCK_STYLE } };
                  setBlocks([...blocks, newBlock]);
                  focusRef.current = { id: newBlock.id, cursor: 'start' };
                } else {
                  document.getElementById(`block-${lastBlock.id}`)?.focus();
                }
              }}
            />
          </div>
        </div>
        <div className="max-w-3xl mx-auto mt-4 text-right text-xs text-gray-400 px-12">
          {blocks.length} blocks
        </div>
      </div>
    </div>
  );
};