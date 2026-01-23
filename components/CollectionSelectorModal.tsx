import React from 'react';
import { Collection } from '../types';
import { Layers, X } from 'lucide-react';

interface CollectionSelectorModalProps {
  isOpen: boolean;
  collections: Collection[];
  onSelect: (collectionId: string) => void;
  onCancel: () => void;
}

export const CollectionSelectorModal: React.FC<CollectionSelectorModalProps> = ({
  isOpen,
  collections,
  onSelect,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-80 bg-white rounded-xl shadow-2xl border border-gray-100 p-6 scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-zinc-100 text-black">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              Select Collection
            </h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Please choose which collection this new card belongs to:
        </p>

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => onSelect(col.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-black hover:bg-zinc-50 transition-all text-sm font-medium text-gray-700 hover:text-black"
            >
              {col.name}
            </button>
          ))}
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
            <button 
                onClick={onCancel}
                className="text-xs text-gray-400 hover:text-gray-600"
            >
                Cancel
            </button>
        </div>
      </div>
    </div>
  );
};