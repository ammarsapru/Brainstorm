import React from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Plus, FilePlus } from 'lucide-react';
import { FileSystemItem } from '../types';

interface FileSystemProps {
  items: FileSystemItem[];
  level?: number;
  onToggleFolder: (id: string) => void;
  onOpenFile: (item: FileSystemItem) => void;
  onCreateFile: (parentId: string) => void;
  onCreateFolder: (parentId: string) => void;
}

export const FileSystem: React.FC<FileSystemProps> = ({ 
  items, 
  level = 0,
  onToggleFolder,
  onOpenFile,
  onCreateFile,
  onCreateFolder
}) => {
  
  const handleDragStart = (e: React.DragEvent, item: FileSystemItem) => {
    if (item.type === 'file') {
      e.dataTransfer.setData('application/react-dnd-doc-id', item.id);
      e.dataTransfer.effectAllowed = 'copy';
    }
  };

  return (
    <div className="flex flex-col select-none">
      {items.map(item => (
        <div key={item.id}>
          <div 
            className={`flex items-center gap-1 py-1 px-2 rounded-md hover:bg-gray-100 cursor-pointer group transition-colors relative`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={(e) => {
              // Main row click handler
              e.stopPropagation();
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

            {/* Name */}
            <span className="text-sm text-gray-700 truncate flex-1 pr-12">{item.name}</span>

            {/* Folder Actions (Visible on Hover) - Explicitly preventing propagation */}
            {item.type === 'folder' && (
              <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-gray-100/80 backdrop-blur-sm rounded px-1 transition-opacity z-10">
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

          {/* Recursive Children */}
          {item.type === 'folder' && item.isOpen && item.children && (
            <FileSystem 
              items={item.children} 
              level={level + 1} 
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
            />
          )}
        </div>
      ))}
    </div>
  );
};