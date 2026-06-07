import React, { useState } from 'react';
import {
  MousePointerClick, Link2, Sparkles, Pen, FileDown, X,
  FolderOpen, ChevronRight, ChevronLeft,
} from 'lucide-react';

interface Step {
  icon: React.ReactNode;
  title: string;
  body: string;
  hint?: string;
}

const STEPS: Step[] = [
  {
    icon: <MousePointerClick className="w-8 h-8 text-blue-500" />,
    title: 'Create idea cards',
    body: 'Double-click anywhere on the dark canvas to drop a card. Right-click for a context menu. Click the + button in the sidebar anytime.',
    hint: 'Try it after this tour — the canvas is live.',
  },
  {
    icon: <Link2 className="w-8 h-8 text-emerald-500" />,
    title: 'Connect your ideas',
    body: 'Hover over any card edge to reveal a blue connection dot. Drag it to another card to link them. Connections let the AI understand relationships between ideas.',
  },
  {
    icon: <Sparkles className="w-8 h-8 text-violet-500" />,
    title: 'AI that reads your canvas',
    body: 'The AI chat reads every card title, content, and connection on the board. Ask it to brainstorm, reorganise, rename, connect, or add cards — it acts directly on the canvas.',
    hint: 'Click the chat icon in the top right to open it.',
  },
  {
    icon: <Pen className="w-8 h-8 text-orange-500" />,
    title: 'Draw and annotate',
    body: 'Open the left sidebar to switch to drawing mode. Sketch freely, highlight connections, or annotate any part of the canvas. Use the eraser to clean up.',
  },
  {
    icon: <FolderOpen className="w-8 h-8 text-yellow-500" />,
    title: 'Documents and files',
    body: 'Double-click a card to open the full document editor — write long-form notes, lists, and formatted content. Drop images or PDFs directly onto the canvas to attach them as cards.',
  },
  {
    icon: <FileDown className="w-8 h-8 text-rose-500" />,
    title: 'Export as PDF',
    body: 'Click "Export PDF" in the header to generate a structured document from your entire session — organised by clusters, with a cover page, table of contents, and page numbers.',
    hint: 'Great for turning a brainstorm into a shareable report.',
  },
];

interface Props {
  onDone: () => void;
}

export const OnboardingOverlay: React.FC<Props> = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7 relative animate-in fade-in zoom-in-95 duration-200">
        {/* Skip */}
        <button
          type="button"
          onClick={onDone}
          aria-label="Skip tour"
          className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="flex gap-1 mb-7">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                i <= step ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center shadow-sm">
            {current.icon}
          </div>
        </div>

        {/* Text */}
        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">
          {current.title}
        </h2>
        <p className="text-gray-500 text-sm text-center leading-relaxed">
          {current.body}
        </p>
        {current.hint && (
          <p className="text-blue-400 text-xs text-center mt-2 font-medium">
            {current.hint}
          </p>
        )}

        {/* Step label */}
        <p className="text-gray-300 text-xs text-center mt-5">
          {step + 1} of {STEPS.length}
        </p>

        {/* Navigation */}
        <div className="flex items-center gap-2 mt-4">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? onDone : () => setStep(s => s + 1)}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
          >
            {isLast ? 'Start building' : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {isFirst && (
          <button
            type="button"
            onClick={onDone}
            className="w-full text-center text-xs text-gray-300 hover:text-gray-500 mt-3 transition-colors"
          >
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
};
