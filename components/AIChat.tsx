import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, ChevronDown, Paperclip, Image as ImageIcon, File, Check, Copy, CheckCircle2, Settings } from 'lucide-react';
import { ChatMessage, ChatAttachment } from '../types';

interface AIChatProps {
    history: ChatMessage[];
    onSendMessage: (text: string, attachments: ChatAttachment[], modelId: string) => Promise<void>;
    isProcessing: boolean;
    onSettingsClick: () => void;
}

const MODELS = [
    { 
        id: 'gemini-3-flash', 
        name: 'Gemini 2.0 Flash', 
        provider: 'Google', 
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-black"><path d="M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9M21 12c0-4.97-4.03-9-9-9" /></svg> 
    },
    { 
        id: 'gemini-3-pro', 
        name: 'Gemini 2.0 Pro', 
        provider: 'Google', 
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-black"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg> 
    },
    { 
        id: 'gpt-4o', 
        name: 'GPT-4o', 
        provider: 'OpenAI', 
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-black"><path d="M12 2a10 10 0 1 0 10 10H12V2zM12 12L4.93 4.93M12 12l7.07 7.07M12 12l-7.07 7.07M12 12l7.07-7.07" /></svg> 
    },
    { 
        id: 'claude-3-5-sonnet', 
        name: 'Claude 3.5 Sonnet', 
        provider: 'Anthropic', 
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-black"><path d="M20 12h-8M12 4v16M4 12h8" /><circle cx="12" cy="12" r="8" /></svg> 
    },
];

export const AIChat = React.memo<AIChatProps>(({ history, onSendMessage, isProcessing, onSettingsClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [selectedModel, setSelectedModel] = useState(MODELS[0]);
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [history, isOpen, attachments]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && attachments.length === 0) || isProcessing) return;

        const msg = input;
        const currentAttachments = [...attachments];
        const modelId = selectedModel.id;

        setInput('');
        setAttachments([]);
        await onSendMessage(msg, currentAttachments, modelId);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (ev.target?.result) {
                    const newAttachment: ChatAttachment = {
                        id: Math.random().toString(36).substr(2, 9),
                        type,
                        url: ev.target.result as string,
                        name: file.name,
                        mimeType: file.type
                    };
                    setAttachments(prev => [...prev, newAttachment]);
                }
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <>
            {/* Floating Toggle Button - Always visible, higher z-index */}
            {/* Floating Toggle Button - Only visible when chat is closed */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed top-36 z-[70] pointer-events-auto w-10 h-10 flex items-center justify-center rounded-xl shadow-md border transition-all duration-300 font-bold text-xs shrink-0 ${isOpen
                    ? 'translate-x-full opacity-0 pointer-events-none' // Hide when open
                    : 'right-4 bg-white/90 backdrop-blur-sm text-black border-gray-200 hover:bg-gray-50 hover:border-gray-300 translate-x-0 opacity-100'
                    }`}
                title="Open AI Chat"
            >
                AI
            </button>

            {/* Chat Panel - Full height sidebar */}
            <div
                className={`fixed right-0 top-0 h-full z-[70] pointer-events-auto w-80 sm:w-[450px] bg-black shadow-2xl border-l border-zinc-800 overflow-hidden transition-transform duration-300 ease-in-out flex flex-col ${isOpen
                    ? 'translate-x-0'
                    : 'translate-x-full'
                    }`}
            >
                {/* Header with Model Selector */}
                <div className="p-3 border-b border-gray-100 bg-white flex items-center justify-between relative z-20">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center text-white">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 text-xs">AI Assistant</h3>
                            <button
                                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded -ml-1.5 transition-colors"
                            >
                                <span>{selectedModel.name}</span>
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center">
                        {/* Settings Button */}
                        <button
                            onClick={onSettingsClick}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-blue-600 mr-1"
                            title="API Keys & Settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {/* Close Button */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-black"
                            title="Close Chat"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Model Dropdown */}
                    {isModelMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setIsModelMenuOpen(false)}></div>
                            <div className="absolute top-12 left-4 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-20 animate-in fade-in zoom-in duration-200">
                                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 py-1.5">Select Model</div>
                                {MODELS.map(model => (
                                    <button
                                        key={model.id}
                                        onClick={() => { setSelectedModel(model); setIsModelMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between group ${selectedModel.id === model.id ? 'bg-zinc-100 text-black' : 'text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span>{model.icon}</span>
                                            <div>
                                                <div className="font-medium">{model.name}</div>
                                                <div className="text-[10px] text-gray-400">{model.provider}</div>
                                            </div>
                                        </div>
                                        {selectedModel.id === model.id && <Check className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black no-scrollbar">
                    {history.length === 0 && (
                        <div className="text-center mt-12 text-gray-400 text-sm px-8">
                            <p>Hi! I can help you brainstorm, summarize, or answer questions about your notes.</p>
                        </div>
                    )}
                    {history.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-white text-black'
                                }`}>
                                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>
                            <div className={`flex flex-col gap-1 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                {/* Attachments Display */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-1 justify-end">
                                        {msg.attachments.map(att => (
                                            <div key={att.id} className="relative group overflow-hidden rounded-lg border border-gray-200 bg-white">
                                                {att.type === 'image' ? (
                                                    <img src={att.url} alt={att.name} className="w-32 h-24 object-cover" />
                                                ) : (
                                                    <div className="w-32 h-24 flex flex-col items-center justify-center bg-gray-50 p-2">
                                                        <File className="w-8 h-8 text-gray-400 mb-1" />
                                                        <span className="text-[10px] text-gray-600 text-center line-clamp-2 break-all">{att.name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Text Message */}
                                {msg.text && (
                                    <div className={`group relative rounded-2xl px-4 py-2 text-sm shadow-sm select-text ${msg.role === 'user'
                                        ? 'bg-zinc-800 text-white rounded-tr-none'
                                        : 'bg-white border border-zinc-200 text-black rounded-tl-none pr-8'
                                        }`}>
                                        {msg.text}
                                        {msg.role === 'model' && (
                                            <button
                                                onClick={() => handleCopy(msg.text)}
                                                className="absolute top-2 right-2 p-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Copy"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Model Badge */}
                                {msg.role === 'model' && msg.model && (
                                    <div className="text-[10px] text-gray-400 px-1">{msg.model}</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isProcessing && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4" />
                            </div>
                            <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="bg-black border-t border-zinc-800 p-2">

                    {/* Pending Attachments */}
                    {attachments.length > 0 && (
                        <div className="flex gap-2 px-2 pb-2 overflow-x-auto no-scrollbar">
                            {attachments.map(att => (
                                <div key={att.id} className="relative shrink-0 w-16 h-16 rounded-lg border border-gray-200 overflow-hidden group">
                                    {att.type === 'image' ? (
                                        <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                                            <File className="w-6 h-6 text-gray-400" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => removeAttachment(att.id)}
                                        className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
                        <div className="flex gap-1 pb-2 pl-1">
                            <button
                                type="button"
                                onClick={() => imageInputRef.current?.click()}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                title="Upload Image"
                            >
                                <ImageIcon className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                title="Upload File"
                            >
                                <Paperclip className="w-5 h-5" />
                            </button>
                        </div>

                        <input
                            type="file"
                            ref={imageInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFileSelect(e, 'image')}
                        />
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={(e) => handleFileSelect(e, 'file')}
                        />

                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={attachments.length > 0 ? "Add a message..." : "Type a message..."}
                            className="flex-1 bg-zinc-900 border-none rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-zinc-700 outline-none mb-1"
                        />
                        <button
                            type="submit"
                            disabled={(!input.trim() && attachments.length === 0) || isProcessing}
                            className="p-3 bg-white text-black rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mb-1"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
});