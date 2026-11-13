import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: unit tests do not need the PWA plugin or the build settings.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs'],
    environment: 'node',
    // Hosted CI runners give Node about 4 GB of heap, a developer machine may give more. The cap makes a test
    // that hoards memory fail here first, not only after a push.
    execArgv: ['--max-old-space-size=1024'],
  },
});
