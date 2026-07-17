import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  FileText,
  Image as ImageIcon,
  Italic,
  Move,
  RefreshCcw,
  Type,
  X,
} from 'lucide-react';
import { ExportBlock, ExportDraft } from '../services/exportDraftTypes';
import {
  EXPORT_PAGE_HEIGHT,
  EXPORT_PAGE_WIDTH,
  rebuildDraftPages,
} from '../services/exportDraftService';
import {
  downloadPdfBytes,
  exportDraftFileName,
  renderExportDraftToPdf,
} from '../services/exportRenderer';

interface PdfPreviewEditorProps {
  initialDraft: ExportDraft;
  onClose: () => void;
  onExported?: () => void;
}

type DragMode = 'move' | 'resize';

interface DragState {
  blockId: string;
  mode: DragMode;
  startX: number;
  startY: number;
  startLayout: NonNullable<ExportBlock['layout']>;
}

const PAGE_DISPLAY_W = 680;
const PAGE_SCALE = PAGE_DISPLAY_W / EXPORT_PAGE_WIDTH;
const PAGE_DISPLAY_H = EXPORT_PAGE_HEIGHT * PAGE_SCALE;

const findBlock = (draft: ExportDraft, blockId: string | null): ExportBlock | null => {
  if (!blockId) return null;
  for (const page of draft.pages) {
    const found = page.blocks.find(block => block.id === blockId);
    if (found) return found;
  }
  return null;
};

const updateBlocksEverywhere = (
  draft: ExportDraft,
  blockId: string,
  updater: (block: ExportBlock) => ExportBlock,
): ExportDraft => ({
  ...draft,
  chapters: draft.chapters.map(chapter => ({
    ...chapter,
    blocks: chapter.blocks.map(block => block.id === blockId ? updater(block) : block),
    sections: chapter.sections.map(section => ({
      ...section,
      blocks: section.blocks.map(block => block.id === blockId ? updater(block) : block),
    })),
  })),
  appendix: draft.appendix.map(block => block.id === blockId ? updater(block) : block),
  pages: draft.pages.map(page => ({
    ...page,
    blocks: page.blocks.map(block => block.id === blockId ? updater(block) : block),
  })),
});

const moveBlockToSection = (draft: ExportDraft, blockId: string, targetSectionId: string): ExportDraft => {
  let moving: ExportBlock | null = null;
  const withoutBlock = {
    ...draft,
    chapters: draft.chapters.map(chapter => ({
      ...chapter,
      blocks: chapter.blocks.filter(block => {
        if (block.id === blockId) moving = block;
        return block.id !== blockId;
      }),
      sections: chapter.sections.map(section => ({
        ...section,
        blocks: section.blocks.filter(block => {
          if (block.id === blockId) moving = block;
          return block.id !== blockId;
        }),
      })),
    })),
  };
  if (!moving) return draft;
  return rebuildDraftPages({
    ...withoutBlock,
    chapters: withoutBlock.chapters.map(chapter => ({
      ...chapter,
      sections: chapter.sections.map(section =>
        section.id === targetSectionId
          ? { ...section, blocks: [...section.blocks, moving!] }
          : section
      ),
    })),
  });
};

const BlockPreview: React.FC<{
  block: ExportBlock;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (e: React.PointerEvent, mode: DragMode) => void;
}> = ({ block, selected, onSelect, onPointerDown }) => {
  if (!block.layout) return null;
  const commonStyle: React.CSSProperties = {
    left: block.layout.x * PAGE_SCALE,
    top: block.layout.y * PAGE_SCALE,
    width: block.layout.width * PAGE_SCALE,
    height: block.layout.height * PAGE_SCALE,
    fontFamily: block.style.fontFamily === 'serif' ? 'Georgia, serif' : block.style.fontFamily === 'mono' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'Inter, system-ui, sans-serif',
    fontSize: block.style.fontSize * PAGE_SCALE * 1.35,
    lineHeight: 1.35,
    textAlign: block.style.align || 'left',
  };

  const borderClass = selected ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-slate-200 hover:border-slate-300';

  const content = (() => {
    if (block.type === 'heading') {
      return (
        <div className="h-full w-full overflow-hidden text-slate-950 font-semibold whitespace-pre-wrap break-words">
          {block.content || block.title}
        </div>
      );
    }
    if (block.type === 'image') {
      return block.url ? (
        <div className="h-full flex flex-col gap-2">
          {block.title && <div className="text-[10px] font-semibold text-slate-700 truncate">{block.title}</div>}
          <img src={block.url} alt={block.title || 'Export image'} className="min-h-0 flex-1 object-contain rounded border border-slate-100 bg-white" />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-slate-400"><ImageIcon className="w-5 h-5" /></div>
      );
    }
    if (block.type === 'pdf') {
      return (
        <div className="h-full flex flex-col gap-2 overflow-hidden">
          <div className="flex items-start gap-2 text-slate-700 font-semibold text-[11px]">
            <FileText className="w-4 h-4 text-red-500 shrink-0" />
            <span className="min-w-0 whitespace-normal break-words">{block.title || 'PDF card'}</span>
          </div>
          <div className="text-slate-600 overflow-hidden whitespace-pre-wrap break-words">
            {block.extractedText || 'Original PDF pages will be appended after export.'}
          </div>
        </div>
      );
    }
    if (block.type === 'table') {
      return (
        <div className="h-full overflow-hidden">
          {block.title && <div className="text-[10px] font-semibold mb-2 truncate">{block.title}</div>}
          <table className="w-full text-[10px] border-collapse">
            <tbody>
              {(block.rows || []).slice(0, 7).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.slice(0, 4).map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-slate-200 px-1 py-0.5 truncate">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <div className={`h-full overflow-hidden whitespace-pre-wrap break-words ${block.type === 'code' ? 'font-mono text-indigo-900' : 'text-slate-700'}`}>
        {block.title && <div className="font-semibold text-slate-950 mb-1 break-words">{block.title}</div>}
        {block.content}
      </div>
    );
  })();

  return (
    <div
      className={`absolute group bg-white border ${borderClass} ${block.type === 'heading' ? 'p-0 border-transparent bg-transparent' : 'p-2'} shadow-sm cursor-move overflow-hidden`}
      style={commonStyle}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      data-export-block-id={block.id}
    >
      {selected && (
        <div className="absolute -top-6 left-0 h-5 px-1.5 bg-indigo-600 text-white text-[10px] flex items-center gap-1 rounded-sm shadow">
          <Move className="w-3 h-3" /> Drag
        </div>
      )}
      {content}
      {selected && (
        <button
          className="absolute bottom-0 right-0 w-4 h-4 bg-indigo-600 cursor-se-resize"
          onPointerDown={(e) => onPointerDown(e, 'resize')}
          aria-label="Resize block"
        />
      )}
    </div>
  );
};

export const PdfPreviewEditor: React.FC<PdfPreviewEditorProps> = ({ initialDraft, onClose, onExported }) => {
  const [draft, setDraft] = useState(initialDraft);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const selectedBlock = useMemo(() => findBlock(draft, selectedBlockId), [draft, selectedBlockId]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: PointerEvent) => {
      const dx = (e.clientX - dragState.startX) / PAGE_SCALE;
      const dy = (e.clientY - dragState.startY) / PAGE_SCALE;
      setDraft(prev => updateBlocksEverywhere(prev, dragState.blockId, block => {
        if (!block.layout) return block;
        const nextLayout = dragState.mode === 'move'
          ? {
              ...block.layout,
              x: Math.max(16, Math.min(EXPORT_PAGE_WIDTH - block.layout.width - 16, dragState.startLayout.x + dx)),
              y: Math.max(16, Math.min(EXPORT_PAGE_HEIGHT - block.layout.height - 16, dragState.startLayout.y + dy)),
            }
          : {
              ...block.layout,
              width: Math.max(120, Math.min(EXPORT_PAGE_WIDTH - block.layout.x - 16, dragState.startLayout.width + dx)),
              height: Math.max(60, Math.min(EXPORT_PAGE_HEIGHT - block.layout.y - 16, dragState.startLayout.height + dy)),
            };
        return { ...block, layout: nextLayout };
      }));
    };
    const onUp = () => setDragState(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragState]);

  const updateDraftTitle = (title: string) => setDraft(prev => ({ ...prev, title }));

  const updateChapterTitle = (chapterId: string, title: string) => setDraft(prev => rebuildDraftPages({
    ...prev,
    chapters: prev.chapters.map(chapter => chapter.id === chapterId ? { ...chapter, title } : chapter),
  }));

  const updateSectionTitle = (sectionId: string, title: string) => setDraft(prev => rebuildDraftPages({
    ...prev,
    chapters: prev.chapters.map(chapter => ({
      ...chapter,
      sections: chapter.sections.map(section => section.id === sectionId ? { ...section, title } : section),
    })),
  }));

  const reorderChapter = (chapterId: string, direction: -1 | 1) => setDraft(prev => {
    const chapters = [...prev.chapters];
    const index = chapters.findIndex(chapter => chapter.id === chapterId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= chapters.length) return prev;
    [chapters[index], chapters[target]] = [chapters[target], chapters[index]];
    return rebuildDraftPages({ ...prev, chapters });
  });

  const reorderSection = (chapterId: string, sectionId: string, direction: -1 | 1) => setDraft(prev => {
    const chapters = prev.chapters.map(chapter => {
      if (chapter.id !== chapterId) return chapter;
      const sections = [...chapter.sections];
      const index = sections.findIndex(section => section.id === sectionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sections.length) return chapter;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...chapter, sections };
    });
    return rebuildDraftPages({ ...prev, chapters });
  });

  const updateSelectedBlock = (updater: (block: ExportBlock) => ExportBlock, options?: { reflow?: boolean }) => {
    if (!selectedBlockId) return;
    setDraft(prev => {
      const updated = updateBlocksEverywhere(prev, selectedBlockId, updater);
      return options?.reflow && selectedBlock?.type !== 'heading' ? rebuildDraftPages(updated) : updated;
    });
  };

  const handleExport = async () => {
    try {
      setExportError(null);
      setIsExporting(true);
      const bytes = await renderExportDraftToPdf(draft);
      const name = exportDraftFileName(draft);
      window.dispatchEvent(new CustomEvent('brainstorm:pdf-rendered', {
        detail: { name, byteLength: bytes.byteLength },
      }));
      downloadPdfBytes(bytes, name);
      onExported?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF export failed.';
      setExportError(message);
      console.error('PDF export failed', err);
      window.dispatchEvent(new CustomEvent('brainstorm:pdf-export-failed', {
        detail: { message },
      }));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex"
      data-testid="pdf-preview-editor"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <aside className="w-[320px] bg-white border-r border-slate-200 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold text-slate-900">PDF Draft</div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded" aria-label="Close PDF preview">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-200">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Session title</label>
          <input
            value={draft.title}
            onChange={(e) => updateDraftTitle(e.target.value)}
            className="mt-2 w-full border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {draft.chapters.map((chapter, chapterIndex) => (
            <div key={chapter.id} className="border border-slate-200 rounded bg-white">
              <div className="p-2 border-b border-slate-100 flex items-center gap-1">
                <span className="text-xs font-semibold text-slate-400 w-5">{chapterIndex + 1}</span>
                <input
                  value={chapter.title}
                  onChange={(e) => updateChapterTitle(chapter.id, e.target.value)}
                  className="min-w-0 flex-1 text-sm font-semibold outline-none"
                />
                <button onClick={() => reorderChapter(chapter.id, -1)} className="px-1.5 py-1 text-xs hover:bg-slate-100 rounded">Up</button>
                <button onClick={() => reorderChapter(chapter.id, 1)} className="px-1.5 py-1 text-xs hover:bg-slate-100 rounded">Down</button>
              </div>
              <div className="p-2 space-y-2">
                {chapter.sections.map((section, sectionIndex) => (
                  <div key={section.id} className="pl-3 border-l border-slate-200">
                    <div className="flex items-center gap-1">
                      <input
                        value={section.title}
                        onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                        className="min-w-0 flex-1 text-xs text-slate-700 outline-none"
                      />
                      <button onClick={() => reorderSection(chapter.id, section.id, -1)} className="px-1 py-0.5 text-[10px] hover:bg-slate-100 rounded">Up</button>
                      <button onClick={() => reorderSection(chapter.id, section.id, 1)} className="px-1 py-0.5 text-[10px] hover:bg-slate-100 rounded">Down</button>
                    </div>
                    <div className="text-[10px] text-slate-400">{section.cards.length} cards | section {sectionIndex + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-100">
        <div className="sticky top-0 z-10 h-14 bg-white/90 backdrop-blur border-b border-slate-200 px-5 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-900">Preview editor</div>
            <div className="text-xs text-slate-500">Drag blocks on the page. Use the right panel for text and typography.</div>
          </div>
          <div className="flex items-center gap-2">
            {exportError && (
              <div className="text-xs text-red-600 max-w-[260px] truncate" title={exportError}>
                {exportError}
              </div>
            )}
            <button
              onClick={() => setDraft(prev => rebuildDraftPages(prev))}
              className="px-3 py-2 text-sm border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" /> Reflow
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-3 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
              data-testid="export-final-pdf"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>

        <div className="py-8 flex flex-col items-center gap-8">
          {draft.pages.map((page, pageIndex) => (
            <section
              key={page.id}
              className="bg-white shadow-xl border border-slate-200 relative"
              style={{ width: PAGE_DISPLAY_W, height: PAGE_DISPLAY_H }}
              onClick={() => setSelectedBlockId(null)}
              data-page-id={page.id}
              data-testid={`pdf-page-${pageIndex + 1}`}
            >
              <div className="absolute -top-6 left-0 text-xs text-slate-500">{pageIndex + 1}. {page.title || 'Page'}</div>
              {page.blocks.map(block => (
                <BlockPreview
                  key={block.id}
                  block={block}
                  selected={selectedBlockId === block.id}
                  onSelect={() => setSelectedBlockId(block.id)}
                  onPointerDown={(e, mode) => {
                    if (!block.layout) return;
                    e.stopPropagation();
                    setSelectedBlockId(block.id);
                    setDragState({
                      blockId: block.id,
                      mode,
                      startX: e.clientX,
                      startY: e.clientY,
                      startLayout: block.layout,
                    });
                  }}
                />
              ))}
            </section>
          ))}
        </div>
      </main>

      <aside className="w-[340px] bg-white border-l border-slate-200 flex flex-col">
        <div className="h-14 px-4 border-b border-slate-200 flex items-center gap-2">
          <Type className="w-4 h-4 text-indigo-600" />
          <div className="font-semibold text-slate-900">Block controls</div>
        </div>
        {selectedBlock ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Title</label>
              <input
                value={selectedBlock.title || ''}
                onChange={(e) => {
                  const title = e.target.value;
                  if (selectedBlock.id.startsWith('chapter-heading-')) {
                    updateChapterTitle(selectedBlock.id.replace('chapter-heading-', ''), title);
                  } else if (selectedBlock.id.startsWith('section-heading-')) {
                    updateSectionTitle(selectedBlock.id.replace('section-heading-', ''), title);
                  } else {
                    updateSelectedBlock(block => ({ ...block, title }), { reflow: true });
                  }
                }}
                className="mt-2 w-full border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {(selectedBlock.type === 'text' || selectedBlock.type === 'code' || selectedBlock.type === 'link') && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Content</label>
                <textarea
                  value={selectedBlock.content || ''}
                  onChange={(e) => updateSelectedBlock(block => ({ ...block, content: e.target.value }), { reflow: true })}
                  className="mt-2 w-full min-h-[180px] border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            {selectedBlock.type === 'pdf' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Extracted PDF text</label>
                <textarea
                  value={selectedBlock.extractedText || ''}
                  onChange={(e) => updateSelectedBlock(block => ({ ...block, extractedText: e.target.value }), { reflow: true })}
                  className="mt-2 w-full min-h-[180px] border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!selectedBlock.appendOriginalPages}
                    onChange={(e) => updateSelectedBlock(block => ({ ...block, appendOriginalPages: e.target.checked }))}
                  />
                  Append original PDF pages
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Font
                <select
                  value={selectedBlock.style.fontFamily}
                  onChange={(e) => updateSelectedBlock(block => ({ ...block, style: { ...block.style, fontFamily: e.target.value as ExportBlock['style']['fontFamily'] } }), { reflow: true })}
                  className="mt-2 w-full border border-slate-200 rounded px-2 py-2 text-sm normal-case outline-none"
                >
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Size
                <input
                  type="number"
                  min={7}
                  max={36}
                  value={selectedBlock.style.fontSize}
                  onChange={(e) => updateSelectedBlock(block => ({ ...block, style: { ...block.style, fontSize: Number(e.target.value) || block.style.fontSize } }), { reflow: true })}
                  className="mt-2 w-full border border-slate-200 rounded px-2 py-2 text-sm normal-case outline-none"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSelectedBlock(block => ({ ...block, style: { ...block.style, bold: !block.style.bold } }))}
                className={`p-2 border rounded ${selectedBlock.style.bold ? 'bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateSelectedBlock(block => ({ ...block, style: { ...block.style, italic: !block.style.italic } }))}
                className={`p-2 border rounded ${selectedBlock.style.italic ? 'bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Italic className="w-4 h-4" />
              </button>
              {(['left', 'center', 'right'] as const).map(align => (
                <button
                  key={align}
                  onClick={() => updateSelectedBlock(block => ({ ...block, style: { ...block.style, align } }))}
                  className={`p-2 border rounded ${selectedBlock.style.align === align ? 'bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  {align === 'left' && <AlignLeft className="w-4 h-4" />}
                  {align === 'center' && <AlignCenter className="w-4 h-4" />}
                  {align === 'right' && <AlignRight className="w-4 h-4" />}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Move block to section</label>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value || !selectedBlockId) return;
                  setDraft(prev => moveBlockToSection(prev, selectedBlockId, e.target.value));
                  e.target.value = '';
                }}
                className="mt-2 w-full border border-slate-200 rounded px-2 py-2 text-sm outline-none"
              >
                <option value="">Choose section...</option>
                {draft.chapters.flatMap(chapter => chapter.sections.map(section => (
                  <option key={section.id} value={section.id}>{chapter.title} / {section.title}</option>
                )))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 px-8">
            <Type className="w-8 h-8 mb-3" />
            <p className="text-sm">Select a block on the page to edit text, font, size, alignment, or layout.</p>
          </div>
        )}
      </aside>
    </div>
  );
};
