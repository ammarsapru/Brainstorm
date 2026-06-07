import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Key, AlertCircle, Shield } from 'lucide-react';

export interface APIKeys {
  openai?: string;
  anthropic?: string;
  gemini: string;
}

interface APIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: APIKeys) => void | Promise<void>;
  currentKeys: APIKeys;
  variant?: 'settings' | 'ai-required';
  requiredProvider?: 'google' | 'openai' | 'anthropic';
}

export const APIKeyModal: React.FC<APIKeyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentKeys,
  variant = 'settings',
  requiredProvider,
}) => {
  const [keys, setKeys] = useState<APIKeys>(currentKeys);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setKeys(currentKeys);
  }, [currentKeys, isOpen]);

  if (!isOpen) return null;

  const title = variant === 'ai-required' ? 'API Key Required' : 'AI Providers';
  const subtitle = variant === 'ai-required'
    ? `Add your ${requiredProvider === 'openai' ? 'OpenAI' : requiredProvider === 'anthropic' ? 'Anthropic' : 'Google Gemini'} key to continue`
    : 'Bring Your Own Key (BYOK)';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(keys);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">{title}</h2>
              <p className="text-[10px] text-gray-500 font-medium">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5" autoComplete="off">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 flex gap-2">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              Keys are stored locally in your browser and never sent to Brainstorm servers — only directly to the AI provider you choose. They are obfuscated with AES-GCM to prevent passive extension scans, but are not protected against XSS attacks on this page.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Hashing cannot be used for API keys (hashes are one-way). Encryption allows secure local storage while still enabling requests.
            </p>
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>Google Gemini</span>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={keys.gemini || ''}
                onChange={e => setKeys(prev => ({ ...prev, gemini: e.target.value }))}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>OpenAI (ChatGPT)</span>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
              </label>
              <input
                type="password"
                placeholder="sk-..."
                value={keys.openai || ''}
                onChange={e => setKeys(prev => ({ ...prev, openai: e.target.value }))}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>Anthropic (Claude)</span>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
              </label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={keys.anthropic || ''}
                onChange={e => setKeys(prev => ({ ...prev, anthropic: e.target.value }))}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs"
              />
            </div>
          </div>

          <div className="mt-8">
            <button
              type="submit"
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isSaved ? 'bg-emerald-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700'
              }`}
            >
              {isSaved ? <>Saved securely</> : <><Save className="w-4 h-4" /> Save keys</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
