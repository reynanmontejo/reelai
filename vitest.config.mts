import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { 'server-only': fileURLToPath(new URL('./tests/unit/server-only.ts', import.meta.url)) },
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    clearMocks: true,
  },
});
