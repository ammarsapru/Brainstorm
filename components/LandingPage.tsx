import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRight, FileText,
  Users, Lightbulb, Target, Layers, Instagram, Linkedin, Github, Mail,
  CheckCircle2, Sparkles, MessageCircle, Bot, GripHorizontal,
  MousePointer2, GitFork, MessageSquareText, Wand2, Maximize2, MousePointerClick, Download,
  X, Shield, Lock, Database, Eye, Trash2, Code, Image as ImageIcon, Network,
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

const DOWNLOAD_URL = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || '/Brainstorm-Setup.exe';

const useScrollReveal = () => {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('active');
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
};

// ─── Modals ──────────────────────────────────────────────────────────────────

const PrivacyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center"><Shield className="w-4 h-4 text-white" /></div>
          <h2 className="text-xl font-bold text-gray-900">Privacy Policy</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
      </div>
      <div className="px-8 py-6 space-y-6 text-gray-600 text-sm leading-relaxed">
        <p className="text-gray-500 text-xs">Last updated: June 2026</p>
        <p>Brainstorm is a personal brainstorming and note-taking tool. We designed it with privacy in mind — your ideas belong to you.</p>
        <div className="space-y-5">
          {[
            { icon: <Mail className="w-4 h-4 text-blue-600" />, bg: 'bg-blue-50', title: 'Account Information', body: 'When you sign in, we collect your email address via Supabase Auth (supports email/password and Google OAuth). We use this solely to identify your account. We do not share your email with third parties.' },
            { icon: <Database className="w-4 h-4 text-emerald-600" />, bg: 'bg-emerald-50', title: 'Your Canvas Data', body: 'Everything you create — idea cards, connections, freehand drawings, notes, and session names — is stored in our Supabase database. It is not used to train AI models or shared with anyone.' },
            { icon: <MessageCircle className="w-4 h-4 text-purple-600" />, bg: 'bg-purple-50', title: 'AI Chat History', body: 'Your AI chat conversations within each session are stored in our database. When you send a message, your text is transmitted to the respective AI provider using your own API key. We do not log or retain the raw API calls ourselves.' },
            { icon: <FileText className="w-4 h-4 text-amber-600" />, bg: 'bg-amber-50', title: 'Uploaded Files', body: 'PDFs and images you attach to cards are stored in Supabase Storage. Files are associated with your account and accessible only to you. We validate file types using magic-byte inspection before storage.' },
            { icon: <Lock className="w-4 h-4 text-red-600" />, bg: 'bg-red-50', title: 'API Keys (BYOK)', body: "If you add your own AI API keys, they are encrypted client-side using AES-GCM-256 with a non-extractable key stored in your browser's IndexedDB. Your raw API keys are never transmitted to our servers." },
          ].map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className={`w-8 h-8 ${item.bg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>{item.icon}</div>
              <div><h3 className="font-bold text-gray-900 mb-1">{item.title}</h3><p>{item.body}</p></div>
            </div>
          ))}
          <div className="flex gap-4">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><Eye className="w-4 h-4 text-gray-600" /></div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">What We Do Not Collect</h3>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>No physical location or IP logging</li>
                <li>No payment information (the app is free)</li>
                <li>No third-party advertising or tracking pixels</li>
                <li>No browser fingerprinting</li>
                <li>No analytics beyond standard Supabase request logs</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"><Trash2 className="w-4 h-4 text-gray-600" /></div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Data Deletion</h3>
              <p>You can delete individual sessions and cards at any time. To request full account deletion, email us at <strong>ammarsaboor40@gmail.com</strong> and we will process it within 30 days.</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
          Questions? Contact us at <a href="mailto:ammarsaboor40@gmail.com" className="text-black font-semibold hover:underline">ammarsaboor40@gmail.com</a>
        </div>
      </div>
    </div>
  </div>
);

const TermsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-5 flex items-center justify-between rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center"><FileText className="w-4 h-4 text-white" /></div>
          <h2 className="text-xl font-bold text-gray-900">Terms of Service</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
      </div>
      <div className="px-8 py-6 space-y-6 text-gray-600 text-sm leading-relaxed">
        <p className="text-gray-500 text-xs">Last updated: June 2026</p>
        <p>By using Brainstorm, you agree to these terms. They are intentionally simple and straightforward.</p>
        <div className="space-y-5">
          {[
            { title: '1. Your Content', body: 'Everything you create in Brainstorm belongs to you. We do not claim any ownership over your content and will never use it for advertising or sell it.' },
            { title: '2. Acceptable Use', body: "You agree not to use the app for illegal activity, upload malicious files, attempt to access other users' data, or abuse the Supabase backend in ways that degrade service for others." },
            { title: '3. AI API Keys', body: 'Brainstorm is a bring-your-own-key (BYOK) application. When you provide API keys, you are responsible for your usage under each provider\'s terms. Any costs incurred from AI API usage are your responsibility.' },
            { title: '4. Service Availability', body: 'Brainstorm is provided as-is, free of charge. We make reasonable efforts to keep the service running but do not guarantee uptime or data preservation. We recommend exporting important work using the built-in PDF export.' },
            { title: '6. Changes', body: 'We may update these terms as the app evolves. Continued use of the service after changes constitutes acceptance.' },
          ].map((item, i) => (
            <div key={i}>
              <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
          <div>
            <h3 className="font-bold text-gray-900 mb-2">5. Open Source</h3>
            <p>Brainstorm is open source. The source code is available on{' '}
              <a href="https://github.com/ammarsapru/Brainstorm" target="_blank" rel="noopener noreferrer" className="text-black font-semibold hover:underline">GitHub</a>{' '}
              under its respective license. Contributions and forks are welcome.</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
          Questions? <a href="mailto:ammarsaboor40@gmail.com" className="text-black font-semibold hover:underline">ammarsaboor40@gmail.com</a>
        </div>
      </div>
    </div>
  </div>
);

// ─── Demo components ──────────────────────────────────────────────────────────

const CardToDocAnimation = () => {
  const [stage, setStage] = useState<'card' | 'transition' | 'doc'>('card');
  useEffect(() => {
    const timer = setInterval(() => {
      setStage(prev => prev === 'card' ? 'transition' : prev === 'transition' ? 'doc' : 'card');
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[450px] flex items-center justify-center bg-slate-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:24px_24px]"></div>
      <div className={`absolute transition-all duration-700 ease-out ${stage === 'card' ? 'scale-100 opacity-100' : 'scale-150 opacity-0 pointer-events-none'}`}>
        <div className="w-64 h-40 bg-white rounded-xl shadow-2xl p-6 border-b-4 border-emerald-500 relative">
          <div className="w-12 h-2 bg-slate-200 rounded mb-4"></div>
          <div className="w-40 h-3 bg-slate-100 rounded mb-2"></div>
          <div className="w-32 h-3 bg-slate-100 rounded"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse">
            <MousePointerClick className="w-8 h-8 text-emerald-500 drop-shadow-lg" />
          </div>
          <div className="absolute -top-3 -right-3 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
        <p className="text-white/40 text-center mt-6 font-medium text-sm tracking-widest uppercase">Compile to Draft</p>
      </div>
      <div className={`absolute w-[85%] h-[85%] bg-white rounded-xl shadow-2xl flex flex-col transition-all duration-700 ease-out ${stage === 'doc' ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-20 opacity-0 scale-90 pointer-events-none'}`}>
        <div className="h-12 border-b border-slate-100 flex items-center px-4 justify-between">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-200"></div>
            <div className="w-3 h-3 rounded-full bg-slate-200"></div>
          </div>
          <div className="w-32 h-2 bg-slate-100 rounded"></div>
          <div className="w-6 h-6 rounded bg-emerald-50 flex items-center justify-center">
            <FileText className="w-3 h-3 text-emerald-600" />
          </div>
        </div>
        <div className="p-8 space-y-4">
          <div className="w-2/3 h-6 bg-slate-900 rounded mb-6"></div>
          <div className="space-y-2">
            <div className="w-full h-3 bg-slate-100 rounded"></div>
            <div className="w-full h-3 bg-slate-100 rounded"></div>
            <div className="w-[90%] h-3 bg-slate-100 rounded"></div>
          </div>
          <div className="pt-4 flex gap-3">
            <div className="w-10 h-10 rounded bg-emerald-100"></div>
            <div className="flex-1 space-y-2 pt-2">
              <div className="w-1/2 h-2 bg-slate-100 rounded"></div>
              <div className="w-1/3 h-2 bg-slate-50 rounded"></div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-xs font-bold text-white uppercase tracking-tighter">Editable PDF Draft</span>
      </div>
    </div>
  );
};

// Touch-safe canvas preview — uses pointer events throughout, no mouse events
const CanvasPreview = () => {
  const [cards, setCards] = useState([
    { id: '1', x: 120, y: 140, text: 'Product Strategy', color: '#ffffff', rotate: -2 },
    { id: '2', x: 320, y: 220, text: 'Q4 Goals', color: '#fef3c7', rotate: 3 },
  ]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerRef.current = e.pointerId;
    setDraggingId(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || e.pointerId !== activePointerRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCards(prev => prev.map(c =>
      c.id === draggingId
        ? { ...c, x: e.clientX - rect.left, y: e.clientY - rect.top, rotate: 0 }
        : c
    ));
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    activePointerRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-[400px] relative overflow-hidden select-none cursor-crosshair touch-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
        <path
          d={`M ${cards[0].x} ${cards[0].y} Q ${(cards[0].x + cards[1].x) / 2} ${(cards[0].y + cards[1].y) / 2 + 50} ${cards[1].x} ${cards[1].y}`}
          stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6,4" fill="none"
        />
      </svg>
      {cards.map(card => (
        <div
          key={card.id}
          onPointerDown={(e) => handlePointerDown(e, card.id)}
          className="absolute flex flex-col items-center justify-center w-36 h-24 rounded-lg shadow-lg cursor-grab active:cursor-grabbing border border-gray-100 bg-white z-10 touch-none"
          style={{
            left: card.x,
            top: card.y,
            backgroundColor: card.color,
            transform: `translate(-50%, -50%) rotate(${card.rotate}deg)`,
            zIndex: draggingId === card.id ? 20 : 10,
            transition: draggingId === card.id ? 'none' : 'transform 0.3s',
          }}
        >
          <div className="font-semibold text-gray-700 text-sm">{card.text}</div>
          <div className="absolute -bottom-3 right-3 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
            <GripHorizontal className="w-3 h-3 text-gray-400" />
          </div>
        </div>
      ))}
    </div>
  );
};

const AIPreview = () => {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    if (generated) { setGenerated(false); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); setGenerated(true); }, 800);
  };

  return (
    <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl p-8 h-[360px] relative overflow-hidden flex items-center justify-center select-none w-full">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {generated && (
          <>
            <line x1="50%" y1="50%" x2="50%" y2="20%" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
            <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
            <line x1="50%" y1="50%" x2="80%" y2="80%" stroke="#a78bfa" strokeWidth="1" opacity="0.5" />
          </>
        )}
      </svg>
      {generated && (
        <>
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200">Research</div>
          <div className="absolute top-[80%] left-[20%] -translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200">Evidence</div>
          <div className="absolute top-[80%] right-[20%] translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200">Next steps</div>
        </>
      )}
      <div className="relative z-10 bg-gray-900 w-56 h-36 rounded-2xl shadow-2xl border border-purple-500/50 flex flex-col items-center justify-center gap-4">
        <span className="font-semibold text-white tracking-wide text-lg">Messy Board</span>
        <button
          onClick={handleGenerate}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300 ${
            generated
              ? 'bg-gray-800 text-gray-400'
              : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)]'
          }`}
        >
          {loading ? <span className="animate-spin">✨</span> : <Sparkles className="w-3 h-3" />}
          {generated ? 'Clear' : 'Find Structure'}
        </button>
      </div>
    </div>
  );
};

const ChatPreview = () => (
  <div className="bg-white rounded-l-2xl shadow-xl border-y border-l border-gray-100 p-6 h-[400px] w-full flex flex-col relative overflow-hidden">
    <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-4">
      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
        <Bot className="w-5 h-5 text-blue-600" />
      </div>
      <div>
        <div className="font-bold text-gray-900">Brainstorm AI</div>
        <div className="text-xs text-green-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Active · Reads the whole session
        </div>
      </div>
    </div>
    <div className="flex-1 space-y-4 overflow-hidden">
      <div className="flex justify-start">
        <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-700 max-w-[80%]">
          I found 8 cards, 2 connections, and one uploaded PDF. Want a summary or a draft outline?
        </div>
      </div>
      <div className="flex justify-end">
        <div className="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-3 text-sm text-white max-w-[80%] shadow-md">
          Turn this board into sections and add missing next steps.
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-700 max-w-[80%]">
          I grouped the strategy cards, kept the PDF as source material, and added 4 action cards.
        </div>
      </div>
    </div>
  </div>
);

// ─── Main ────────────────────────────────────────────────────────────────────

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  useScrollReveal();

  const [showDownloadToast, setShowDownloadToast] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDownload = () => {
    setShowDownloadToast(true);
    setTimeout(() => setShowDownloadToast(false), 4000);
    const link = document.createElement('a');
    link.href = DOWNLOAD_URL;
    link.download = 'Brainstorm-Setup.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen w-full font-sans overflow-x-hidden selection:bg-black selection:text-white text-gray-900 bg-white">
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

      {/* Download toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[150] transition-all duration-500 ${showDownloadToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-full shadow-2xl border border-white/10">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-sm font-semibold">Your download will start in a moment…</span>
        </div>
      </div>

      <style>{`
        .reveal { opacity: 0; transform: translateY(20px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }
        @keyframes blob { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-20px) scale(1.05)} 66%{transform:translate(-20px,20px) scale(0.95)} }
        .animate-blob { animation: blob 8s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 z-[100] w-full bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm group-hover:scale-105 transition-transform">B</div>
            <span className="font-bold text-xl tracking-tight text-gray-900 ml-1 -mt-0.5">rainstorm</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <a href="#canvas" onClick={scrollToSection('canvas')} className="hover:text-black transition-colors">Canvas</a>
            <a href="#deep-dive" onClick={scrollToSection('deep-dive')} className="hover:text-black transition-colors">PDF Drafts</a>
            <a href="#ai" onClick={scrollToSection('ai')} className="hover:text-black transition-colors">AI</a>
            <a href="#connections" onClick={scrollToSection('connections')} className="hover:text-black transition-colors">Connections</a>
          </div>
          <button
            onClick={onGetStarted}
            className="px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 shadow-lg"
          >
            Launch App — Free
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <main className="relative pt-32 pb-24 px-6 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-white">
          <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"></div>
          <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-purple-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob"></div>
          <div className="absolute top-[20%] right-[20%] w-[500px] h-[500px] bg-blue-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-[20%] left-[40%] w-[600px] h-[600px] bg-pink-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-4xl space-y-8 reveal active flex flex-col items-center z-10">
          {/* Provider badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="text-xs font-semibold text-gray-600 tracking-wide">Cards, files, AI, and editable PDF drafts</span>
          </div>

          <h1 className="font-bold text-6xl md:text-8xl tracking-tight leading-[1.1] text-gray-900">
            Turn scattered ideas<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-600">into structured work.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-500 max-w-2xl leading-relaxed font-light">
            Brainstorm is an infinite canvas for cards, files, images, links, and rough notes. Connect what belongs together, let AI read the board, then compile everything into an editable PDF draft.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <button
              onClick={onGetStarted}
              className="px-8 py-4 bg-black text-white rounded-full font-bold text-lg shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
            >
              Start Mapping <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              className="px-8 py-4 bg-white text-gray-900 border border-gray-200 rounded-full font-bold text-lg shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <Download className="w-5 h-5" /> Desktop App (Windows)
            </button>
          </div>

          <p className="text-sm text-gray-400 font-medium">Free forever · Open source · Bring your own AI keys</p>
        </div>
      </main>

      {/* ── Feature strip ───────────────────────────────────────────────────── */}
      <section className="py-10 border-y border-gray-100 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: <FileText className="w-5 h-5 text-emerald-600" />, label: 'Draft builder', sub: 'Preview before export' },
              { icon: <Code className="w-5 h-5 text-violet-600" />, label: 'File cards', sub: 'PDFs, docs, text, and code' },
              { icon: <ImageIcon className="w-5 h-5 text-blue-600" />, label: 'Visual context', sub: 'Images stay on the board' },
              { icon: <Download className="w-5 h-5 text-amber-600" />, label: 'Master PDF', sub: 'Chapters from relationships' },
            ].map((f, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center">{f.icon}</div>
                <div className="font-semibold text-gray-800 text-sm">{f.label}</div>
                <div className="text-xs text-gray-400">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <section id="canvas" className="py-24 bg-slate-50 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="w-full md:w-1/3 bg-white/90 backdrop-blur-sm border border-white/50 p-8 rounded-2xl shadow-xl reveal">
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white mb-6 shadow-md">
                <MousePointer2 className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">Think on the board first</h2>
              <p className="text-gray-600 mb-6 font-medium leading-relaxed">
                Start messy without losing the thread. Place cards, move them around, draw notes, and connect ideas when the relationship becomes clear.
              </p>
              <ul className="space-y-3">
                {[
                  { icon: <Maximize2 className="w-4 h-4 text-blue-500" />, text: 'Pan and zoom across a large workspace' },
                  { icon: <GripHorizontal className="w-4 h-4 text-blue-500" />, text: 'Drop in notes, images, PDFs, and files' },
                  { icon: <Network className="w-4 h-4 text-blue-500" />, text: 'Use connections to show structure' },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    {item.icon}<span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-full md:w-2/3 h-[400px] reveal delay-200">
              <CanvasPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Documents ───────────────────────────────────────────────────────── */}
      <section id="deep-dive" className="py-24 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="reveal">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-6 shadow-sm">
                <Maximize2 className="w-6 h-6" />
              </div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6 tracking-tight">Compile the board into a draft</h2>
              <p className="text-xl text-gray-600 leading-relaxed mb-8">
                Master PDF now creates an export draft first. Brainstorm infers chapters from connected cards, shows the preview, and lets you edit before the final PDF is downloaded.
              </p>
              <div className="space-y-4">
                {[
                  'Chapters and sections inferred from card relationships',
                  'Editable preview before the final PDF',
                  'Text, images, PDFs, and code included with context',
                  'Card documents still open for long-form notes',
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-700">{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="reveal delay-300">
              <CardToDocAnimation />
            </div>
          </div>
        </div>
      </section>

      {/* ── AI ──────────────────────────────────────────────────────────────── */}
      <section id="ai" className="py-32 bg-[#0F1117] relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100px_100px]"></div>
        <div className="max-w-4xl mx-auto px-6 relative z-10 flex flex-col items-center">
          <div className="text-center mb-16 reveal">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-6">
              <Wand2 className="w-6 h-6 text-purple-400" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">AI that understands the board</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto font-light">
              Use Gemini, GPT-4o, or Claude with your own key. The chat reads cards, connections, card content, and uploaded files before it answers or changes the canvas.
            </p>
          </div>
          <div className="w-full reveal delay-200">
            <AIPreview />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 w-full reveal delay-300">
            {[
              { title: 'Board-aware', desc: 'Reads cards, links, files, and notes together' },
              { title: 'Action-capable', desc: 'Creates, moves, connects, and colors cards on command' },
              { title: 'Your key', desc: 'Bring your own provider keys and keep control' },
            ].map((f, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="font-bold text-purple-300 mb-1">{f.title}</div>
                <div className="text-xs text-gray-400">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Chat ────────────────────────────────────────────────────────────── */}
      <section id="chat" className="py-24 bg-blue-50/30 border-y border-blue-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="order-2 lg:order-1 reveal">
              <ChatPreview />
            </div>
            <div className="order-1 lg:order-2 reveal delay-200 pl-0 lg:pl-10">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 mb-6">
                <MessageSquareText className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Ask about the mess. Then ask it to organize.</h2>
              <p className="text-lg text-gray-600 leading-relaxed mb-6 font-medium">
                Use chat when the board gets too large to hold in your head. Ask for gaps, summaries, outlines, or new connected cards without leaving the canvas.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  '"What is the central idea of this board?"',
                  '"Summarize the uploaded PDF and add source cards."',
                  '"Group these cards into sections for the PDF draft."',
                ].map((prompt, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                    <Bot className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-700">{prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Connections ─────────────────────────────────────────────────────── */}
      <section id="connections" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="reveal">
              <div className="w-12 h-12 bg-emerald-100 border border-emerald-200 rounded-xl flex items-center justify-center text-emerald-700 mb-6">
                <GitFork className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Relationships become structure</h2>
              <p className="text-lg text-gray-600 leading-relaxed font-medium mb-6">
                Lines are more than decoration. They tell Brainstorm what belongs together, help AI reason about the board, and guide the chapter and section draft for export.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { color: 'bg-emerald-100 text-emerald-700', label: 'Parent -> Child', desc: 'Hierarchy and breakdown' },
                  { color: 'bg-blue-100 text-blue-700', label: 'Equivalence', desc: 'Same-level grouping' },
                  { color: 'bg-amber-100 text-amber-700', label: 'Custom color + label', desc: 'A relationship note in plain language' },
                ].map((rel, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${rel.color}`}>{rel.label}</span>
                    <span className="text-sm text-gray-500">{rel.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="reveal delay-200 flex items-center justify-center">
              <div className="relative w-72 h-64 select-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white border-2 border-gray-200 rounded-xl px-5 py-3 shadow-sm text-center">
                  <div className="text-xs text-gray-400 mb-1 font-medium">Goal</div>
                  <div className="font-bold text-gray-800">Main Topic</div>
                </div>
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill="#10b981" />
                    </marker>
                  </defs>
                  <line x1="50%" y1="70" x2="28%" y2="155" stroke="#10b981" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#arr)" />
                  <line x1="50%" y1="70" x2="72%" y2="155" stroke="#10b981" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#arr)" />
                </svg>
                <div className="absolute bottom-0 left-[10%] bg-white border-2 border-emerald-200 rounded-xl px-4 py-3 shadow-sm text-center">
                  <div className="text-xs text-emerald-600 mb-1 font-bold">Task</div>
                  <div className="font-bold text-gray-800">Section A</div>
                </div>
                <div className="absolute bottom-0 right-[10%] bg-white border-2 border-emerald-200 rounded-xl px-4 py-3 shadow-sm text-center">
                  <div className="text-xs text-emerald-600 mb-1 font-bold">Task</div>
                  <div className="font-bold text-gray-800">Section B</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Use cases ───────────────────────────────────────────────────────── */}
      <section id="use-cases" className="py-24 bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Built for messy source material</h2>
            <p className="text-gray-500">Use it when your work starts scattered but needs to leave as something readable.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 reveal">
            {[
              { icon: <Target className="w-6 h-6 text-red-600" />, title: 'Teams', desc: 'Map strategy, decisions, files, and open questions, then export a clean working draft.' },
              { icon: <Lightbulb className="w-6 h-6 text-amber-500" />, title: 'Creators', desc: 'Collect references, visual ideas, notes, and copy without flattening the process too early.' },
              { icon: <Users className="w-6 h-6 text-blue-600" />, title: 'Students', desc: 'Turn lecture cards, readings, PDFs, and topic maps into study packets or reports.' },
              { icon: <Layers className="w-6 h-6 text-violet-600" />, title: 'Builders', desc: 'Plan systems with diagrams, code files, links, and AI-assisted implementation notes.' },
            ].map((useCase, i) => (
              <div key={i} className="p-8 rounded-2xl bg-white shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group cursor-default">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-black transition-colors">
                  {useCase.icon}
                </div>
                <h3 className="font-bold text-lg text-gray-900 mb-2">{useCase.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{useCase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ──────────────────────────────────────────────────────── */}
      <section className="py-24 bg-black text-white text-center">
        <div className="max-w-2xl mx-auto px-6 reveal">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Start with a rough board. Leave with a draft.</h2>
          <p className="text-gray-400 text-lg mb-10">Open source · Works on desktop, tablet, and phone · Your data, your keys</p>
          <button
            onClick={onGetStarted}
            className="px-10 py-5 bg-white text-black rounded-full font-bold text-xl hover:bg-gray-100 hover:scale-105 active:scale-95 transition-all shadow-2xl flex items-center gap-3 mx-auto"
          >
            Open Brainstorm <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200 pt-16 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4 group cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md group-hover:scale-105 transition-transform">B</div>
                <span className="text-xl font-bold text-gray-900 ml-1 -mt-0.5">rainstorm</span>
              </div>
              <p className="text-gray-500 max-w-sm mb-6 font-medium text-sm">A spatial workspace for turning scattered ideas, files, and connections into structured drafts.</p>
              <div className="flex gap-4">
                <a href="https://www.instagram.com/ammarsaboorr11" target="_blank" rel="noopener noreferrer" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all" aria-label="Instagram"><Instagram className="w-4 h-4" /></a>
                <a href="https://github.com/ammarsapru" target="_blank" rel="noopener noreferrer" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all" aria-label="GitHub"><Github className="w-4 h-4" /></a>
                <a href="https://www.linkedin.com/in/ammar-sheikh-703247317" target="_blank" rel="noopener noreferrer" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all" aria-label="LinkedIn"><Linkedin className="w-4 h-4" /></a>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Contact</h4>
              <ul className="space-y-2 text-gray-500 text-sm font-medium">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <a href="mailto:ammarsaboor40@gmail.com" className="hover:text-black transition-colors">ammarsaboor40@gmail.com</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-400 font-medium">
            <p>© {new Date().getFullYear()} Brainstorm. Open source.</p>
            <div className="flex gap-6">
              <button onClick={() => setShowPrivacy(true)} className="hover:text-gray-900 transition-colors">Privacy</button>
              <button onClick={() => setShowTerms(true)} className="hover:text-gray-900 transition-colors">Terms</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
