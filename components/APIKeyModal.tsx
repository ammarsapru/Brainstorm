import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Key, AlertCircle } from 'lucide-react';

export interface APIKeys {
  openai: string;
  anthropic: string;
  gemini: string;
}

interface APIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: APIKeys) => void;
  currentKeys: APIKeys;
}

export const APIKeyModal: React.FC<APIKeyModalProps> = ({ isOpen, onClose, onSave, currentKeys }) => {
  const [keys, setKeys] = useState<APIKeys>(currentKeys);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setKeys(currentKeys);
  }, [currentKeys, isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(keys);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">API Providers</h2>
              <p className="text-[10px] text-gray-500 font-medium">Bring Your Own Key (BYOK)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5">
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-5 flex gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 leading-relaxed">
              Keys are stored securely in your browser's local storage and are never sent to our servers. They are injected directly into your requests.
            </p>
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>Google Gemini API Key</span>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Get Key</a>
              </label>
              <input 
                type="password"
                placeholder="AIzaSy..."
                value={keys.gemini}
                onChange={e => setKeys(prev => ({ ...prev, gemini: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>OpenAI API Key <span className="text-gray-400 font-normal ml-1">(Optional)</span></span>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Get Key</a>
              </label>
              <input 
                type="password"
                placeholder="sk-..."
                value={keys.openai}
                onChange={e => setKeys(prev => ({ ...prev, openai: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>Anthropic API Key <span className="text-gray-400 font-normal ml-1">(Optional)</span></span>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline">Get Key</a>
              </label>
              <input 
                type="password"
                placeholder="sk-ant-..."
                value={keys.anthropic}
                onChange={e => setKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 font-mono text-xs"
              />
            </div>
          </div>

          <div className="mt-8">
            <button 
              type="submit"
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isSaved ? 'bg-green-500 text-white shadow-green-500/25' : 'bg-black text-white hover:bg-gray-800 hover:shadow-lg hover:shadow-black/10'
              }`}
            >
              {isSaved ? (
                <>Saved Successfully!</>
              ) : (
                <><Save className="w-4 h-4" /> Save Configuration</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
