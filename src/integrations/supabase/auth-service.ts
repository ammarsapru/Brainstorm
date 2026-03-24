// Auth service integration with Supabase

import { supabase } from '../../../lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const checkSupabaseConfig = () => {
    if (!supabase) {
        throw new Error('Supabase is not configured. Please check your environment variables.');
    }
};

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
        // Construct the proper redirect URL using the current window path
        const redirectUrl = window.location.origin + window.location.pathname;
        
        const { data, error } = await supabase!.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl
            }
        });
        if (error) throw error;
        return data;
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
