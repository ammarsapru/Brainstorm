/// <reference types="vite/client" />
declare module '*.css';

interface AppRuntimeEnv {
	VITE_SUPABASE_URL?: string;
	VITE_SUPABASE_ANON_KEY?: string;
	VITE_DISABLE_SUPABASE?: string;
}

interface Window {
	__APP_ENV__?: AppRuntimeEnv;
}
