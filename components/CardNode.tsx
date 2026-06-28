import React, { useRef, useEffect, useState } from 'react';
import { IdeaCard, CardStyle, LabelShape } from '../types';
import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';
import { Trash2, GripHorizontal, Bold, Italic, Maximize2, Download, Square, Circle, Diamond, RectangleHorizontal } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { uploadFileToS3 } from '../lib/supabase';
import { ImageCardBody } from './cards/ImageCardBody';
import { FileCardBody } from './cards/FileCardBody';
import { BrowserCardBody } from './cards/BrowserCardBody';

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
  isNew?: boolean;
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
  onRegisterTextarea,
  isNew,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Measured text-box size (content) for shaped label cards — the shape is
  // sized around this box and the box is centred inside the shape.
  const [textBox, setTextBox] = useState<{ w: number; h: number } | null>(null);

  const isFileCard    = card.kind === 'file';
  const isImageCard   = card.kind === 'image';
  const isLabelCard   = card.kind === 'label';
  const isBrowserCard = card.kind === 'browser';
  const isTextCard    = !card.kind || card.kind === 'text';

  const labelShape: LabelShape = isLabelCard ? (card.shape || 'rectangle') : 'rectangle';
  const isShapedLabel = isLabelCard && labelShape !== 'rectangle';

  const mediaUrl = card.url ?? card.image;

  const handleExportPDF = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardRef.current) return;
    try {
      setIsExporting(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      const canvas = await html2canvas(cardRef.current, { useCORS: true, scale: 2, backgroundColor: card.color || '#ffffff' });
      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1];
      const bin = atob(b64);
      const pngBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) pngBytes[i] = bin.charCodeAt(i);

      const doc = await PDFDocument.create();
      const img = await doc.embedPng(pngBytes);
      const page = doc.addPage([canvas.width, canvas.height]);
      page.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      const pdfBytes = await doc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.fileName || card.text?.slice(0, 30) || 'brainstorm-card'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-resize height for text cards
  useEffect(() => {
    if (!isTextCard) return;
    if (textareaRef.current && cardRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const idealWidth = Math.max(200, Math.min(400, card.text.length * 10));
      const targetWidth = Math.max(card.width, idealWidth);
      textareaRef.current.style.height = scrollHeight + 'px';
      const fullHeight = cardRef.current.offsetHeight;
      if (Math.abs(fullHeight - card.height) > 5 || Math.abs(targetWidth - card.width) > 5) {
        const timer = setTimeout(() => { onUpdate(card.id, { height: fullHeight, width: targetWidth }); }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [card.text, card.style, card.height, card.width, isSelected, isTextCard]);

  // Auto-resize label cards to fit their content
  useEffect(() => {
    if (!isLabelCard) return;
    const ta = textareaRef.current;
    if (!ta) return;

    const cs = getComputedStyle(ta);
    const LH = 1.2; // line-height shared by the mirror and the rendered textarea

    // Mirror element measures the text box (width + wrapped height) using the
    // exact font, honouring wrapping — so the rendered textarea matches it.
    const mirror = document.createElement('div');
    mirror.style.cssText = [
      'position:fixed', 'top:-9999px', 'left:-9999px', 'visibility:hidden',
      'box-sizing:content-box', 'word-break:break-word',
      `font:${cs.font}`, `letter-spacing:${cs.letterSpacing}`, `line-height:${LH}`,
    ].join(';');
    mirror.textContent = card.text || 'Label';
    document.body.appendChild(mirror);

    // Natural single-line width (no wrap)
    mirror.style.whiteSpace = 'pre';
    mirror.style.width = 'auto';
    const naturalW = Math.max(1, mirror.offsetWidth);

    const measure = (wrapW: number) => {
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.width = `${wrapW}px`;
      return { w: mirror.offsetWidth, h: mirror.offsetHeight };
    };

    // Choose a wrap width per shape, then measure the resulting text box.
    let tw: number, th: number;
    if (labelShape === 'square') {
      // Aim for a roughly square text block so the square doesn't balloon
      // horizontally on a long single line.
      const lineH = (parseFloat(cs.fontSize) || 16) * LH;
      const wrapW = Math.max(40, Math.min(220, Math.round(Math.sqrt(naturalW * lineH))));
      ({ w: tw, h: th } = measure(wrapW));
    } else if (labelShape === 'diamond' || labelShape === 'circle') {
      ({ w: tw, h: th } = measure(Math.min(naturalW, 240)));
    } else {
      ({ w: tw, h: th } = measure(Math.min(naturalW, 520)));
    }
    document.body.removeChild(mirror);

    // Persist the measured text box so the rendered textarea matches exactly.
    setTextBox(prev =>
      (prev && Math.abs(prev.w - tw) < 1.5 && Math.abs(prev.h - th) < 1.5) ? prev : { w: tw, h: th });

    // Size the shape AROUND the text box, centred, with breathing room:
    //  - diamond: inscribed centred rect needs ~2× the box (w/W + h/H ≤ 1)
    //  - circle (ellipse): axes ≈ √2× the box ((w/W)² + (h/H)² ≤ 1)
    //  - square: side = larger box dimension
    const PAD = 18;
    let W: number, H: number;
    switch (labelShape) {
      case 'square': { const side = Math.max(tw, th) + PAD * 2; W = side; H = side; break; }
      case 'circle':  W = Math.round(tw * 1.42 + PAD * 2); H = Math.round(th * 1.42 + PAD * 2); break;
      case 'diamond': W = Math.round(tw * 2 + PAD * 2);     H = Math.round(th * 2 + PAD * 2);     break;
      default:        W = tw + 32;                          H = th + 16; // rectangle (px-3 / py-2)
    }
    W = Math.max(72, Math.min(680, W));
    H = Math.max(40, Math.min(680, H));

    if (Math.abs(W - card.width) > 2 || Math.abs(H - card.height) > 2) {
      const t = setTimeout(() => { onUpdate(card.id, { width: W, height: H }); }, 30);
      return () => clearTimeout(t);
    }
  }, [card.text, card.style, card.shape, isLabelCard, labelShape]);

  const updateStyle = (key: keyof CardStyle, value: any) => {
    onUpdate(card.id, { style: { ...card.style, [key]: value } });
  };

  const getFontFamily = (font: string) => {
    switch (font) {
      case 'serif':    return 'font-serif';
      case 'mono':     return 'font-mono';
      case 'cursive':  return 'font-cursive';
      case 'inter':    return 'font-inter';
      case 'playfair': return 'font-playfair';
      case 'slab':     return 'font-slab';
      case 'hand':     return 'font-hand';
      case 'bebas':    return 'font-bebas';
      case 'comic':    return 'font-comic';
      default:         return 'font-sans';
    }
  };

  return (
    <div
      ref={cardRef}
      role="article"
      aria-label={card.text?.trim() || card.fileName || 'Idea card'}
      className={`absolute flex flex-col group
        ${isShapedLabel
          ? (isSelected ? 'z-20' : 'z-10')
          : `shadow-sm transition-shadow duration-200 ${isSelected ? 'ring-2 ring-emerald-500 shadow-xl z-20' : 'hover:shadow-md hover:ring-2 hover:ring-[#0055ff] z-10'}`}
        ${isNew ? 'animate-card-appear' : ''}
      `}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        ...(isShapedLabel
          ? { height: card.height }
          : { backgroundColor: card.color, borderRadius: '8px' }),
        transform: 'translate(-50%, -50%)',
        cursor: 'default',
        touchAction: 'none',
      }}
      onPointerDown={(e) => onPointerDown(e, card.id)}
      onDoubleClick={(e) => onDoubleClick?.(e, card.id)}
    >
      {/* Shape background for non-rectangular label cards (flowchart shapes) */}
      {isShapedLabel && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${card.width} ${card.height}`}
          preserveAspectRatio="none"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))' }}
        >
          {(() => {
            const sw = 2;
            const strokeClass = isSelected
              ? 'stroke-emerald-500'
              : 'stroke-gray-300 group-hover:stroke-[#0055ff] transition-colors';
            const W = card.width;
            const H = card.height;
            if (labelShape === 'circle') {
              return <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - sw} ry={H / 2 - sw} fill={card.color} className={strokeClass} strokeWidth={sw} />;
            }
            if (labelShape === 'diamond') {
              return <polygon points={`${W / 2},${sw} ${W - sw},${H / 2} ${W / 2},${H - sw} ${sw},${H / 2}`} fill={card.color} className={strokeClass} strokeWidth={sw} strokeLinejoin="round" />;
            }
            // square
            return <rect x={sw} y={sw} width={W - 2 * sw} height={H - 2 * sw} rx={6} fill={card.color} className={strokeClass} strokeWidth={sw} />;
          })()}
        </svg>
      )}

      {/* Connection selection overlay */}
      {isConnecting && (
        <div className="absolute inset-0 z-50 rounded-xl cursor-crosshair bg-transparent" />
      )}

      {/* Formatting toolbar — text/label only */}
      {isSelected && (isTextCard || isLabelCard) && (
        <div
          data-html2canvas-ignore="true"
          className="absolute flex items-center gap-1 bg-white p-1.5 rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in duration-200"
          style={{ top: -50, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Tooltip text="Bold" position="top">
            <button onClick={() => updateStyle('isBold', !card.style.isBold)} className={`p-1.5 rounded hover:bg-gray-100 ${card.style.isBold ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}>
              <Bold className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip text="Italic" position="top">
            <button onClick={() => updateStyle('isItalic', !card.style.isItalic)} className={`p-1.5 rounded hover:bg-gray-100 ${card.style.isItalic ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}>
              <Italic className="w-4 h-4" />
            </button>
          </Tooltip>
          {/* Shape picker — label cards only (flowchart shapes) */}
          {isLabelCard && (
            <>
              <div className="w-px h-4 bg-gray-200 mx-1" />
              {([
                { shape: 'rectangle', icon: <RectangleHorizontal className="w-4 h-4" />, label: 'Rectangle (process)' },
                { shape: 'diamond', icon: <Diamond className="w-4 h-4" />, label: 'Diamond (decision)' },
                { shape: 'circle', icon: <Circle className="w-4 h-4" />, label: 'Circle (start/end)' },
                { shape: 'square', icon: <Square className="w-4 h-4" />, label: 'Square' },
              ] as { shape: LabelShape; icon: React.ReactNode; label: string }[]).map(({ shape, icon, label }) => (
                <Tooltip key={shape} text={label} position="top">
                  <button
                    onClick={() => onUpdate(card.id, { shape })}
                    className={`p-1.5 rounded hover:bg-gray-100 ${labelShape === shape ? 'bg-zinc-100 text-black' : 'text-gray-600'}`}
                  >
                    {icon}
                  </button>
                </Tooltip>
              ))}
            </>
          )}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <select
            value={card.style.fontFamily}
            onChange={(e) => updateStyle('fontFamily', e.target.value)}
            className="text-xs border-none bg-transparent outline-none text-gray-700 font-medium cursor-pointer max-w-[80px]"
          >
            {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <div className="flex gap-1">
            {['#ffffff', '#fef3c7', '#69f0ae', '#dbeafe', '#ff5252'].map(c => (
              <button
                key={c}
                className={`w-4 h-4 rounded-full border border-gray-200 ${card.color === c ? 'ring-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => onUpdate(card.id, { color: c })}
              />
            ))}
            <label
              className={`w-4 h-4 rounded-full border border-gray-200 cursor-pointer flex items-center justify-center overflow-hidden ${!['#ffffff','#fef3c7','#69f0ae','#dbeafe','#ff5252'].includes(card.color) ? 'ring-2 ring-gray-400' : ''}`}
              style={{ background: 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)', boxShadow: 'inset 0 0 2px rgba(0,0,0,0.1)' }}
              title="Custom Color"
            >
              <input type="color" value={card.color} onChange={(e) => onUpdate(card.id, { color: e.target.value })} className="opacity-0 w-full h-full cursor-pointer p-0 border-none" />
            </label>
          </div>
        </div>
      )}

      {/* Drag handle */}
      <div
        data-html2canvas-ignore="true"
        onPointerDown={(e) => onGripDown?.(e, card.id)}
        className="h-6 w-full cursor-grab active:cursor-grabbing flex items-center justify-center bg-black/5 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripHorizontal className="w-4 h-4 text-gray-400" />
      </div>

      {/* ── Image card ── */}
      {isImageCard && mediaUrl && (
        <ImageCardBody
          url={mediaUrl}
          fileName={card.fileName}
          onImageClick={onImageClick}
        />
      )}

      {/* ── File card ── */}
      {isFileCard && mediaUrl && (
        <FileCardBody
          url={mediaUrl}
          fileName={card.fileName}
          fileSubtype={card.fileSubtype}
          onOpen={() => onOpenCard?.(card)}
        />
      )}

      {/* ── Browser card ── */}
      {isBrowserCard && (
        <BrowserCardBody
          url={card.url ?? ''}
          onUrlChange={(url) => onUpdate(card.id, { url })}
          onOpenFullscreen={() => onOpenCard?.(card)}
        />
      )}

      {/* ── Label card ── */}
      {isLabelCard && (
        <div
          className={isShapedLabel
            ? 'absolute inset-0 z-10 flex items-center justify-center'
            : 'px-3 py-2 flex-grow flex items-center justify-center'}
        >
          <textarea
            ref={(el) => { textareaRef.current = el; onRegisterTextarea?.(card.id, el); }}
            value={card.text}
            onChange={(e) => onUpdate(card.id, { text: e.target.value })}
            data-card-id={card.id}
            placeholder="Label…"
            className={`bg-transparent resize-none outline-none placeholder-gray-300 overflow-hidden text-center font-semibold text-gray-700 ${getFontFamily(card.style.fontFamily)} ${isShapedLabel ? '' : 'w-full'}`}
            style={{
              fontSize: `${card.style.fontSize}px`,
              fontWeight: card.style.isHeader ? '800' : 'bold',
              fontStyle: card.style.isItalic ? 'italic' : 'normal',
              ...(isShapedLabel && textBox
                ? { width: textBox.w + 2, height: textBox.h, lineHeight: 1.2, padding: 0, boxSizing: 'content-box' as const }
                : {}),
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              const ta = textareaRef.current;
              if (!ta) return;
              const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
              const atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
              if ((e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && atStart)) && atStart) {
                e.preventDefault(); onMoveFocusVertical?.(card.id, 'up');
              } else if ((e.key === 'ArrowDown' || (e.key === 'ArrowRight' && atEnd)) && atEnd) {
                e.preventDefault(); onMoveFocusVertical?.(card.id, 'down');
              } else if (e.key === 'Tab') {
                e.preventDefault(); onMoveFocusVertical?.(card.id, e.shiftKey ? 'up' : 'down');
              }
            }}
          />
        </div>
      )}

      {/* ── Text card ── */}
      {isTextCard && (
        <div className="p-3 flex flex-col flex-grow">
          {isExporting ? (
            <div
              className={`w-full bg-transparent text-gray-800 whitespace-pre-wrap break-words flex-grow ${getFontFamily(card.style.fontFamily)}`}
              style={{ minHeight: '60px', fontWeight: card.style.isHeader ? '800' : card.style.isBold ? 'bold' : 'normal', fontStyle: card.style.isItalic ? 'italic' : 'normal', fontSize: card.style.isHeader ? '24px' : `${card.style.fontSize}px`, textAlign: card.style.textAlign || 'center' }}
            >
              {card.text || ' '}
            </div>
          ) : (
            <textarea
              ref={(el) => { textareaRef.current = el; onRegisterTextarea?.(card.id, el); }}
              value={card.text}
              onChange={(e) => onUpdate(card.id, { text: e.target.value })}
              data-card-id={card.id}
              onPaste={(e) => {
                // Paste image into text cell — uploads and inserts URL as text
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const blob = items[i].getAsFile();
                      if (blob) {
                        const el = textareaRef.current;
                        const start = el?.selectionStart ?? card.text.length;
                        const end = el?.selectionEnd ?? start;
                        setIsUploading(true);
                        uploadFileToS3(blob).then(url => {
                          setIsUploading(false);
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
                        }).catch(() => setIsUploading(false));
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                    }
                  }
                }
              }}
              onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onDrop={(e) => {
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                  const file = files[0];
                  if (file.type.startsWith('image/')) {
                    const el = textareaRef.current;
                    const start = el?.selectionStart ?? card.text.length;
                    const end = el?.selectionEnd ?? start;
                    setIsUploading(true);
                    uploadFileToS3(file).then(url => {
                      setIsUploading(false);
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
                    }).catch(() => setIsUploading(false));
                    e.preventDefault();
                  }
                }
              }}
              placeholder={isUploading ? 'Uploading image…' : 'Enter idea...'}
              disabled={isUploading}
              className={`w-full bg-transparent resize-none outline-none placeholder-gray-400 overflow-hidden transition-opacity duration-200 flex-grow ${getFontFamily(card.style.fontFamily)} ${isUploading ? 'opacity-40 text-gray-400 cursor-wait' : 'text-gray-800'}`}
              style={{ minHeight: '60px', fontWeight: card.style.isHeader ? '800' : card.style.isBold ? 'bold' : 'normal', fontStyle: card.style.isItalic ? 'italic' : 'normal', fontSize: card.style.isHeader ? '24px' : `${card.style.fontSize}px`, textAlign: card.style.textAlign || 'center' }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                const ta = textareaRef.current;
                if (!ta) return;
                const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
                const atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
                if ((e.key === 'ArrowUp' || (e.key === 'ArrowLeft' && atStart)) && atStart) {
                  e.preventDefault(); onMoveFocusVertical?.(card.id, 'up');
                } else if ((e.key === 'ArrowDown' || (e.key === 'ArrowRight' && atEnd)) && atEnd) {
                  e.preventDefault(); onMoveFocusVertical?.(card.id, 'down');
                } else if (e.key === 'Tab') {
                  e.preventDefault(); onMoveFocusVertical?.(card.id, e.shiftKey ? 'up' : 'down');
                }
              }}
            />
          )}
        </div>
      )}

      {/* Action bar */}
      <div
        data-html2canvas-ignore="true"
        className={`absolute -bottom-5 left-1/2 -translate-x-1/2 translate-y-full flex gap-2 transition-opacity duration-200 ${isSelected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!isLabelCard && (
          <Tooltip text={isFileCard ? 'Open file viewer' : isImageCard ? 'Open full screen' : 'Open document editor'} position="bottom">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCard?.(card); }}
              className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Connect to another card" position="bottom">
          <button
            onClick={(e) => { e.stopPropagation(); onConnectStart(e, card.id); }}
            className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </Tooltip>
        {(isTextCard || isLabelCard) && (
          <Tooltip text="AI brainstorm — generate related ideas" position="bottom">
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateAI(card.id); }}
              className={`p-2 bg-white rounded-full shadow-md hover:bg-gray-50 text-black border border-gray-100 ${isProcessingAI ? 'animate-pulse' : ''}`}
              disabled={isProcessingAI}
            >
              <span className="font-bold text-[11px] leading-none select-none">B</span>
            </button>
          </Tooltip>
        )}
        {isTextCard && (
          <Tooltip text="Export this card as PDF" position="bottom">
            <button
              onClick={handleExportPDF}
              className={`p-2 bg-white rounded-full shadow-md hover:bg-green-50 text-green-600 border border-green-100 ${isExporting ? 'animate-pulse' : ''}`}
              disabled={isExporting}
            >
              <Download className="w-4 h-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Delete card" position="bottom">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            className="p-2 bg-white rounded-full shadow-md hover:bg-red-50 text-red-500 border border-red-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}, (prev, next) => (
  prev.card.id        === next.card.id &&
  prev.card.x         === next.card.x &&
  prev.card.y         === next.card.y &&
  prev.card.text      === next.card.text &&
  prev.card.kind      === next.card.kind &&
  prev.card.shape     === next.card.shape &&
  prev.card.url       === next.card.url &&
  prev.card.image     === next.card.image &&
  prev.card.fileSubtype  === next.card.fileSubtype &&
  prev.card.imageSubtype === next.card.imageSubtype &&
  prev.card.fileName  === next.card.fileName &&
  prev.card.width     === next.card.width &&
  prev.card.height    === next.card.height &&
  prev.card.color     === next.card.color &&
  JSON.stringify(prev.card.content) === JSON.stringify(next.card.content) &&
  prev.isSelected     === next.isSelected &&
  prev.isProcessingAI === next.isProcessingAI &&
  prev.isConnecting   === next.isConnecting &&
  prev.scale          === next.scale &&
  JSON.stringify(prev.card.style) === JSON.stringify(next.card.style)
));
