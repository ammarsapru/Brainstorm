
import React, { useState } from 'react';
import { Mail, Lock, LogIn, ArrowRight } from 'lucide-react';
import { authService } from '../src/integrations/supabase/auth-service';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginInternal?: () => void; // Fallback for demo
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginInternal }) => {
    const [view, setView] = useState<'login' | 'signup' | 'magic'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            await authService.signInWithGoogle();
            // Redirect happens automatically
        } catch (e: any) {
            setError(e.message);
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);
        setLoading(true);

        try {
            if (view === 'login') {
                await authService.signInWithPassword(email, password);
                onClose();
            } else if (view === 'signup') {
                await authService.signUp(email, password);
                setMessage('Check your email for the confirmation link.');
            } else if (view === 'magic') {
                await authService.signInWithOtp(email);
                setMessage('Check your email for the magic link.');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center mx-auto mb-4 text-xl font-bold font-sans">B</div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {view === 'login' ? 'Welcome back' : view === 'signup' ? 'Create an account' : 'Magic Link'}
                        </h2>
                        <p className="text-gray-500 mt-2 text-sm">Sign in to sync your brainstorming.</p>
                    </div>

                    {/* Google Button */}
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-medium p-3 rounded-xl hover:bg-gray-50 transition-colors mb-6"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.99l3.66-2.82z" fill="#FBBC05" /><path d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.01l3.66 2.82c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                        Continue with Google
                    </button>

                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or continue with email</span></div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-700 ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 transition-all text-sm"
                                    placeholder="name@example.com"
                                />
                            </div>
                        </div>

                        {view !== 'magic' && (
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-gray-700 ml-1">Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-black/5 focus:border-black/20 transition-all text-sm"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                        )}

                        {error && <div className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</div>}
                        {message && <div className="text-xs text-green-600 bg-green-50 p-2 rounded-lg font-medium">{message}</div>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-black text-white font-bold py-3 rounded-xl hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                        >
                            {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : (
                                <>
                                    {view === 'login' ? 'Sign In' : view === 'signup' ? 'Sign Up' : 'Send Magic Link'}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="bg-gray-50 p-4 text-center text-xs font-medium text-gray-500 border-t border-gray-100 flex justify-center gap-4">
                    {view === 'login' && (
                        <>
                            <button onClick={() => setView('signup')} className="hover:text-black">Create account</button>
                            <span>•</span>
                            <button onClick={() => setView('magic')} className="hover:text-black">Forgot password?</button>
                        </>
                    )}
                    {view === 'signup' && (
                        <button onClick={() => setView('login')} className="hover:text-black">Already have an account? Sign In</button>
                    )}
                    {view === 'magic' && (
                        <button onClick={() => setView('login')} className="hover:text-black">Back to Sign In</button>
                    )}
                </div>

            </div>
        </div>
    );
};
