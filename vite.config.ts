import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves from /Brainstorm/ — all other targets (Docker, Electron, dev) use ./
const base = process.env.GITHUB_PAGES === 'true' ? '/Brainstorm/' : './';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
    },
    base,
    plugins: [
      react()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
