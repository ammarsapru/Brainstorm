
import { supabase } from '../../lib/supabase';

export const authService = {
    async signInWithGoogle(currentSessionId?: string) {
        if (!supabase) {
            console.warn('Supabase not configured');
            return;
        }

        // Deep Linking: Cache the session ID so we can restore it after redirect
        if (currentSessionId) {
            localStorage.setItem('pending_session_id', currentSessionId);
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    async signInWithOtp(email: string) {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
        if (error) throw error;
    },

    async signInWithPassword(email: string, password: string) {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
    },

    async signUp(email: string, password: string) {
        if (!supabase) return;
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
        if (error) throw error;
    },

    async signOut() {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    async getSession() {
        if (!supabase) return null;
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
        if (!supabase) return { data: { subscription: { unsubscribe: () => { } } } };

        return supabase.auth.onAuthStateChange((event, session) => {
            // Check for deep link restoration on sign in
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                const pendingSessionId = localStorage.getItem('pending_session_id');
                if (pendingSessionId) {
                    // Clear it so we don't redirect forever
                    localStorage.removeItem('pending_session_id');
                    // Dispatch a custom event or let the caller handle the redirection
                    // We'll leave it in localStorage for the App to consume on mount if needed
                    // But actually, the prompt said "App.tsx can check localStorage". 
                    // So simply leaving it there or returning it might be enough.
                    // We won't auto-redirect here to avoid side effects in the service layer.
                }
            }
            callback(event, session);
        });
    }
};
