import React, { useState, useEffect } from 'react';
import { ArrowLeft, Puzzle, Scissors, Image as ImageIcon } from 'lucide-react';
import { ShardsConfig, UserProfile } from '../types';

interface ShardsPageProps {
  onBack: () => void;
}

export const ShardsPage: React.FC<ShardsPageProps> = ({ onBack }) => {
  const [config, setConfig] = useState<ShardsConfig>(() => {
    const saved = localStorage.getItem('brainstorm_shards_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default
      }
    }
    return {
      textClipper: false,
      screenshotClipper: false
    };
  });

  useEffect(() => {
    localStorage.setItem('brainstorm_shards_config', JSON.stringify(config));
    
    // Also notify Electron backend if needed, so it knows whether to process shortcuts
    // Because this is a frontend-rendered app, we could always process them 
    // conditionally on the frontend, but saving it to local storage allows the 
    // root App component to handle the logic. 
  }, [config]);

  const toggleShard = (key: keyof ShardsConfig) => {
    setConfig(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50 flex items-center px-6 shadow-sm">
        <button
          onClick={onBack}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors mr-4"
          title="Go Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <span className="text-xl font-bold text-gray-900 leading-none">Shards</span>
          <span className="text-xs text-gray-500 mt-1">Extensions & Integrations</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pt-24 pb-12 px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <Puzzle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Installed Shards</h2>
                <p className="text-gray-500">Enable or disable OS-level extensions for your workflow.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Text Clipper Shard */}
              <div className={`p-6 rounded-xl border transition-all duration-200 ${config.textClipper ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.textClipper ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Scissors className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Text Clipper</h3>
                      <p className="text-xs text-gray-500">Shortcut: Cmd/Ctrl + Shift + C</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.textClipper} onChange={() => toggleShard('textClipper')} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Highlight text anywhere on your computer, copy it, and then press the shortcut to instantly send it to your active session as a new text card.
                </p>
              </div>

              {/* Screenshot Clipper Shard */}
              <div className={`p-6 rounded-xl border transition-all duration-200 ${config.screenshotClipper ? 'border-emerald-400 bg-emerald-50/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.screenshotClipper ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Screenshot Clipper</h3>
                      <p className="text-xs text-gray-500">Shortcut: Cmd/Ctrl + Shift + S</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.screenshotClipper} onChange={() => toggleShard('screenshotClipper')} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <p className="text-sm text-gray-600">
                  Take a screenshot to your clipboard using your OS native tool, then press the shortcut to instantly send it to your active session as an image card.
                </p>
              </div>

            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};
