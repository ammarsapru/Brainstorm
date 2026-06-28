import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { FileSystemItem } from '../types';
import { X, Save, Bold, Italic, Underline, GripVertical, Plus, Trash2, Type, List, ListOrdered, Download, Code, FileCode2, AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading1, Heading2, Heading3, Baseline, Highlighter } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import { uploadFileToS3 } from '../lib/supabase';
import DOMPurify from 'dompurify';

interface DocumentEditorProps {
  doc: FileSystemItem;
  onSave: (id: string, content: string, name: string) => void;
  onChange?: (id: string, content: string, name: string) => void;
  onClose: () => void;
  className?: string;
  onSwap?: () => void;
}

interface BlockStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;
  fontFamily: string;
  listType?: 'none' | 'bullet' | 'number';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  heading?: 0 | 1 | 2 | 3; // 0 = body text
}

const HEADING_SIZES = { 1: 30, 2: 24, 3: 20 } as const;

interface DocBlock {
  id: string;
  type?: 'text' | 'code' | 'table';
  text: string;
  style: BlockStyle;
  language?: string;
  tableData?: string[][];
}

const generateId = () => Math.random().toString(36).substr(2, 9);

// ── Caret helpers for inter-block navigation ────────────────────────────────

function measureCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  // Collapsed-range rects are zero in Chrome; use a temporary span
  const span = document.createElement('span');
  span.textContent = '​'; // zero-width space
  try {
    range.insertNode(span);
    const r = span.getBoundingClientRect();
    const rect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height } as DOMRect;
    span.remove();
    return rect;
  } catch {
    try { span.remove(); } catch {}
    return null;
  }
}

function isCaretOnFirstLine(el: HTMLElement): boolean {
  const caret = measureCaretRect();
  if (!caret) return true;
  return caret.top <= el.getBoundingClientRect().top + caret.height + 2;
}

function isCaretOnLastLine(el: HTMLElement): boolean {
  const caret = measureCaretRect();
  if (!caret) return true;
  return caret.bottom >= el.getBoundingClientRect().bottom - caret.height - 2;
}

function focusBlockElement(blockId: string, pos: 'start' | 'end') {
  const el = document.getElementById(`block-${blockId}`);
  if (!el) return;
  el.focus();
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();

    if (!el.childNodes.length) {
      // Empty div — position before the element itself (works in all browsers)
      range.setStart(el, 0);
      range.collapse(true);
    } else if (pos === 'start') {
      const first = el.childNodes[0];
      if (first.nodeType === Node.TEXT_NODE) {
        range.setStart(first, 0);
      } else {
        range.setStart(el, 0);
      }
      range.collapse(true);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
}

const DEFAULT_BLOCK_STYLE: BlockStyle = {
  bold: false,
  italic: false,
  underline: false,
  fontSize: 16,
  fontFamily: 'serif',
  listType: 'none',
  textAlign: 'left',
  heading: 0
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
      contentEditable.current.innerHTML = DOMPurify.sanitize(html);
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
      onDragOver={(e) => {
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          e.preventDefault();
          const file = files[0];
          if (file.type.startsWith('image/')) {
            uploadFileToS3(file).then(dataUrl => {
              if (dataUrl) {
                let range;
                if (document.caretRangeFromPoint) {
                  range = document.caretRangeFromPoint(e.clientX, e.clientY);
                } else if ((document as any).caretPositionFromPoint) {
                  const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
                  if (pos) {
                    range = document.createRange();
                    range.setStart(pos.offsetNode, pos.offset);
                    range.collapse(true);
                  }
                }
                if (range) {
                  const sel = window.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                }
                const imgNode = DOMPurify.sanitize(`<img src="${dataUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px; margin-bottom: 8px;" alt="Dropped image" />`, { ALLOWED_TAGS: ['img'], ALLOWED_ATTR: ['src', 'style', 'alt'] });
                document.execCommand('insertHTML', false, imgNode);
              }
            });
          }
        }
      }}
      onPaste={(e) => {
        e.stopPropagation();
        const items = e.clipboardData?.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              const blob = items[i].getAsFile();
              if (blob) {
                e.preventDefault();
                uploadFileToS3(blob).then(dataUrl => {
                  if (dataUrl) {
                    const imgNode = DOMPurify.sanitize(`<img src="${dataUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px; margin-bottom: 8px;" alt="Pasted image" />`, { ALLOWED_TAGS: ['img'], ALLOWED_ATTR: ['src', 'style', 'alt'] });
                    document.execCommand('insertHTML', false, imgNode);
                  }
                });
                return;
              }
            }
          }
        }
      }}
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

  const documentRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!documentRef.current) return;

    try {
      setIsExporting(true);
      // Delay to allow UI to settle and ensure the header is rendered
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(documentRef.current, {
        useCORS: true,
        scale: 2, // High resolution
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${title || 'Document'}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMarkdown = (e: React.MouseEvent) => {
    e.stopPropagation();

    let mdContent = `# ${title || 'Document'}\n\n`;

    blocks.forEach((block, index) => {
      // Basic html to text conversion for simple block.text
      const text = block.text.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');

      if (block.type === 'code') {
        mdContent += `\`\`\`${block.language || ''}\n${block.text}\n\`\`\`\n\n`;
      } else if (block.type === 'table' && block.tableData) {
        if (block.tableData.length > 0) {
          // Headers
          mdContent += '| ' + block.tableData[0].map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          // Separator
          mdContent += '|' + block.tableData[0].map(() => '---').join('|') + '|\n';
          // Body
          for (let i = 1; i < block.tableData.length; i++) {
            mdContent += '| ' + block.tableData[i].map(c => c.replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          }
          mdContent += '\n';
        }
      } else if (block.style.listType === 'number') {
        mdContent += `1. ${text}\n`; // Markdown handles auto-incrementing
        if (index === blocks.length - 1 || blocks[index + 1].style.listType !== 'number') {
          mdContent += '\n';
        }
      } else if (block.style.listType === 'bullet') {
        mdContent += `- ${text}\n`;
        if (index === blocks.length - 1 || blocks[index + 1].style.listType !== 'bullet') {
          mdContent += '\n';
        }
      } else if (block.style.heading) {
        mdContent += `${'#'.repeat(block.style.heading)} ${text}\n\n`;
      } else {
        if (block.style.bold) mdContent += `**${text}**`;
        else if (block.style.italic) mdContent += `*${text}*`;
        else mdContent += text;

        mdContent += '\n\n';
      }
    });

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'Document'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

    if (textContent.startsWith('/n ') && !block.style.listType && block.type !== 'code' && block.type !== 'table') {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        text: html.replace('/n ', ''),
        style: { ...b.style, listType: 'number' }
      } : b));
      setIsSaved(false);
      return;
    }
    if (textContent.startsWith('/b ') && !block.style.listType && block.type !== 'code' && block.type !== 'table') {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        text: html.replace('/b ', ''),
        style: { ...b.style, listType: 'bullet' }
      } : b));
      setIsSaved(false);
      return;
    }
    if (textContent.startsWith('/c ')) {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        type: 'code',
        language: 'javascript',
        text: html.replace('/c ', '').replace(/<[^>]+>/g, '').trim(),
        style: { ...b.style, listType: 'none' }
      } : b));
      setIsSaved(false);
      return;
    }
    if (textContent.startsWith('/t ')) {
      setBlocks(prev => prev.map(b => b.id === id ? {
        ...b,
        type: 'table',
        tableData: [['', ''], ['', '']],
        style: { ...b.style, listType: 'none' }
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

    // ArrowUp: jump to previous block when cursor is on the first visual line
    if (e.key === 'ArrowUp' && index > 0) {
      const el = document.getElementById(`block-${id}`);
      if (el && isCaretOnFirstLine(el)) {
        e.preventDefault();
        focusBlockElement(currentBlocks[index - 1].id, 'end');
        setActiveBlockId(currentBlocks[index - 1].id);
      }
    }

    // ArrowDown: jump to next block when cursor is on the last visual line
    if (e.key === 'ArrowDown' && index < currentBlocks.length - 1) {
      const el = document.getElementById(`block-${id}`);
      if (el && isCaretOnLastLine(el)) {
        e.preventDefault();
        focusBlockElement(currentBlocks[index + 1].id, 'start');
        setActiveBlockId(currentBlocks[index + 1].id);
      }
    }

    // Tab: jump to next EMPTY cell (skip filled ones); Shift+Tab: previous cell (immediate)
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab — go to the immediately previous cell
        if (index > 0) {
          focusBlockElement(currentBlocks[index - 1].id, 'end');
          setActiveBlockId(currentBlocks[index - 1].id);
        }
      } else {
        // Tab — find the next empty cell after current position
        const nextEmpty = currentBlocks.slice(index + 1).find(b => !b.text.trim());
        if (nextEmpty) {
          focusBlockElement(nextEmpty.id, 'start');
          setActiveBlockId(nextEmpty.id);
        } else {
          // No empty cell ahead — create one at the end
          const newBlock: DocBlock = { id: generateId(), text: '', style: { ...currentBlocks[index].style } };
          setBlocks([...currentBlocks, newBlock]);
          setIsSaved(false);
          focusRef.current = { id: newBlock.id, cursor: 'start' };
        }
      }
    }
  }, [setActiveBlockId]);

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

  // ── Text / highlight colour (operate on the current selection) ──────────────
  // The native colour picker steals focus, so we snapshot the selection on
  // mousedown and restore it before applying the colour.
  const savedRangeRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const applyColor = (command: 'foreColor' | 'hiliteColor', color: string) => {
    if (!activeBlockId) return;
    const el = document.getElementById(`block-${activeBlockId}`);
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, color);
    document.execCommand('styleWithCSS', false, 'false');
    // Persist the resulting HTML (colour spans) to the block.
    setBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, text: el.innerHTML } : b));
    setIsSaved(false);
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
      onDragOver={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            uploadFileToS3(file).then(dataUrl => {
              if (dataUrl) {
                const imgNode = `<img src="${dataUrl}" style="max-width: 100%; border-radius: 8px; margin-top: 8px; margin-bottom: 8px;" alt="Dropped image" />`;
                const newBlock = { id: generateId(), text: imgNode, style: { ...DEFAULT_BLOCK_STYLE } };
                setBlocks(prev => [...prev, newBlock]);
                setIsSaved(false);
              }
            });
          }
        }
      }}
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
              onClick={handleExportMarkdown}
              className={`p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors flex items-center justify-center`}
              title="Export MD"
            >
              <FileCode2 className="w-5 h-5 text-blue-500" />
            </button>
            <button
              onClick={handleExportPDF}
              className={`p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors ${isExporting ? 'animate-pulse text-green-500' : ''}`}
              title="Export PDF"
              disabled={isExporting}
            >
              <Download className="w-5 h-5 text-green-600" />
            </button>
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
          <div className="w-px h-6 bg-gray-200 mx-1" />
          {/* Headings */}
          {([1, 2, 3] as const).map(lvl => {
            const HeadingIcon = lvl === 1 ? Heading1 : lvl === 2 ? Heading2 : Heading3;
            return (
              <button
                key={lvl}
                onClick={() => updateActiveBlockStyle('heading', currentStyle.heading === lvl ? 0 : lvl)}
                className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${currentStyle.heading === lvl ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
                title={`Heading ${lvl}`}
              >
                <HeadingIcon className="w-4 h-4" />
              </button>
            );
          })}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          {/* Alignment */}
          {([
            { val: 'left', Icon: AlignLeft },
            { val: 'center', Icon: AlignCenter },
            { val: 'right', Icon: AlignRight },
            { val: 'justify', Icon: AlignJustify },
          ] as const).map(({ val, Icon }) => (
            <button
              key={val}
              onClick={() => updateActiveBlockStyle('textAlign', val)}
              className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${(currentStyle.textAlign || 'left') === val ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
              title={`Align ${val}`}
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          {/* Text colour */}
          <label
            className="relative p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600 cursor-pointer flex items-center justify-center"
            title="Text color"
            onMouseDown={saveSelection}
          >
            <Baseline className="w-4 h-4" />
            <input
              type="color"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => applyColor('foreColor', e.target.value)}
            />
          </label>
          {/* Highlight colour */}
          <label
            className="relative p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-600 cursor-pointer flex items-center justify-center"
            title="Highlight color"
            onMouseDown={saveSelection}
          >
            <Highlighter className="w-4 h-4" />
            <input
              type="color"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => applyColor('hiliteColor', e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8 bg-gray-50/30">
        <div ref={documentRef} className="max-w-3xl mx-auto bg-white min-h-[800px] shadow-sm border border-gray-100 p-12 rounded-lg">
          {/* Include Title in Document Export explicitly for the PDF */}
          <h1 data-html2canvas-ignore="false" className={`text-4xl font-bold text-gray-900 outline-none empty:hidden text-center ${isExporting ? 'mb-8 border-b pb-4 block' : 'hidden'}`}>
            {title}
          </h1>
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
                    data-block-index={index}
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
                      style={{ touchAction: 'none' }}
                      onMouseDown={(e) => {
                        // Mouse drag is handled by the row's HTML5 draggable above.
                      }}
                      onPointerDown={(e) => {
                        // Touch-only pointer drag (mouse keeps native HTML5 DnD).
                        if (e.pointerType !== 'touch') return;
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDraggedBlockIndex(index);
                      }}
                      onPointerMove={(e) => {
                        if (e.pointerType !== 'touch' || draggedBlockIndex === null) return;
                        const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-block-index]');
                        if (!row) return;
                        const idx = Number(row.getAttribute('data-block-index'));
                        const rect = row.getBoundingClientRect();
                        const position = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
                        setDropTarget(prev => (prev && prev.index === idx && prev.position === position) ? prev : { index: idx, position });
                      }}
                      onPointerUp={(e) => {
                        if (e.pointerType !== 'touch') return;
                        if (draggedBlockIndex !== null && dropTarget !== null) {
                          const newBlocks = [...blocks];
                          const dragged = newBlocks[draggedBlockIndex];
                          newBlocks.splice(draggedBlockIndex, 1);
                          let t = dropTarget.index;
                          if (draggedBlockIndex < dropTarget.index) t -= 1;
                          if (dropTarget.position === 'bottom') t += 1;
                          newBlocks.splice(t, 0, dragged);
                          setBlocks(newBlocks);
                          setIsSaved(false);
                        }
                        setDraggedBlockIndex(null);
                        setDropTarget(null);
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
                    {block.style.listType === 'number' && block.type !== 'code' && block.type !== 'table' && (
                      <div
                        className="w-6 flex justify-end pr-1 select-none text-gray-800 shrink-0 font-medium"
                        style={{ fontSize: `${block.style.fontSize}px`, lineHeight: 1.625 }}
                      >
                        {listCounter}.
                      </div>
                    )}

                    {block.type === 'code' ? (
                      <div className="flex-1 rounded-md overflow-hidden bg-[#1d1f21] p-0.5 mt-1 mb-2 shadow-inner border border-gray-700/50 w-full">
                        <div className="flex justify-between items-center bg-[#2d2f33] px-3 py-1.5 border-b border-gray-700 w-full">
                          <span className="text-xs text-gray-400 font-mono flex items-center gap-1.5 pointer-events-none">
                            <Code className="w-3 h-3" />
                            {block.language || 'Code'}
                          </span>
                          <select
                            value={block.language || 'javascript'}
                            onChange={(e) => {
                              setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, language: e.target.value } : b));
                              setIsSaved(false);
                            }}
                            className="text-xs bg-transparent text-gray-400 outline-none border-none cursor-pointer hover:text-white transition-colors text-right"
                          >
                            <option value="javascript">JavaScript</option>
                            <option value="typescript">TypeScript</option>
                            <option value="python">Python</option>
                            <option value="css">CSS</option>
                            <option value="json">JSON</option>
                            <option value="bash">Bash</option>
                          </select>
                        </div>
                        <Editor
                          value={block.text}
                          onValueChange={(code) => {
                            setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, text: code } : b));
                            setIsSaved(false);
                          }}
                          highlight={code => {
                            try {
                              let lang = block.language || 'javascript';
                              if (!Prism.languages[lang]) lang = 'javascript';
                              return Prism.highlight(code, Prism.languages[lang], lang);
                            } catch (e) {
                              return code;
                            }
                          }}
                          padding={16}
                          style={{
                            fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                            fontSize: 14,
                            backgroundColor: 'transparent',
                            color: '#e5e7eb',
                            minHeight: '80px',
                            width: '100%',
                          }}
                          className="w-full focus:outline-none"
                        />
                      </div>
                    ) : block.type === 'table' ? (
                      <div className="flex-1 mt-2 mb-2 w-full overflow-x-auto">
                        <div className="flex items-center gap-2 mb-2" onMouseDown={(e) => e.stopPropagation()}>
                          <button onClick={() => {
                            const td = block.tableData ? [...block.tableData] : [['', ''], ['', '']];
                            if (td.length < 6) {
                              td.push(new Array(td[0].length).fill(''));
                              setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: td } : b));
                              setIsSaved(false);
                            }
                          }} disabled={(block.tableData?.length || 2) >= 6} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 transition-all font-medium border border-gray-200 text-gray-600">+ Row</button>
                          <button onClick={() => {
                            const td = block.tableData ? [...block.tableData] : [['', ''], ['', '']];
                            if (td[0].length < 6) {
                              const newTd = td.map(row => [...row, '']);
                              setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: newTd } : b));
                              setIsSaved(false);
                            }
                          }} disabled={(block.tableData?.[0]?.length || 2) >= 6} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 transition-all font-medium border border-gray-200 text-gray-600">+ Col</button>
                        </div>
                        <table className="w-full border-collapse isolate rounded-lg ring-1 ring-gray-200" style={{ tableLayout: 'fixed' }}>
                          <tbody>
                            {(block.tableData || [['', ''], ['', '']]).map((row, rIndex) => (
                              <tr key={rIndex} className={rIndex === 0 ? 'bg-gray-50/80 font-medium' : ''}>
                                {row.map((cell, cIndex) => (
                                  <td key={cIndex} className="p-0 border border-gray-200 relative group/cell min-w-[100px]">
                                    <textarea
                                      value={cell}
                                      onChange={(e) => {
                                        const copy = (block.tableData || [['', ''], ['', '']]).map(r => [...r]);
                                        copy[rIndex][cIndex] = e.target.value;
                                        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: copy } : b));
                                        setIsSaved(false);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                      }}
                                      placeholder={rIndex === 0 ? "Header..." : "Cell..."}
                                      className={`w-full h-full min-h-[40px] p-2 bg-transparent outline-none resize-none overflow-hidden ${rIndex === 0 ? 'font-semibold text-gray-800' : 'text-gray-600'}`}
                                      rows={1}
                                      onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; memoizedSetActiveBlockId(block.id); }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    />
                                    {/* column delete button on header row hover */}
                                    {rIndex === 0 && row.length > 2 && (
                                      <button tabIndex={-1} onClick={() => {
                                        const newTd = (block.tableData || [['', ''], ['', '']]).map(r => { const cr = [...r]; cr.splice(cIndex, 1); return cr; });
                                        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: newTd } : b));
                                        setIsSaved(false);
                                      }} className="absolute top-0 right-0 -translate-y-full opacity-0 group-hover/cell:opacity-100 p-0.5 px-1.5 bg-red-100 text-red-600 rounded-t-md border border-b-0 border-red-200 z-10 hover:bg-red-200 text-xs shadow-sm">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                    {/* row delete button on first cell hover */}
                                    {cIndex === 0 && (block.tableData || [[], []]).length > 2 && (
                                      <button tabIndex={-1} onClick={() => {
                                        const newTd = [...(block.tableData || [['', ''], ['', '']])];
                                        newTd.splice(rIndex, 1);
                                        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: newTd } : b));
                                        setIsSaved(false);
                                      }} className="absolute left-0 top-0 -translate-x-full opacity-0 group-hover/cell:opacity-100 p-0.5 px-1.5 bg-red-100 text-red-600 rounded-l-md border border-r-0 border-red-200 z-10 hover:bg-red-200 text-xs shadow-sm flex items-center justify-center min-h-[40px]">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <ContentBlock
                        id={block.id}
                        html={block.text}
                        className={`flex-1 bg-transparent outline-none border-none text-gray-800 leading-relaxed ${getFontFamilyClass(block.style.fontFamily)}`}
                        style={{
                          fontSize: `${block.style.heading ? HEADING_SIZES[block.style.heading] : block.style.fontSize}px`,
                          fontWeight: (block.style.bold || block.style.heading) ? 'bold' : 'normal',
                          fontStyle: block.style.italic ? 'italic' : 'normal',
                          textDecoration: block.style.underline ? 'underline' : 'none',
                          textAlign: block.style.textAlign || 'left',
                          minHeight: '1.625em'
                        }}
                        onChange={handleBlockChange}
                        onKeyDown={handleKeyDown}
                        onFocus={memoizedSetActiveBlockId}
                      />
                    )}

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