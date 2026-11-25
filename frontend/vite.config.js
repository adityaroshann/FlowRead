import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../packages/core/src', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Shared, framework-free code (profiles, doc model, checker, bold word starts).
    alias: { '@flowread/core': core },
  },
  server: {
    // packages/core lives outside this folder.
    fs: { allow: ['..'] },
  },
});
