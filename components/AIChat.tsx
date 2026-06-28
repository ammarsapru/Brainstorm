import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, User, ChevronDown, Paperclip, Image as ImageIcon, File, Check, Copy, Settings, Sparkles } from 'lucide-react';
import { ChatMessage, ChatAttachment } from '../types';
import { uploadFileToS3 } from '../lib/supabase';
import debugLog from '../utils/debugLog';
import { LLM_MODELS, LLMModel, getModelById } from '../utils/llmModels';
import { ProviderIcon } from './LLMIcons';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface AIChatProps {
    history: ChatMessage[];
    onSendMessage: (text: string, attachments: ChatAttachment[], modelId: string) => Promise<void>;
    isProcessing: boolean;
    onSettingsClick: () => void;
    selectedModelId: string;
    onModelChange: (modelId: string) => void | Promise<void>;
}

export const AIChat = React.memo<AIChatProps>(({
    history,
    onSendMessage,
    isProcessing,
    onSettingsClick,
    selectedModelId,
    onModelChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [width, setWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyMessage = React.useCallback((id: string, text: string) => {
        const markCopied = () => { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(markCopied).catch(markCopied);
        } else {
            markCopied();
        }
    }, []);

    const selectedModel = getModelById(selectedModelId);

    const startResizing = React.useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsResizing(true);
    }, []);

    const handleResizeMove = React.useCallback((e: React.PointerEvent) => {
        if (!isResizing) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 300 && newWidth < Math.min(900, window.innerWidth - 50)) {
            setWidth(newWidth);
        }
    }, [isResizing]);

    const stopResizing = React.useCallback(() => setIsResizing(false), []);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const renderedHistory = useMemo(() => {
        return history.map(msg => {
            const isCopied = copiedId === msg.id;
            const isUser = msg.role === 'user';
            return (
                <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser
                            ? 'bg-slate-700 text-white'
                            : 'bg-white border border-slate-200 text-violet-600 shadow-sm'
                    }`}>
                        {isUser
                            ? <User className="w-4 h-4" />
                            : <ProviderIcon provider={getModelById(msg.model || selectedModelId).provider} className="w-4 h-4" />}
                    </div>
                    <div className={`flex flex-col gap-1 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
                        {msg.attachments?.map(att => (
                            <div key={att.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                                {att.type === 'image' ? (
                                    <img src={att.url} alt={att.name} className="max-w-[200px] max-h-32 object-cover" />
                                ) : (
                                    <div className="px-3 py-2 flex items-center gap-2 text-xs text-slate-600">
                                        <File className="w-4 h-4" />
                                        {att.name}
                                    </div>
                                )}
                            </div>
                        ))}
                        {msg.text && (
                            <div className={`relative rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                isUser
                                    ? 'bg-slate-800 text-white rounded-tr-md pb-8'
                                    : msg.isHandoff
                                      ? 'bg-violet-50 border border-violet-200 text-violet-950 rounded-tl-md'
                                      : 'bg-white border border-slate-100 text-slate-800 rounded-tl-md pb-8'
                            }`}>
                                {msg.role === 'model' && !msg.isHandoff ? (
                                    <div
                                        className="prose prose-sm max-w-none prose-slate prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-violet-700 prose-code:bg-violet-50 prose-code:rounded prose-code:px-1 prose-headings:text-slate-800"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.text) as string) }}
                                    />
                                ) : (
                                    <span className="whitespace-pre-wrap">{msg.text}</span>
                                )}
                                {!msg.isHandoff && (
                                    <button
                                        onClick={() => copyMessage(msg.id, msg.text)}
                                        title="Copy message"
                                        className={`absolute bottom-1.5 ${isUser ? 'left-2' : 'right-2'} p-1 rounded-md transition-colors ${
                                            isCopied
                                                ? isUser ? 'text-green-400' : 'text-green-500'
                                                : isUser ? 'text-slate-400 hover:text-slate-200 hover:bg-white/10' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                                        }`}
                                    >
                                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                )}
                            </div>
                        )}
                        {msg.role === 'model' && msg.model && (
                            <span className="text-[10px] text-slate-400 px-1">{getModelById(msg.model).name}</span>
                        )}
                    </div>
                </div>
            );
        });
    }, [history, selectedModelId, copiedId, copyMessage]);

    useEffect(() => {
        if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, isOpen, isProcessing]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!input.trim() && attachments.length === 0) || isProcessing) return;
        const msg = input;
        const currentAttachments = [...attachments];
        try {
            await onSendMessage(msg, currentAttachments, selectedModelId);
            setInput('');
            setAttachments([]);
        } catch (err) {
            debugLog.warn('AIChat', 'Message send failed', err);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const url = await uploadFileToS3(file);
            if (url) {
                setAttachments(prev => [...prev, {
                    id: crypto.randomUUID(),
                    type,
                    url,
                    name: file.name,
                    mimeType: file.type,
                }]);
            }
        }
        e.target.value = '';
    };

    const renderModelOption = (model: LLMModel) => (
        <button
            key={model.id}
            onClick={() => {
              setIsModelMenuOpen(false);
              void Promise.resolve(onModelChange(model.id));
            }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center justify-between ${
                selectedModelId === model.id
                    ? 'bg-violet-100 text-violet-900'
                    : 'text-slate-700 hover:bg-slate-50'
            }`}
        >
            <div className="flex items-center gap-3">
                <ProviderIcon provider={model.provider} className="w-5 h-5 shrink-0" />
                <div>
                    <div className="font-medium">{model.name}</div>
                    <div className="text-[10px] text-slate-400">{model.providerLabel}</div>
                </div>
            </div>
            {selectedModelId === model.id && <Check className="w-4 h-4 text-violet-600" />}
        </button>
    );

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                
                className={`fixed top-36 z-[70] w-11 h-11 flex items-center justify-center rounded-2xl shadow-lg border transition-all duration-300 ${
                    isOpen
                        ? 'translate-x-full opacity-0 pointer-events-none'
                        : 'right-4 bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-violet-500/30 hover:shadow-violet-500/25 opacity-100'
                }`}
                title="Open AI Chat"
            >
                <Sparkles className="w-5 h-5" />
            </button>

            <div
                className={`fixed right-0 top-0 h-full z-[70] flex flex-col shadow-2xl border-l border-slate-200/80 transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
                style={{
                    width: `${width}px`,
                    background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                }}
            >
                <div
                    onPointerDown={startResizing}
                    onPointerMove={handleResizeMove}
                    onPointerUp={stopResizing}
                    onPointerCancel={stopResizing}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-50 hover:bg-violet-300/40 touch-none"
                />

                <div className="shrink-0 px-4 py-3 border-b border-slate-200/80 bg-white/80 backdrop-blur-md flex items-center justify-between relative z-30">
                    <div className="flex items-center gap-3 relative">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800 text-sm">Canvas AI</h3>
                            <button
                                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                                className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 font-medium mt-0.5"
                            >
                                <ProviderIcon provider={selectedModel.provider} className="w-3.5 h-3.5" />
                                <span>{selectedModel.name}</span>
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={onSettingsClick}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-violet-600"
                            title="API keys"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {isModelMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-[80]" onClick={() => setIsModelMenuOpen(false)} />
                            <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-[90] max-h-80 overflow-y-auto">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">Google</p>
                                {LLM_MODELS.filter(m => m.provider === 'google').map(renderModelOption)}
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mt-2">OpenAI</p>
                                {LLM_MODELS.filter(m => m.provider === 'openai').map(renderModelOption)}
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 mt-2">Anthropic</p>
                                {LLM_MODELS.filter(m => m.provider === 'anthropic').map(renderModelOption)}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 relative z-0">
                    {history.length === 0 && (
                        <div className="text-center mt-16 px-6">
                            <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mx-auto mb-4">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                Ask about your board, summarize ideas, or let the agent create and connect cards for you.
                            </p>
                        </div>
                    )}
                    {renderedHistory}
                    {isProcessing && (
                        <div className="flex gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                                <ProviderIcon provider={selectedModel.provider} className="w-4 h-4" />
                            </div>
                            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-md px-4 py-3 flex gap-1 shadow-sm">
                                {[0, 150, 300].map(delay => (
                                    <span
                                        key={delay}
                                        className="w-2 h-2 bg-violet-400 rounded-full animate-bounce"
                                        style={{ animationDelay: `${delay}ms` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="shrink-0 border-t border-slate-200/80 bg-white/90 backdrop-blur p-3">
                    {attachments.length > 0 && (
                        <div className="flex gap-2 pb-2 overflow-x-auto">
                            {attachments.map(att => (
                                <div key={att.id} className="relative shrink-0 w-14 h-14 rounded-lg border border-slate-200 overflow-hidden">
                                    {att.type === 'image' ? (
                                        <img src={att.url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-slate-50">
                                            <File className="w-5 h-5 text-slate-400" />
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
                        <div className="flex gap-0.5 pb-1">
                            <button type="button" onClick={() => document.getElementById('ai-chat-img')?.click()} className="p-2 text-slate-400 hover:text-violet-600 rounded-lg">
                                <ImageIcon className="w-5 h-5" />
                            </button>
                            <button type="button" onClick={() => document.getElementById('ai-chat-file')?.click()} className="p-2 text-slate-400 hover:text-violet-600 rounded-lg">
                                <Paperclip className="w-5 h-5" />
                            </button>
                        </div>
                        <input id="ai-chat-img" type="file" className="hidden" accept="image/*" onChange={e => handleFileSelect(e, 'image')} />
                        <input id="ai-chat-file" type="file" className="hidden" onChange={e => handleFileSelect(e, 'file')} />
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Message your canvas..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 outline-none"
                        />
                        <button
                            type="submit"
                            disabled={(!input.trim() && attachments.length === 0) || isProcessing}
                            className="p-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-40 mb-0.5"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
});
