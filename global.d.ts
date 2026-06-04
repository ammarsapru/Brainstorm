declare module '*.css';

interface AppRuntimeEnv {
	VITE_SUPABASE_URL?: string;
	VITE_SUPABASE_ANON_KEY?: string;
}

interface Window {
	__APP_ENV__?: AppRuntimeEnv;
}
