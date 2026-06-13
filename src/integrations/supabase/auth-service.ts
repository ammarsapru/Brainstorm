// Auth service integration with Supabase

import { supabase } from '../../../lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const checkSupabaseConfig = () => {
    if (!supabase) {
        throw new Error('Supabase is not configured. Please check your environment variables.');
    }
};

const isElectronRuntime = () => {
    if (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')) return true;
    return typeof window !== 'undefined' && !!(window as any).process?.versions?.electron;
};

const getGoogleOAuthRedirectUrl = () => {
    const electron = isElectronRuntime();

    if (electron) {
        const configuredOrigin = import.meta.env.VITE_ELECTRON_OAUTH_REDIRECT_ORIGIN?.trim();
        const fallbackOrigin = window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://')
            ? window.location.origin
            : '';
        const baseOrigin = (configuredOrigin || fallbackOrigin).replace(/\/$/, '');

        if (!baseOrigin) {
            throw new Error('Electron Google sign-in requires VITE_ELECTRON_OAUTH_REDIRECT_ORIGIN to be set to a hosted http(s) origin.');
        }

        return `${baseOrigin}/callback-electron.html`;
    }

    // Web, Docker, and npm dev should keep the normal in-app redirect behavior.
    return window.location.origin + window.location.pathname;
};

export const isElectronRuntimeEnvironment = isElectronRuntime;

export const authService = {
    signInWithPassword: async (email: string, password: string) => {
        checkSupabaseConfig();
        const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    signUp: async (email: string, password: string) => {
        checkSupabaseConfig();
        const { data, error } = await supabase!.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    signInWithOtp: async (email: string) => {
        checkSupabaseConfig();
        const { data, error } = await supabase!.auth.signInWithOtp({ email });
        if (error) throw error;
        return data;
    },

    signInWithGoogle: async () => {
        checkSupabaseConfig();
        const electron = isElectronRuntime();
        const redirectUrl = getGoogleOAuthRedirectUrl();

        // Always skip Supabase's internal redirect so we control navigation explicitly.
        // This lets us detect a null URL and surface an error instead of silently hanging.
        const { data, error } = await supabase!.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                skipBrowserRedirect: true,
            }
        });
        if (error) throw error;
        if (!data.url) throw new Error('Could not generate sign-in URL. Check your Supabase configuration.');
        return {
            url: data.url,
            redirectUrl,
            shouldOpenExternal: electron,
        };
    },

    signOut: async () => {
        checkSupabaseConfig();
        const { error } = await supabase!.auth.signOut();
        if (error) throw error;
    },

    getCurrentUser: async () => {
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
        return supabase.auth.onAuthStateChange(callback);
    }
};
