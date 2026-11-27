import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { WORLDS_CACHE, buildWorlds, extraFiles, greyWorldFiles, worldChunkFile, worldGlobs, worldList, worldRoute } from './tools/vite-worlds.mjs';

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

// The probe world (src/worlds/probe/, TECH-15) is a test world: its files live in worlds-test/probe/, outside public/,
// under the paths the game asks for them (models/probe/…, story/probe/…). Only a build made with `--mode probe`
// (tools/worlds.mjs: `vite build --mode probe --outDir dist-probe`) lists the world in the registry
// (src/worlds/index.ts) and gets these files, at the same paths; the published build (`npm run build`) has neither.
const PROBE_MODE = 'probe';
const PROBE_FILES = 'worlds-test/probe';
function probeFiles(): Plugin {
  let from = PROBE_FILES;
  return {
    name: 'probe-world-files',
    apply: 'build',
    configResolved(config) { from = join(config.root, PROBE_FILES); },
    generateBundle() {
      for (const f of readdirSync(from, { recursive: true, withFileTypes: true })) {
        if (!f.isFile() || f.name === 'README.md') continue;
        const file = join(f.parentPath, f.name);
        this.emitFile({ type: 'asset', fileName: relative(from, file).split(sep).join('/'), source: readFileSync(file) });
      }
    },
  };
}

// The files of the next worlds of a build that lie outside public/ (tools/vite-worlds.mjs `greyWorldFiles`): every
// file of worlds-data/<id>/ of a next world of the build, put in under the path the world asks for (the forest's
// characters, models/forest/…, written there by tools/assets.mjs; the voice, voice/<id>/…, written there by
// tools/gen_voice.py - outside public/, which every build copies whole). The published build has the forest and the
// sea (published 2026-11-24), the Sweet Land (2026-11-26) and the Sky Islands (2026-11-27) and gets their files; a grey
// build (WORLD-12, `--mode grey`) has the same worlds now (a next world in its grey build is listed as `<id>: 'grey'`). A
// world's files from elsewhere (tools/vite-worlds.mjs WORLD_EXTRA_FILES: the sea's swimming clips, the probe world's
// copy) too, under its folder - models/sea/ counts them in the sea's own budget.
function worldFiles(next: string[], extra: Record<string, string>): Plugin {
  let root = '.';
  return {
    name: 'world-data-files',
    apply: 'build',
    configResolved(config) { root = config.root; },
    generateBundle() {
      for (const [fileName, from] of Object.entries(greyWorldFiles(next, extra, root))) this.emitFile({ type: 'asset', fileName, source: readFileSync(join(root, from)) });
    },
  };
}

// The next worlds of this build (TECH-09, decision Q14): every world of src/worlds/ after the first one; the probe
// world only in its own mode. The installation caches the core and the first world; the folders of a next world
// (models/<id>/, voice/<id>/, story/<id>/) stay out of the service worker's list, the build lists their files in
// worlds.json (tools/vite-worlds.mjs) and the service worker keeps them in the cache "worlds": a file is put there
// when the page first asks for it, and by the download in the background while the previous world is played
// (src/core/worldcache.ts). A build without a next world would get none of this; the published game has the forest.
export default defineConfig(({ mode }) => {
  // the forest, the sea, the Sweet Land and the Sky Islands in every build (src/worlds/index.ts); the probe world in its own
  const next = buildWorlds(mode, { [PROBE_MODE]: PROBE_MODE });
  const list = worldList(next);
  const route = worldRoute(next);
  return {
    base: './',
    define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)), __BUILD_COMMIT__: JSON.stringify(commit()) },
    // Three.js goes into a chunk of its own: with the game's code in one file that file neared the limit of 1 MB a
    // file (tools/dist-size.mjs), and the library changes far less often than the game - an update of the game leaves
    // its chunk in the cache of the phone.
    build: {
      target: 'es2022', chunkSizeWarningLimit: 1200,
      // A next world's chunk lies in its own folder, code/<id>/ (tools/vite-worlds.mjs `worldChunkFile`): downloaded with
      // the world, not precached with the core (decision of 2026-11-24, «вариант Б»).
      rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] }, chunkFileNames: worldChunkFile(next) } },
    },
    plugins: [
      ...(mode === PROBE_MODE ? [probeFiles()] : []),
      worldFiles(next, extraFiles(next)),
      // After the plugin above: the list is made of the files it emits and of the ones under public/.
      list,
      VitePWA({
        // A new version is taken at the next launch, never in the middle of a game (TECH-13): the new worker installs and
        // waits (registerType 'prompt', skipWaiting: false). It takes over when every page of the game is closed, or
        // earlier from the start screen before "Play": src/core/update.ts sends it SKIP_WAITING (the listener workbox
        // writes into sw.js) when no other page of the game answers, and reloads the page once. clientsClaim: true lets
        // the very first worker take the page that installed it, without that the offline walkthrough would wait for a
        // controller. tools/update.mjs (the step "update" of npm run e2e) checks it.
        registerType: 'prompt',
        includeAssets: ['icon.svg'],
        // Every file type the game page requests must be listed here, or the installed game breaks without network.
        // The set is measured, not guessed: it is the types requested during the walkthroughs of `npm run e2e`
        // (js, css, html, glb, mp3, svg, png, webp — the models reference external webp textures), and the
        // desktop walkthrough of that command is played offline, so a missing type fails it. The largest file is
        // under 1 MB (tools/assets.test.mjs holds the models to that); a file above the limit here would be left out
        // of the cache with only a build warning.
        // The bank of the old game's clips (public/bank/, tools/import_old_voice.py) is not part of the first load (R37):
        // a clip of it is fetched when first played, never with the installation, and kept from then on (the cache
        // "bank": the first answer in full is kept, later plays and plays without network are served from it, the byte
        // ranges the player asks for cut from it). src/core/voice.ts `sayBank` downloads it in full before it plays and,
        // without network, asks this cache first: a clip not kept yet gives way to the general question, no request leaves.
        // A next world (TECH-09) is not part of the first load either: its folders are left out of the list, the list of
        // its files (worlds.json) is added to it, and its files are kept in the cache "worlds" - the first answer in
        // full, as for the bank; the game's download in the background fills the same cache under the same addresses.
        workbox: { globPatterns: ['**/*.{js,css,html,glb,mp3,svg,png,webp}'], globIgnores: ['bank/**', ...worldGlobs(next)], maximumFileSizeToCacheInBytes: 4_000_000,
          clientsClaim: true, skipWaiting: false,
          manifestTransforms: [list.api.precache],
          runtimeCaching: [{
            urlPattern: /\/bank\/[^/]+\.mp3$/, handler: 'CacheFirst',
            options: { cacheName: 'bank', cacheableResponse: { statuses: [200] }, rangeRequests: true, expiration: { maxEntries: 400 } },
          }, ...(route ? [{
            urlPattern: route, handler: 'CacheFirst' as const,
            options: { cacheName: WORLDS_CACHE, cacheableResponse: { statuses: [200] }, rangeRequests: true },
          }] : [])] },
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
  };
});
