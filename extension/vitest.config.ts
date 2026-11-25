import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@flowread/core': path.resolve(__dirname, '../packages/core/src') } },
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
