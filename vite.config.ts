import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The version shown in the parents' section (TECH-10): the day of the build and the short commit number, nothing
// else. Sources without git (an archive) still build: the number is then the placeholder. tools/e2e.mjs works the
// number out the same way and the walkthrough compares it with the one on the screen.
const NO_COMMIT = 'no-git';
function commit(): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : NO_COMMIT;
  } catch { return NO_COMMIT; }
}

export default defineConfig({
  base: './',
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)), __BUILD_COMMIT__: JSON.stringify(commit()) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // Every file type the game page requests must be listed here, or the installed game breaks without network.
      // The set is measured, not guessed: it is the types requested during the walkthroughs of `npm run e2e`
      // (js, css, html, glb, mp3, svg, png, webp — the models reference external webp textures), and the
      // desktop walkthrough of that command is played offline, so a missing type fails it. The largest file is
      // under 1 MB (tools/assets.test.mjs holds the models to that); a file above the limit here would be left out
      // of the cache with only a build warning.
      workbox: { globPatterns: ['**/*.{js,css,html,glb,mp3,svg,png,webp}'], maximumFileSizeToCacheInBytes: 4_000_000 },
      manifest: {
        name: 'Академія чарівних світів',
        short_name: 'Академія',
        lang: 'uk',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#bfe6ff',
        theme_color: '#8fd0ff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
