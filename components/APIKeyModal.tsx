import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Key, AlertCircle, Shield, CheckCircle, Loader } from 'lucide-react';
import { APIKeys } from '../types';

export type { APIKeys };

interface APIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: APIKeys) => void | Promise<void>;
  currentKeys: APIKeys;
  variant?: 'settings' | 'ai-required';
  requiredProvider?: 'google' | 'openai' | 'anthropic';
}

const KEY_PREFIXES: Record<keyof APIKeys, string> = {
  gemini: 'AIzaSy',
  openai: 'sk-',
  anthropic: 'sk-ant-',
};

const validateKey = (field: keyof APIKeys, value: string | undefined): string | undefined => {
  if (!value?.trim()) return undefined;
  if (!value.startsWith(KEY_PREFIXES[field])) {
    const labels: Record<keyof APIKeys, string> = { gemini: 'AIzaSy...', openai: 'sk-...', anthropic: 'sk-ant-...' };
    return `Key should start with "${labels[field]}"`;
  }
  return undefined;
};

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
  const [errors, setErrors] = useState<Partial<Record<keyof APIKeys, string>>>({});
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<Partial<Record<keyof APIKeys, boolean>>>({});

  useEffect(() => {
    setKeys(currentKeys);
    setErrors({});
    setVerified({});
  }, [currentKeys, isOpen]);

  const verifyKeys = async (keysToVerify: APIKeys) => {
    setVerifying(true);
    const results: Partial<Record<keyof APIKeys, boolean>> = {};
    await Promise.allSettled([
      keysToVerify.gemini?.trim() ? fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${keysToVerify.gemini.trim()}`
      ).then(r => { results.gemini = r.ok; }).catch(() => { results.gemini = false; }) : Promise.resolve(),

      keysToVerify.openai?.trim() ? fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${keysToVerify.openai.trim()}` },
      }).then(r => { results.openai = r.ok; }).catch(() => { results.openai = false; }) : Promise.resolve(),

      keysToVerify.anthropic?.trim() ? fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': keysToVerify.anthropic.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }).then(r => { results.anthropic = r.ok; }).catch(() => { results.anthropic = false; }) : Promise.resolve(),
    ]);
    setVerified(results);
    setVerifying(false);
  };

  if (!isOpen) return null;

  const title = variant === 'ai-required' ? 'API Key Required' : 'AI Providers';
  const subtitle = variant === 'ai-required'
    ? `Add your ${requiredProvider === 'openai' ? 'OpenAI' : requiredProvider === 'anthropic' ? 'Anthropic' : 'Google Gemini'} key to continue`
    : 'Bring Your Own Key (BYOK)';

  const handleFieldChange = (field: keyof APIKeys, value: string) => {
    setKeys(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: validateKey(field, value) }));
  };

  const handleSave = async () => {
    const newErrors: Partial<Record<keyof APIKeys, string>> = {};
    (Object.keys(keys) as Array<keyof APIKeys>).forEach(field => {
      const err = validateKey(field, keys[field]);
      if (err) newErrors[field] = err;
    });
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    await onSave(keys);
    setIsSaved(true);
    void verifyKeys(keys);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 2500);
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

        <div className="p-5" onClick={e => e.stopPropagation()}>
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
                <span className="flex gap-2">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
                  <span className="text-[10px] text-gray-300">|</span>
                  <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer" className="text-[10px] text-amber-500 hover:underline">Spending limits</a>
                </span>
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={keys.gemini || ''}
                onChange={e => handleFieldChange('gemini', e.target.value)}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className={`w-full px-3 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs ${errors.gemini ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors.gemini && <p className="text-[10px] text-red-500">{errors.gemini}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>OpenAI (ChatGPT)</span>
                <span className="flex gap-2">
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
                  <span className="text-[10px] text-gray-300">|</span>
                  <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer" className="text-[10px] text-amber-500 hover:underline">Spending limits</a>
                </span>
              </label>
              <input
                type="password"
                placeholder="sk-..."
                value={keys.openai || ''}
                onChange={e => handleFieldChange('openai', e.target.value)}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className={`w-full px-3 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs ${errors.openai ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors.openai && <p className="text-[10px] text-red-500">{errors.openai}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-700 flex justify-between items-center">
                <span>Anthropic (Claude)</span>
                <span className="flex gap-2">
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-[10px] text-violet-500 hover:underline">Get key</a>
                  <span className="text-[10px] text-gray-300">|</span>
                  <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer" className="text-[10px] text-amber-500 hover:underline">Spending limits</a>
                </span>
              </label>
              <input
                type="password"
                placeholder="sk-ant-..."
                value={keys.anthropic || ''}
                onChange={e => handleFieldChange('anthropic', e.target.value)}
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore
                className={`w-full px-3 py-2 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none font-mono text-xs ${errors.anthropic ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors.anthropic && <p className="text-[10px] text-red-500">{errors.anthropic}</p>}
            </div>
          </div>

          <div className="mt-8 space-y-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={verifying}
              className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isSaved ? 'bg-emerald-500 text-white' : 'bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60'
              }`}
            >
              {verifying ? <><Loader className="w-4 h-4 animate-spin" /> Verifying keys…</> :
               isSaved ? <>Saved securely</> : <><Save className="w-4 h-4" /> Save keys</>}
            </button>
            {Object.entries(verified).length > 0 && (
              <div className="flex flex-col gap-1">
                {(['gemini', 'openai', 'anthropic'] as Array<keyof APIKeys>).map(field => {
                  const status = verified[field];
                  if (status === undefined) return null;
                  const label = field === 'gemini' ? 'Gemini' : field === 'openai' ? 'OpenAI' : 'Anthropic';
                  return (
                    <div key={field} className={`flex items-center gap-1.5 text-xs font-medium ${status ? 'text-emerald-600' : 'text-red-500'}`}>
                      {status ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {label}: {status ? 'Key verified' : 'Invalid or expired key'}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
