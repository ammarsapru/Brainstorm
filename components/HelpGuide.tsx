
import React, { useState } from 'react';
import { Info } from 'lucide-react';

export const HelpGuide: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="fixed right-4 top-20 z-50 flex flex-col items-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Floating Button */}
      <button 
        className="w-10 h-10 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black hover:border-gray-300 transition-all duration-200"
        aria-label="Help Guide"
      >
        <Info className="w-5 h-5" />
      </button>

      {/* Hover Card */}
      <div 
        className={`absolute top-12 right-0 w-80 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 transition-all duration-200 origin-top-right overflow-hidden ${
          isHovered 
            ? 'opacity-100 scale-100 translate-y-0 visible' 
            : 'opacity-0 scale-95 -translate-y-2 invisible'
        }`}
      >
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-semibold text-gray-700 text-sm">Brainstorm Guide</h3>
        </div>
        <div className="p-5 overflow-y-auto max-h-[80vh] no-scrollbar">
          <ul className="space-y-3 text-sm text-gray-600">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Pan Canvas:</strong> Hold <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs text-gray-500 font-mono">Space</kbd> + Drag.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Create Cards:</strong> Use 'New Card' or double-click the canvas background.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Expand Card:</strong> Double-click a text card to open it in the document editor.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Connect:</strong> Drag from the bottom handle of a card to another.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Connection Styles:</strong>
                <br/><span className="text-xs text-gray-500 ml-1">↔ Equivalence: Arrowheads at both ends</span>
                <br/><span className="text-xs text-gray-500 ml-1">○→ Parent-Child: Circle at start, Arrow at end</span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>AI Ideas:</strong> Click the Sparkle icon on a card to generate sub-concepts.</span>
            </li>
             <li className="flex items-start gap-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-black shrink-0 shadow-sm" />
              <span><strong>Documents:</strong> Upload files in the sidebar. Drag them onto the canvas.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};