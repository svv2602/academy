import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: unit tests do not need the PWA plugin or the build settings.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs'],
    environment: 'node',
    // Holds the deal of the day, so that no price in a test depends on the date of the run (src/test-setup.ts).
    setupFiles: ['src/test-setup.ts'],
    // Hosted CI runners give Node about 4 GB of heap, a developer machine may give more. The cap makes a test
    // that hoards memory fail here first, not only after a push.
    execArgv: ['--max-old-space-size=1024'],
  },
});
