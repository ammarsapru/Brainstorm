import React, { useRef, useState, useMemo } from 'react';
import { Plus, Move, MousePointer2, Image as ImageIcon, FileText, ChevronLeft, ChevronRight, FolderPlus, FilePlus, Sparkles, ChevronDown, ChevronUp, StickyNote, Folder, PlusCircle } from 'lucide-react';
import { ToolMode, FileSystemItem, IdeaCard, Connection, Collection } from '../types';
import { FileSystem } from './FileSystem';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  mode: ToolMode;
  setMode: (m: ToolMode) => void;
  onAddCard: () => void;
  onUploadImage: (file: File) => void;
  onUploadDoc: (file: File) => void;
  onGenerateSummary: () => void;
  fileSystem: FileSystemItem[];
  cards: IdeaCard[];
  connections?: Connection[];
  collections: Collection[];
  onToggleFolder: (id: string) => void;
  onOpenFile: (item: FileSystemItem) => void;
  onOpenCard: (card: IdeaCard) => void;
  onCreateFile: (parentId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onCreateCollection: () => void;
  onMoveCardToCollection: (cardId: string, collectionId: string) => void;
  isGeneratingSummary?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  setIsOpen,
  mode,
  setMode,
  onAddCard,
  onUploadImage,
  onUploadDoc,
  onGenerateSummary,
  fileSystem,
  cards,
  connections = [],
  collections,
  onToggleFolder,
  onOpenFile,
  onOpenCard,
  onCreateFile,
  onCreateFolder,
  onCreateCollection,
  onMoveCardToCollection,
  isGeneratingSummary
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [isFilesExpanded, setIsFilesExpanded] = useState(true);
  const [isCardsExpanded, setIsCardsExpanded] = useState(true);

  // State for expanded card groups (now Collections)
  const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const toggleCollection = (colId: string) => {
    setExpandedCollections(prev => ({ ...prev, [colId]: !prev[colId] }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
    }
    e.target.value = ''; // Reset
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadDoc(e.target.files[0]);
    }
    e.target.value = ''; // Reset
  };

  // Drag and Drop Logic for Cards
  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('application/brainstorm-card-id', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Ensure we aren't just entering a child element
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverColId(null);
  };

  const handleDrop = (e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColId(null);

    const cardId = e.dataTransfer.getData('application/brainstorm-card-id');
    if (cardId) {
      onMoveCardToCollection(cardId, collectionId);
    }
  };

  return (
    <>
      {/* Floating Toggle Button (Visible when closed) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-6 top-24 z-40 p-2 bg-white rounded-lg shadow-md border border-gray-100 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar Container */}
      <div
        onWheel={(e) => e.stopPropagation()}
        className={`fixed left-4 top-20 bottom-8 w-72 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border-4 transition-all duration-300 ease-in-out z-50 flex flex-col group ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'
          } ${'border-transparent hover:border-emerald-500 shadow-emerald-500/0 hover:shadow-emerald-500/10'
          }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <span className="font-semibold text-gray-700">Tools</span>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 no-scrollbar">

          {/* Canvas Tools */}
          <div className="shrink-0">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Canvas</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setMode('select')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${mode === 'select' ? 'bg-zinc-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <MousePointer2 className="w-4 h-4" />
                Select / Move
              </button>
              <button
                onClick={() => setMode('pan')}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${mode === 'pan' ? 'bg-zinc-100 text-black' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Move className="w-4 h-4" />
                Pan Canvas
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Actions</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={onAddCard}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 text-black" />
                New Card
              </button>

              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <ImageIcon className="w-4 h-4 text-purple-500" />
                Upload Image
              </button>
              <input
                type="file"
                ref={imageInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />

              <button
                onClick={() => docInputRef.current?.click()}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <FileText className="w-4 h-4 text-orange-500" />
                Upload File
              </button>
              <input
                type="file"
                ref={docInputRef}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleDocUpload}
              />

              <div className="h-px bg-gray-100 my-1"></div>

              <button
                onClick={onGenerateSummary}
                disabled={isGeneratingSummary}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${isGeneratingSummary ? 'bg-amber-50 text-amber-600' : 'text-gray-700 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100'
                  }`}
              >
                {isGeneratingSummary ? (
                  <span className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-600" />
                )}
                {isGeneratingSummary ? 'Generating...' : 'AI Summary Report'}
              </button>
            </div>
          </div>

          {/* Documents File System */}
          <div className="flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setIsFilesExpanded(!isFilesExpanded)}
                className="flex items-center gap-2 group text-left"
              >
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">Files</div>
                {isFilesExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
              </button>

              {/* Root Level Creation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateFile(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-black transition-colors"
                  title="New File (Root)"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateFolder(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-black transition-colors"
                  title="New Folder (Root)"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {isFilesExpanded && (
              <div className="bg-white rounded-lg border border-gray-100 p-1 shadow-inner flex flex-col mb-4 animate-in slide-in-from-top-2 duration-200">
                <div className="overflow-visible">
                  <FileSystem
                    items={fileSystem}
                    onToggleFolder={onToggleFolder}
                    onOpenFile={onOpenFile}
                    onCreateFile={onCreateFile}
                    onCreateFolder={onCreateFolder}
                  />
                  {fileSystem.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400">
                      No files yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cards / Collections Section */}
          <div className="flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setIsCardsExpanded(!isCardsExpanded)}
                className="flex items-center gap-2 group text-left"
              >
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider group-hover:text-gray-600 transition-colors">Collections</div>
                {isCardsExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateCollection();
                }}
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-black transition-colors"
                title="New Collection"
              >
                <PlusCircle className="w-3.5 h-3.5" />
              </button>
            </div>

            {isCardsExpanded && (
              <div className="bg-white rounded-lg border border-gray-100 p-1 shadow-inner flex flex-col animate-in slide-in-from-top-2 duration-200">
                <div className="overflow-y-auto max-h-[300px]">
                  {collections.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400">
                      No collections.
                    </div>
                  )}

                  {/* Render Collections */}
                  {collections.map(col => {
                    const collectionCards = cards.filter(c => c.collectionId === col.id || (!c.collectionId && col.id === 'default-collection'));
                    const isDragTarget = dragOverColId === col.id;

                    return (
                      <div
                        key={col.id}
                        className={`mb-1 transition-all rounded-lg border-2 ${isDragTarget
                            ? 'border-black bg-zinc-100'
                            : 'border-transparent'
                          }`}
                        onDragOver={(e) => handleDragOver(e, col.id)}
                        onDragLeave={(e) => handleDragLeave(e, col.id)}
                        onDrop={(e) => handleDrop(e, col.id)}
                      >
                        <button
                          onClick={() => toggleCollection(col.id)}
                          className={`flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-gray-50 rounded text-xs font-medium text-gray-600 ${expandedCollections[col.id] ? 'bg-gray-50' : ''}`}
                        >
                          {expandedCollections[col.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <Folder className={`w-3.5 h-3.5 ${isDragTarget ? 'text-black' : 'text-zinc-400'}`} />
                          <span className="truncate flex-1">{col.name}</span>
                          <span className="text-gray-400 text-[10px]">{collectionCards.length}</span>
                        </button>

                        {expandedCollections[col.id] && (
                          <div className="pl-4 border-l border-gray-100 ml-3 mt-1 space-y-0.5">
                            {collectionCards.map(card => (
                              <div
                                key={card.id}
                                onClick={() => onOpenCard(card)}
                                draggable
                                onDragStart={(e) => handleDragStart(e, card.id)}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-100 cursor-pointer group transition-colors select-none"
                              >
                                <StickyNote className={`w-3 h-3 ${card.image ? 'text-purple-400' : 'text-yellow-500'}`} />
                                <span className="text-sm text-gray-700 truncate flex-1">{card.text || card.fileName || 'Untitled Card'}</span>
                              </div>
                            ))}
                            {collectionCards.length === 0 && (
                              <div className="text-[10px] text-gray-400 italic px-2 py-1">Empty collection</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer info */}
        <div className="mt-auto p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
          <p className="text-xs text-center text-gray-400">
            Brainstorm v2.1
          </p>
        </div>
      </div>
    </>
  );
};