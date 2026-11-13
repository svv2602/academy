import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,glb,mp3,svg,png}'], maximumFileSizeToCacheInBytes: 4_000_000 },
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
