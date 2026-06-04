import React from 'react';
import { X, Folder } from 'lucide-react';
import { FileSystemItem } from '../types';

interface FolderSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string) => void;
  fileSystem: FileSystemItem[];
}

export const FolderSelectorModal: React.FC<FolderSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  fileSystem
}) => {
  if (!isOpen) return null;

  const renderFolders = (items: FileSystemItem[], level = 0) => {
    return items.map(item => {
      if (item.type !== 'folder') return null;
      return (
        <React.Fragment key={item.id}>
          <button
            onClick={() => onSelect(item.id)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-md transition-colors"
            style={{ paddingLeft: `${12 + level * 16}px` }}
          >
            <Folder className="w-4 h-4 text-gray-400" />
            <span className="truncate">{item.name}</span>
          </button>
          {item.children && renderFolders(item.children, level + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" onPointerDown={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Move to Folder</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-2 max-h-[300px] overflow-y-auto">
           {renderFolders(fileSystem)}
           {fileSystem.filter(i => i.type === 'folder').length === 0 && (
             <div className="p-4 text-center text-sm text-gray-500">
               No folders available.
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
