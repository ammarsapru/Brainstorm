import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, Brain, Zap, Share2, Layout, FileText, 
  Users, Lightbulb, Target, Layers, Twitter, Linkedin, Github, Mail, 
  CheckCircle2, Globe, Sparkles, MessageCircle, Send, Bot, User, GripHorizontal, Plus, Play,
  MousePointer2, Network, GitFork, MessageSquareText, Wand2, Maximize2, MousePointerClick
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

// --- Custom Hooks for Animation ---
const useScrollReveal = () => {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    
    return () => observer.disconnect();
  }, []);
};

// --- Preview Components ---

const CardToDocAnimation = () => {
  const [stage, setStage] = useState<'card' | 'transition' | 'doc'>('card');

  useEffect(() => {
    const timer = setInterval(() => {
      setStage(prev => {
        if (prev === 'card') return 'transition';
        if (prev === 'transition') return 'doc';
        return 'card';
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-[450px] flex items-center justify-center bg-slate-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl group">
      {/* Background Dots */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:24px_24px]"></div>
      
      {/* Card Stage */}
      <div className={`absolute transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${stage === 'card' ? 'scale-100 opacity-100' : 'scale-150 opacity-0 pointer-events-none'}`}>
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
        <p className="text-white/40 text-center mt-6 font-medium text-sm tracking-widest uppercase">Double Click to Expand</p>
      </div>

      {/* Doc Stage */}
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
             <div className="w-[95%] h-3 bg-slate-100 rounded"></div>
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
      
      {/* HUD Label */}
      <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-xs font-bold text-white uppercase tracking-tighter">Live Deep-Dive Mode</span>
      </div>
    </div>
  );
};

const CanvasPreview = () => {
  const [cards, setCards] = useState([
    { id: '1', x: 120, y: 140, text: 'Product Strategy', color: '#ffffff', rotate: -2 }, 
    { id: '2', x: 320, y: 220, text: 'Q4 Goals', color: '#fef3c7', rotate: 3 }, 
  ]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setDraggingId(id);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setCards(prev => prev.map(c => c.id === draggingId ? { ...c, x, y, rotate: 0 } : c));
      }
    };
    const handleMouseUp = () => setDraggingId(null);

    if (draggingId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId]);

  return (
    <div ref={containerRef} className="w-full h-[400px] relative overflow-hidden select-none cursor-crosshair">
       <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-0">
          <path d={`M ${cards[0].x} ${cards[0].y} Q ${(cards[0].x + cards[1].x)/2} ${(cards[0].y + cards[1].y)/2 + 50} ${cards[1].x} ${cards[1].y}`} 
                stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6,4" fill="none" />
       </svg>

       {cards.map(card => (
         <div 
            key={card.id}
            onMouseDown={(e) => handleMouseDown(e, card.id)}
            className="absolute flex flex-col items-center justify-center w-36 h-24 rounded-lg shadow-lg cursor-grab active:cursor-grabbing hover:scale-105 transition-transform duration-300 border border-gray-100 bg-white z-10"
            style={{ 
              left: card.x, top: card.y, 
              backgroundColor: card.color,
              transform: `translate(-50%, -50%) rotate(${card.rotate}deg)`,
              zIndex: draggingId === card.id ? 20 : 10
            }}
         >
            <div className="font-semibold text-gray-700 text-sm">{card.text}</div>
            <div className="absolute -bottom-3 right-3 bg-white border border-gray-200 rounded-full p-1 shadow-sm">
                <GripHorizontal className="w-3 h-3 text-gray-400" />
            </div>
         </div>
       ))}
       
       {/* Floating cursors for effect */}
       <div className="absolute top-1/4 right-1/4 animate-float-delayed">
          <MousePointer2 className="w-5 h-5 text-blue-500 fill-blue-500/20" />
          <div className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded ml-4 rounded-tl-none">Sarah</div>
       </div>
    </div>
  );
};

const AIPreview = () => {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    if (generated) {
        setGenerated(false);
        return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setGenerated(true);
    }, 800);
  };

  return (
    <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl p-8 h-[360px] relative overflow-hidden flex items-center justify-center select-none w-full">
       
       {/* Connections */}
       <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {generated && (
             <>
               <line x1="50%" y1="50%" x2="50%" y2="20%" stroke="#a78bfa" strokeWidth="1" className="animate-in fade-in duration-700 opacity-50" />
               <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#a78bfa" strokeWidth="1" className="animate-in fade-in duration-700 opacity-50" />
               <line x1="50%" y1="50%" x2="80%" y2="80%" stroke="#a78bfa" strokeWidth="1" className="animate-in fade-in duration-700 opacity-50" />
             </>
          )}
       </svg>

       {/* Satellite Nodes */}
       {generated && (
         <>
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200 animate-in zoom-in slide-in-from-bottom-4 duration-500">Research</div>
            <div className="absolute bottom-[20%] left-[20%] -translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200 animate-in zoom-in slide-in-from-right-4 duration-500 delay-100">Design</div>
            <div className="absolute bottom-[20%] right-[20%] translate-x-1/2 -translate-y-1/2 bg-gray-800 px-4 py-2 rounded-lg border border-purple-500/30 text-sm font-medium text-purple-200 animate-in zoom-in slide-in-from-left-4 duration-500 delay-200">Develop</div>
         </>
       )}

       {/* Main Node */}
       <div className="relative z-10 bg-gray-900 w-56 h-36 rounded-2xl shadow-2xl border border-purple-500/50 flex flex-col items-center justify-center gap-4 transition-transform duration-300">
          <span className="font-semibold text-white tracking-wide text-lg">New Project</span>
          <button 
             onClick={handleGenerate}
             className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300
               ${generated 
                 ? 'bg-gray-800 text-gray-400' 
                 : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)]'
               }
             `}
          >
             {loading ? <span className="animate-spin">✨</span> : <Sparkles className="w-3 h-3" />}
             {generated ? 'Clear' : 'Generate Roadmap'}
          </button>
       </div>
    </div>
  );
};

const ConnectionsPreview = () => {
  return (
    <div className="relative h-[300px] w-full flex items-center justify-center">
       <div className="absolute inset-0 bg-emerald-50/50 rounded-full blur-3xl transform rotate-12"></div>
       
       <div className="relative z-10 flex flex-col gap-8">
          <div className="flex gap-12">
             <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 w-32 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="text-xs text-gray-400 mb-1">Parent</div>
                <div className="font-bold text-gray-800">Goal</div>
             </div>
             <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 w-32 text-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="text-xs text-gray-400 mb-1">Equivalent</div>
                <div className="font-bold text-gray-800">Target</div>
             </div>
          </div>
          
          <div className="flex justify-center">
             <div className="bg-emerald-50 p-4 rounded-xl shadow-inner border border-emerald-100 w-40 text-center animate-in zoom-in duration-500 delay-300">
                <div className="text-xs text-emerald-600 mb-1 font-bold">Dependency</div>
                <div className="font-bold text-gray-800">Key Result</div>
             </div>
          </div>
       </div>

       <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <path d="M 160 110 L 220 180" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow)" strokeDasharray="4,4" className="animate-pulse" />
          <path d="M 320 110 L 260 180" stroke="#cbd5e1" strokeWidth="2" />
          <defs>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#10b981" />
            </marker>
          </defs>
       </svg>
    </div>
  );
};

const ChatPreview = () => {
  return (
    <div className="bg-white rounded-l-2xl shadow-xl border-y border-l border-gray-100 p-6 h-[400px] w-full flex flex-col relative overflow-hidden">
       <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
             <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
             <div className="font-bold text-gray-900">Brainstorm AI</div>
             <div className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Active
             </div>
          </div>
       </div>

       <div className="flex-1 space-y-4">
          <div className="flex justify-start">
             <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-700 max-w-[80%]">
                How can I help with your board today?
             </div>
          </div>
          <div className="flex justify-end">
             <div className="bg-blue-600 rounded-2xl rounded-tr-none px-4 py-3 text-sm text-white max-w-[80%] shadow-md">
                Summarize the marketing strategy cards.
             </div>
          </div>
          <div className="flex justify-start">
             <div className="bg-gray-100 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-gray-700 max-w-[80%]">
                Based on your 5 cards, the core strategy focuses on <strong>community engagement</strong> and <strong>viral loops</strong>.
             </div>
          </div>
       </div>
    </div>
  );
};


export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  useScrollReveal();

  return (
    <div className="min-h-screen w-full font-sans overflow-x-hidden selection:bg-black selection:text-white text-gray-900 bg-white">
      
      <style>{`
        .reveal {
          opacity: 0;
          transform: translateY(20px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal.active {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      {/* --- Sticky Navigation Bar --- */}
      <nav className="sticky top-0 z-[100] w-full bg-white/80 backdrop-blur-md border-b border-gray-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm group-hover:scale-105 transition-transform duration-300">B</div>
            <span className="font-bold text-xl tracking-tight text-gray-900 ml-1 -mt-0.5 group-hover:text-black">rainstorm</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <a href="#canvas" className="hover:text-black transition-colors">Canvas</a>
            <a href="#ai" className="hover:text-black transition-colors">Intelligence</a>
            <a href="#deep-dive" className="hover:text-black transition-colors">Deep Dive</a>
            <a href="#chat" className="hover:text-black transition-colors">Chat</a>
          </div>
          <button 
            onClick={onGetStarted}
            className="px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 shadow-lg"
          >
            Launch App
          </button>
        </div>
      </nav>

      {/* =========================================================================
          SECTION 1: HERO - THEME: AURORA / BREATHING
          ========================================================================= */}
      <main className="relative pt-32 pb-32 px-6 flex flex-col items-center text-center overflow-hidden">
          
          {/* Enhanced Background with Dot Grid + Blobs */}
          <div className="absolute inset-0 -z-10 bg-white">
             {/* Stronger Grid for texture */}
             <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"></div>
             
             {/* Animated Blobs */}
             <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-purple-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob"></div>
             <div className="absolute top-[20%] right-[20%] w-[500px] h-[500px] bg-blue-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-2000"></div>
             <div className="absolute bottom-[20%] left-[40%] w-[600px] h-[600px] bg-pink-200/40 rounded-full mix-blend-multiply filter blur-[80px] animate-blob animation-delay-4000"></div>
          </div>

          <div className="max-w-4xl space-y-8 reveal active flex flex-col items-center z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-xs font-semibold text-gray-600 tracking-wide uppercase">v2.0 with Gemini AI</span>
            </div>
            
            <h1 className="font-bold text-6xl md:text-8xl tracking-tight leading-[1.1] text-gray-900 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              Think bigger. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-500 to-teal-600">Connect better.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-500 max-w-2xl leading-relaxed font-light animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
              The infinite canvas for your mind. Create thought cards, connect ideas dynamically, and let AI help you expand your thoughts into actionable plans.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
              <button 
                onClick={onGetStarted}
                className="px-8 py-4 bg-black text-white rounded-full font-bold text-lg shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
              >
                Start Brainstorming <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
      </main>

      {/* =========================================================================
          SECTION 2: CANVAS - THEME: CANVAS SIMULATION (DOT GRID)
          LAYOUT: Full width background, Floating Card Left, Interactive Space Right
          ========================================================================= */}
      <section id="canvas" className="py-24 bg-slate-50 relative overflow-hidden">
        {/* Specific Background Pattern: Dot Grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
           <div className="flex flex-col md:flex-row items-center gap-12">
              
              {/* Text Card Floating */}
              <div className="w-full md:w-1/3 bg-white/90 backdrop-blur-sm border border-white/50 p-8 rounded-2xl shadow-xl reveal">
                  <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white mb-6 shadow-md">
                     <MousePointer2 className="w-6 h-6" />
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">Infinite Canvas</h2>
                  <p className="text-gray-600 mb-6 font-medium leading-relaxed">
                     No more running out of space. Our canvas expands as you think. Drag, drop, and organize your chaotic thoughts into structured brilliance.
                  </p>
                  <ul className="space-y-3">
                     <li className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <Maximize2 className="w-4 h-4 text-blue-500" />
                        <span>Infinite Zoom & Pan</span>
                     </li>
                     <li className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <GripHorizontal className="w-4 h-4 text-blue-500" />
                        <span>Drag & Drop Everything</span>
                     </li>
                  </ul>
              </div>

              {/* Preview Space */}
              <div className="w-full md:w-2/3 h-[400px] reveal delay-200">
                 <CanvasPreview />
              </div>
           </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2.5: DEEP DIVE - NEW TRANSITION SECTION
          ========================================================================= */}
      <section id="deep-dive" className="py-24 bg-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
           <div className="grid md:grid-cols-2 gap-16 items-center">
              <div className="reveal">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-6 shadow-sm">
                   <Maximize2 className="w-6 h-6" />
                </div>
                <h2 className="text-4xl font-bold text-gray-900 mb-6 tracking-tight">Seamless Deep Dives</h2>
                <p className="text-xl text-gray-600 leading-relaxed mb-8">
                   Every thought card is more than just a note. Double-click any card to instantly expand it into a full-featured markdown document. 
                </p>
                <div className="space-y-4">
                  {[
                    "Transform high-level ideas into detailed specs",
                    "Rich text editing with lists and formatting",
                    "Auto-syncs back to your spatial view",
                    "Infinite room for your longest brainstorming"
                  ].map((text, i) => (
                    <div key={i} className="flex items-center gap-3">
                       <CheckCircle2 className="w-5 h-5 text-emerald-500" />
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

      {/* =========================================================================
          SECTION 3: AI - THEME: DARK COMMAND CENTER
          LAYOUT: Centered Text Top, Wide Dashboard Preview Bottom
          ========================================================================= */}
      <section id="ai" className="py-32 bg-[#0F1117] relative overflow-hidden text-white">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:100px_100px]"></div>

        <div className="max-w-4xl mx-auto px-6 relative z-10 flex flex-col items-center">
            {/* Header Centered */}
            <div className="text-center mb-16 reveal">
               <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-6">
                  <Wand2 className="w-6 h-6 text-purple-400" />
               </div>
               <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">Your Intelligent Co-pilot</h2>
               <p className="text-lg text-gray-400 max-w-2xl mx-auto font-light">
                  Generative AI that doesn't just write text—it builds structures. Turn a single keyword into a comprehensive roadmap with one click.
               </p>
            </div>

            {/* Wide Preview */}
            <div className="w-full reveal delay-200">
                <AIPreview />
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 w-full reveal delay-300">
               <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="font-bold text-purple-300 mb-1">Expansion</div>
                  <div className="text-xs text-gray-400">Auto-generate related ideas</div>
               </div>
               <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="font-bold text-purple-300 mb-1">Summarization</div>
                  <div className="text-xs text-gray-400">Condense boards into reports</div>
               </div>
               <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="font-bold text-purple-300 mb-1">Context</div>
                  <div className="text-xs text-gray-400">AI understands spatial relationships</div>
               </div>
            </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: CHAT - THEME: LIGHT & AIRY
          LAYOUT: Preview Left, Text Right (Alternating)
          ========================================================================= */}
      <section id="chat" className="py-24 bg-blue-50/30 border-y border-blue-50 relative overflow-hidden">
         <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
               
               {/* Preview Left */}
               <div className="order-2 lg:order-1 reveal">
                  <ChatPreview />
               </div>

               {/* Text Right */}
               <div className="order-1 lg:order-2 reveal delay-200 pl-0 lg:pl-10">
                 <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 mb-6">
                   <MessageSquareText className="w-6 h-6" />
                 </div>
                 <h2 className="text-3xl font-bold text-gray-900 mb-4">Contextual Chat</h2>
                 <p className="text-lg text-gray-600 leading-relaxed mb-6 font-medium">
                    Don't leave your canvas to get answers. Chat with Gemini directly alongside your work. It sees what you're working on and provides relevant advice.
                 </p>
                 <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                        <Bot className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">"What's missing from this strategy?"</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm">
                        <Bot className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">"Summarize these 5 notes."</span>
                    </div>
                 </div>
               </div>

            </div>
         </div>
      </section>

      {/* =========================================================================
          SECTION 5: CONNECTIONS - THEME: STRUCTURED GRID
          LAYOUT: Text Top Left, Preview Bottom Right (Diagonal Split)
          ========================================================================= */}
      <section id="connections" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12">
              
              <div className="reveal">
                <div className="w-12 h-12 bg-emerald-100 border border-emerald-200 rounded-xl flex items-center justify-center text-emerald-700 mb-6">
                  <GitFork className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Semantic Linking</h2>
                <p className="text-lg text-gray-600 leading-relaxed font-medium">
                  Go beyond simple lines. Define <span className="text-emerald-600 font-bold">relationships</span>. Map hierarchies, dependencies, and flows to create a true knowledge graph.
                </p>
              </div>

              <div className="flex items-end justify-center lg:justify-end reveal delay-200">
                 <div className="w-full max-w-md">
                    <ConnectionsPreview />
                 </div>
              </div>

            </div>
        </div>
      </section>

      {/* --- Use Cases Grid --- */}
      <section id="use-cases" className="py-24 bg-gray-50 border-t border-gray-200 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 reveal">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Built for every thinker</h2>
            <p className="text-gray-500">From solo brainstorming to complex architecture.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 reveal">
            {[
              {
                icon: <Target className="w-6 h-6 text-red-600" />,
                title: "Product Managers",
                desc: "Map out user flows, organize feature requests, and summarize strategy for stakeholders."
              },
              {
                icon: <Lightbulb className="w-6 h-6 text-amber-500" />,
                title: "Creatives",
                desc: "Moodboard with images, draft copy, and connect visual concepts in one place."
              },
              {
                icon: <Users className="w-6 h-6 text-blue-600" />,
                title: "Students",
                desc: "Organize research papers, map out essay structures, and upload source PDFs."
              },
              {
                icon: <Layers className="w-6 h-6 text-violet-600" />,
                title: "Developers",
                desc: "Architect system diagrams, plan database schemas, and document API flows."
              }
            ].map((useCase, i) => (
              <div key={i} className="p-8 rounded-2xl bg-white shadow-sm border border-gray-200 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group cursor-default">
                <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-black group-hover:text-white transition-colors">
                  {useCase.icon}
                </div>
                <h3 className="font-bold text-lg text-gray-900 mb-2">{useCase.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{useCase.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="bg-white border-t border-gray-200 pt-16 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4 group cursor-pointer">
                <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md group-hover:scale-105 transition-transform">B</div>
                <span className="text-xl font-bold text-gray-900 group-hover:text-black transition-colors ml-1 -mt-0.5">rainstorm</span>
              </div>
              <p className="text-gray-500 max-w-sm mb-6 font-medium text-sm">
                The ultimate tool for thinking, planning, and creating. Open source and free for everyone.
              </p>
              <div className="flex gap-4">
                <a href="#" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all">
                  <Twitter className="w-4 h-4" />
                </a>
                <a href="#" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all">
                  <Github className="w-4 h-4" />
                </a>
                <a href="#" className="p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 hover:text-black transition-all">
                  <Linkedin className="w-4 h-4" />
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Product</h4>
              <ul className="space-y-2 text-gray-500 text-sm font-medium">
                <li><a href="#" className="hover:text-black transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-black transition-colors">Pricing</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-sm">Contact</h4>
              <ul className="space-y-2 text-gray-500 text-sm font-medium">
                <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> support@brainstorm.app</li>
                <li className="pt-2">123 Innovation Dr.<br/>San Francisco, CA 94103</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-400 font-medium">
            <p>© 2024 Brainstorm App Inc.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-gray-900 transition-colors">Privacy</a>
              <a href="#" className="hover:text-gray-900 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};