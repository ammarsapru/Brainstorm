import React, { useRef, useState } from 'react';
import { Plus, Clock, FileText, Trash2, LayoutGrid, Upload, Pencil, MessageSquare, Sparkles, Image as ImageIcon, Smile } from 'lucide-react';
import { Session } from '../types';
import { CreationModal } from './CreationModal';
import { generateSessionIcon, generateSessionImage } from '../services/aiService';

const LoadingOverlay = () => {
  const [status, setStatus] = React.useState('Connecting to secure server...');
  
  React.useEffect(() => {
    const statuses = [
      'Connecting to secure server...', 
      'Verifying credentials...', 
      'Retrieving sessions...', 
      'Loading canvas data...'
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % statuses.length;
      setStatus(statuses[i]);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center mb-8">
        {/* Animated Ring */}
        <div className="absolute w-24 h-24 border-2 border-white/10 border-t-white rounded-full animate-spin"></div>
        <div className="absolute w-32 h-32 border border-white/5 border-b-white/30 rounded-full animate-[spin_3s_linear_reverse_infinite]"></div>
        
        {/* Brainstorm Logo */}
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-black font-bold text-4xl shadow-[0_0_40px_rgba(255,255,255,0.15)] z-10 transition-transform duration-1000">
          B
        </div>
      </div>
      <h3 className="text-2xl font-bold text-white font-display tracking-tight flex items-center gap-1">
        <span>Retrieving sessions</span>
        <span className="flex gap-0.5">
          <span className="animate-[bounce_1s_infinite_0ms]">.</span>
          <span className="animate-[bounce_1s_infinite_200ms]">.</span>
          <span className="animate-[bounce_1s_infinite_400ms]">.</span>
        </span>
      </h3>
      <p className="text-gray-400 font-medium mt-3 text-sm animate-pulse">{status}</p>
    </div>
  );
};

interface SessionListProps {
  sessions: Session[];
  onSelect: (session: Session) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onUpdateSessionImage: (sessionId: string, image: string) => void;
  onUpdateSessionIcon: (sessionId: string, icon: string) => void;
  isLoading?: boolean;
}

export const SessionList: React.FC<SessionListProps> = ({ sessions, onSelect, onCreate, onDelete, onRename, onUpdateSessionImage, onUpdateSessionIcon, isLoading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedSessionRef = useRef<string | null>(null);

  // Rename Modal State
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [sessionToRename, setSessionToRename] = useState<Session | null>(null);

  // Loading states
  const [generatingIconFor, setGeneratingIconFor] = useState<string | null>(null);
  const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);

  const handleImageClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    selectedSessionRef.current = sessionId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedSessionRef.current) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          onUpdateSessionImage(selectedSessionRef.current!, ev.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleGenerateIcon = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setGeneratingIconFor(session.id);
    const cardTexts = session.cards.map(c => c.text).filter(t => t);
    const icon = await generateSessionIcon(session.name, cardTexts);
    onUpdateSessionIcon(session.id, icon);
    setGeneratingIconFor(null);
  };

  const handleGenerateImage = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setGeneratingImageFor(session.id);
    const cardTexts = session.cards.map(c => c.text).filter(t => t);
    const image = await generateSessionImage(session.name, cardTexts);
    if (image) {
      onUpdateSessionImage(session.id, image);
    } else {
      alert("Failed to generate image. Please try again.");
    }
    setGeneratingImageFor(null);
  };

  const openRenameModal = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setSessionToRename(session);
    setRenameModalOpen(true);
  };

  const handleRenameConfirm = (newName: string) => {
    if (sessionToRename) {
      onRename(sessionToRename.id, newName);
    }
    setSessionToRename(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 px-8 pb-12 relative">
      <div className="max-w-7xl mx-auto">

        {/* --- Loading Overlay --- */}
        {isLoading && <LoadingOverlay />}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 font-display text-center md:text-left w-full">Your Sessions (V2 - Secure)</h2>
            <p className="text-gray-500 mt-1 font-medium text-center md:text-left w-full">Manage your brainstorming canvases and documents</p>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Create New Card - Updated Styles */}
          <button
            onClick={onCreate}
            className="group flex flex-col items-center justify-center h-64 rounded-3xl bg-black border-2 border-transparent hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
          >
            <div className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center mb-4 group-hover:bg-white group-hover:text-black transition-all">
              <Plus className="w-7 h-7" />
            </div>
            <span className="font-bold text-white/90 group-hover:text-white transition-colors">Create New Canvas</span>
          </button>

          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => onSelect(session)}
              className="group relative bg-white rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 border border-gray-200 transition-all overflow-hidden cursor-pointer flex flex-col h-64 animate-in fade-in duration-300"
            >
              {/* Preview Area (Thumbnail) */}
              <div className="flex-1 relative overflow-hidden group/image">
                {session.thumbnail ? (
                  <img src={session.thumbnail} alt="Session Preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full bg-slate-50 relative">
                    {/* Dot Grid Pattern - Matches Workspace */}
                    <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] opacity-70"></div>

                    {/* Mini Cards Representation */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full flex items-center justify-center pointer-events-none">
                      {session.cards.length > 0 ? (
                        <div className="relative">
                          <div className="absolute w-24 h-16 bg-white rounded-lg shadow-md border border-gray-200 rotate-[-6deg] group-hover:rotate-[-2deg] transition-transform duration-300 z-10 flex flex-col p-2">
                            <div className="h-1.5 w-12 bg-gray-200 rounded mb-1.5"></div>
                            <div className="h-1.5 w-16 bg-gray-100 rounded"></div>
                          </div>
                          <div className="absolute top-[-15px] right-[-25px] w-24 h-16 bg-yellow-50 rounded-lg shadow-md border border-yellow-100 rotate-[8deg] group-hover:rotate-[4deg] transition-transform duration-300 flex flex-col p-2">
                            <div className="h-1.5 w-10 bg-yellow-200 rounded mb-1.5"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-sm font-medium bg-white/50 px-3 py-1 rounded-full backdrop-blur-sm">Empty Canvas</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Hover Overlay for Image Actions */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => handleImageClick(e, session.id)}
                    className="p-2 bg-white/90 hover:bg-white rounded-full text-gray-700 hover:text-black shadow-sm transition-transform hover:scale-105"
                    title="Upload Cover Image"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => handleGenerateImage(e, session)}
                    className={`p-2 bg-white/90 hover:bg-white rounded-full text-purple-600 hover:text-purple-700 shadow-sm transition-transform hover:scale-105 ${generatingImageFor === session.id ? 'animate-pulse' : ''}`}
                    title="Generate AI Background"
                    disabled={generatingImageFor === session.id}
                  >
                    {generatingImageFor === session.id ? <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Footer Info */}
              <div className="p-5 bg-white border-t border-gray-100 relative">
                <div className="flex items-start justify-between">
                  <div className="w-full">
                    <div className="flex items-center gap-2">
                      {/* Icon Slot */}
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-50 border border-gray-100 shrink-0 group/icon relative cursor-pointer overflow-hidden"
                        onClick={(e) => handleGenerateIcon(e, session)}
                        title="Click to generate 3D icon"
                      >
                        {generatingIconFor === session.id ? (
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : session.icon ? (
                          session.icon.startsWith('data:') || session.icon.startsWith('http') ? (
                            <img src={session.icon} alt="icon" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg leading-none">{session.icon}</span>
                          )
                        ) : (
                          <Smile className="w-4 h-4 text-gray-300" />
                        )}
                        {/* Hover Generation Hint */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/icon:opacity-100 flex items-center justify-center transition-opacity">
                          <Sparkles className="w-3 h-3 text-white drop-shadow-md" />
                        </div>
                      </div>

                      <h3 className="font-bold text-gray-800 truncate flex-1 group-hover:text-black transition-colors font-display text-lg" title={session.name}>
                        {session.name}
                      </h3>

                      {session.chatHistory && session.chatHistory.length > 0 && (
                        <div className="bg-blue-50 text-blue-500 rounded-full p-1 shrink-0" title="Has Chat History">
                          <MessageSquare className="w-3.5 h-3.5 fill-blue-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs font-medium text-gray-400 pl-10">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(session.lastModified).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <LayoutGrid className="w-3 h-3" />
                        {session.cards.length} items
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons (Visible on Hover) */}
                <div className="absolute right-3 bottom-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                  <button
                    onClick={(e) => openRenameModal(e, session)}
                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-colors"
                    title="Rename Session"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this session?')) {
                        onDelete(session.id);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title="Delete Session"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {sessions.length === 0 && (
          <div className="text-center mt-20 text-gray-400 font-medium">
            <p>No sessions found. Start by creating a new canvas!</p>
          </div>
        )}

        <CreationModal
          isOpen={renameModalOpen}
          type="session"
          initialValue={sessionToRename?.name}
          onClose={() => { setRenameModalOpen(false); setSessionToRename(null); }}
          onConfirm={handleRenameConfirm}
        />
      </div>
    </div>
  );
};