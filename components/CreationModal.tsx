import React, { useState, useEffect, useRef } from 'react';
import { FolderPlus, FileText, X, Layout } from 'lucide-react';

interface CreationModalProps {
  isOpen: boolean;
  type: 'file' | 'folder' | 'session';
  initialValue?: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}

export const CreationModal: React.FC<CreationModalProps> = ({
  isOpen,
  type,
  initialValue,
  onClose,
  onConfirm
}) => {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialValue) {
        setName(initialValue);
      } else {
        if (type === 'folder') setName('New Folder');
        else if (type === 'file') setName('Untitled Note');
        else setName('Untitled Session');
      }
      // Small timeout to ensure render before focus
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, type, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim());
      onClose();
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'folder': return <FolderPlus className="w-5 h-5" />;
      case 'file': return <FileText className="w-5 h-5" />;
      case 'session': return <Layout className="w-5 h-5" />;
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'folder': return 'bg-zinc-100 text-black';
      case 'file': return 'bg-orange-100 text-orange-600';
      case 'session': return 'bg-zinc-100 text-black';
    }
  };

  const getTitle = () => {
    if (initialValue) return `Rename ${type === 'session' ? 'Session' : type}`;
    return `Create ${type === 'folder' ? 'Folder' : type === 'file' ? 'File' : 'Session'}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-96 bg-white rounded-xl shadow-2xl border border-gray-100 p-6 scale-100 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${getColorClass()}`}>
              {getIcon()}
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              {getTitle()}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border-2 border-black rounded-lg bg-white text-black font-medium focus:outline-none focus:ring-0 placeholder-gray-500"
              placeholder={`Enter name...`}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-bold text-white bg-black hover:bg-gray-800 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {initialValue ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};