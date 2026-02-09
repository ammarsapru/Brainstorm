import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Plus, FilePlus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { FileSystemItem } from '../types';

interface FileSystemProps {
  items: FileSystemItem[];
  level?: number;
  onToggleFolder: (id: string) => void;
  onOpenFile: (item: FileSystemItem) => void;
  onCreateFile: (parentId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onRename?: (id: string, newName: string) => void;
  onDelete?: (id: string) => void;
}

export const FileSystem: React.FC<FileSystemProps> = ({
  items,
  level = 0,
  onToggleFolder,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete
}) => {

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDragStart = (e: React.DragEvent, item: FileSystemItem) => {
    if (item.type === 'file') {
      e.dataTransfer.setData('application/react-dnd-doc-id', item.id);
      e.dataTransfer.effectAllowed = 'copy';
    }
  };

  const startRenaming = (item: FileSystemItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setMenuOpenId(null);
  };

  const submitRename = () => {
    if (editingId && onRename && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submitRename();
    if (e.key === 'Escape') setEditingId(null);
  };

  return (
    <div className="flex flex-col select-none">
      {items.map(item => (
        <div key={item.id} className="relative">
          <div
            className={`flex items-center gap-1 py-1 px-2 rounded-md hover:bg-gray-100 cursor-pointer group transition-colors relative`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={(e) => {
              // If clicking anywhere on the row, we toggle folder or open file
              // BUT if menu was open, we might want to just close menu? 
              // For now, let's keep standard behavior but allow the menu button to override.
              e.stopPropagation();
              if (menuOpenId === item.id) {
                setMenuOpenId(null);
                return;
              }

              if (menuOpenId) {
                setMenuOpenId(null);
              }

              if (item.type === 'folder') {
                onToggleFolder(item.id);
              } else {
                onOpenFile(item);
              }
            }}
            draggable={item.type === 'file'}
            onDragStart={(e) => handleDragStart(e, item)}
          >
            {/* Folder Arrow */}
            {item.type === 'folder' && (
              <span className="text-gray-400 shrink-0">
                {item.isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </span>
            )}

            {/* Icon */}
            {item.type === 'folder' ? (
              item.isOpen ? <FolderOpen className="w-4 h-4 text-black shrink-0" /> : <Folder className="w-4 h-4 text-black shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-gray-500 shrink-0" />
            )}

            {/* Name or Edit Input */}
            {editingId === item.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="text-sm text-gray-700 flex-1 min-w-0 bg-white border border-blue-500 rounded px-1 outline-none ml-1"
              />
            ) : (
              <span className="text-sm text-gray-700 truncate flex-1 pr-12">{item.name}</span>
            )}

            {/* Menu Trigger (3 dots) - Replaces the old hover actions or sits alongside them */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === item.id ? null : item.id);
              }}
              className={`p-1 rounded-md text-gray-400 hover:text-black hover:bg-white/80 transition-opacity ${menuOpenId === item.id ? 'opacity-100 bg-white shadow-sm' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {/* Original Hover Actions for Folder (New File/Folder) - Only show if menu not open */}
            {item.type === 'folder' && !menuOpenId && (
              <div className="absolute right-8 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-gray-100/80 backdrop-blur-sm rounded px-1 transition-opacity z-10">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCreateFile(item.id);
                  }}
                  className="p-1 hover:bg-white rounded text-gray-500 hover:text-black cursor-pointer"
                  title="New File"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCreateFolder(item.id);
                  }}
                  className="p-1 hover:bg-white rounded text-gray-500 hover:text-black cursor-pointer"
                  title="New Folder"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Context Menu Popover */}
          {menuOpenId === item.id && (
            <div
              ref={menuRef}
              className="absolute right-0 top-8 z-50 bg-white rounded-lg shadow-xl border border-gray-100 py-1 w-32 animate-in fade-in zoom-in duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => startRenaming(item)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Pencil className="w-3 h-3" /> Rename
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this item?')) {
                    onDelete?.(item.id);
                  }
                  setMenuOpenId(null);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
              {item.type === 'folder' && (
                <>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <button
                    onClick={() => { onCreateFile(item.id); setMenuOpenId(null); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <FilePlus className="w-3 h-3" /> New File
                  </button>
                  <button
                    onClick={() => { onCreateFolder(item.id); setMenuOpenId(null); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3" /> New Folder
                  </button>
                </>
              )}
            </div>
          )}

          {/* Recursive Children */}
          {item.type === 'folder' && item.isOpen && item.children && (
            <FileSystem
              items={item.children}
              level={level + 1}
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          )}
        </div>
      ))}
    </div>
  );
};