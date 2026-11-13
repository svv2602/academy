import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: unit tests do not need the PWA plugin or the build settings.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs'],
    environment: 'node',
  },
});
