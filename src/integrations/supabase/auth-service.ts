// Auth service integration with Supabase

import { supabase } from '../../../lib/supabase';

export const authService = {
    signInWithPassword: async (email: string, password: string) => {
        if (!supabase) {
            throw new Error('Supabase is not configured. Please check your environment variables.');
        }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    signUp: async (email: string, password: string) => {
        if (!supabase) {
            throw new Error('Supabase is not configured. Please check your environment variables.');
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    },

    signInWithOtp: async (email: string) => {
        if (!supabase) {
            throw new Error('Supabase is not configured. Please check your environment variables.');
        }
        const { data, error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        return data;
    },

    signInWithGoogle: async () => {
        if (!supabase) {
            throw new Error('Supabase is not configured. Please check your environment variables.');
        }
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
        return data;
    },

    signOut: async () => {
        if (!supabase) {
            throw new Error('Supabase is not configured. Please check your environment variables.');
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    getCurrentUser: async () => {
        if (!supabase) return null;
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange: (callback: (event: string, session: any) => void) => {
        if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
        return supabase.auth.onAuthStateChange(callback);
    }
};
