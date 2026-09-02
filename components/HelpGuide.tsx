import React, { useState } from 'react';
import { Info } from 'lucide-react';

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono text-gray-600 shadow-sm">
    {children}
  </kbd>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
    <ul className="space-y-2">{children}</ul>
  </div>
);

const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className="mt-1 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
    <span className="text-xs text-gray-600 leading-relaxed">
      <strong className="text-gray-800">{label}:</strong> {children}
    </span>
  </li>
);

export const HelpGuide: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="fixed right-4 top-20 z-50 flex flex-col items-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        className="w-10 h-10 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-xl shadow-md border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-black hover:border-gray-300 transition-all duration-200"
        aria-label="Help Guide"
      >
        <Info className="w-5 h-5" />
      </button>

      <div
        className={`absolute top-12 right-0 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 transition-all duration-200 origin-top-right overflow-hidden ${
          isHovered
            ? 'opacity-100 scale-100 translate-y-0 visible'
            : 'opacity-0 scale-95 -translate-y-2 invisible'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <h3 className="font-semibold text-gray-800 text-sm">Quick Reference</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Hover any button for its tooltip</p>
        </div>

        <div className="p-4 overflow-y-auto max-h-[80vh] no-scrollbar">

          <Section title="Canvas">
            <Item label="Create card">Double-click any empty area, or right-click for a menu.</Item>
            <Item label="Pan">Drag the canvas background. Switch to Pan mode in the sidebar.</Item>
            <Item label="Zoom">Scroll wheel anywhere on the canvas.</Item>
            <Item label="Select">Click a card. <Kbd>Esc</Kbd> to deselect.</Item>
          </Section>

          <Section title="Cards">
            <Item label="Move">Drag the grip handle that appears at the top of a selected card.</Item>
            <Item label="Format">Select a card to reveal the toolbar above it — bold, italic, align, heading, font, and card color.</Item>
            <Item label="Card content">Click the expand icon in the card action bar (below the selected card) to open the rich-text editor for longer notes.</Item>
            <Item label="Connect">Click the arrow icon in the card action bar, then click a target card. Click a connection line to change its type (Equivalence ↔ or Parent-Child →).</Item>
            <Item label="Delete">Click the red trash icon in the card action bar.</Item>
          </Section>

          <Section title="AI">
            <Item label="AI Chat">Click the purple sparkle button (top right). The AI reads card titles, card content, files, and connections before each message.</Item>
            <Item label="Canvas actions">Ask the AI to create, update, connect, organize, or delete cards. Be specific: "group the React cards under the Vite card."</Item>
            <Item label="Brainstorm">Click the <strong>B</strong> button in a card's action bar. The AI generates 5–7 lateral ideas spanning different angles and places them as new cards.</Item>
            <Item label="Search">The AI can issue a semantic search across all cards to find relevant context before answering.</Item>
            <Item label="Switch models">Use the model picker in the AI Chat header to switch between Gemini 2.5 Flash, GPT-4o, and Claude 3.5 Sonnet. Each model has its own conversation thread; switching triggers an automatic handoff summary.</Item>
          </Section>

          <Section title="Drawing">
            <Item label="Draw mode">Open the sidebar → select Draw. Choose Pen (precise), Marker (thick, semi-transparent), or Eraser.</Item>
            <Item label="Size &amp; color">Adjust stroke size with the slider and pick a color from the palette in the draw panel.</Item>
            <Item label="Erase">Switch to Eraser tool and paint over strokes to remove them.</Item>
          </Section>

          <Section title="Files & Documents">
            <Item label="Upload">Use the sidebar Actions section to upload an image or file. It appears as a card on the canvas.</Item>
            <Item label="Drop zone">Drag an image or PDF directly onto the canvas to create a file card instantly.</Item>
            <Item label="File system">The sidebar Files section lets you organize notes and uploads into folders.</Item>
            <Item label="Collections">Group cards into named collections via the sidebar. Drag cards between collections.</Item>
          </Section>

          <Section title="Export">
            <Item label="Master PDF">Click <strong>Master PDF</strong> in the header. Brainstorm compiles an editable draft first: cover page, table of contents, chapters from relationships, sections, text, images, PDFs, and code blocks.</Item>
            <Item label="Card PDF">Click the download icon in a card's action bar to export just that card as a PDF snapshot.</Item>
          </Section>

          <Section title="API Keys">
            <Item label="Add keys">Click the settings icon in the AI Chat header. Enter your Gemini, OpenAI, and/or Anthropic keys.</Item>
            <Item label="Storage">Keys are encrypted server-side (AES-GCM via Supabase Edge Function) — the plaintext key never returns to the browser after you save it. Client-side encryption is used as fallback.</Item>
            <Item label="Format">Gemini keys start with <Kbd>AIzaSy</Kbd> · OpenAI with <Kbd>sk-</Kbd> · Anthropic with <Kbd>sk-ant-</Kbd></Item>
          </Section>

        </div>
      </div>
    </div>
  );
};
