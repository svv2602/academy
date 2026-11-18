// The sheet of a cut-scene for the customer (WORLD-13): its frames in their order, each with the cat's line under it, one
// picture per scene. Made from the files the game ships (public/story/<frame>.webp) and the recorded text of each line
// (voice/phrases.json), in the order of the world's scenes (src/worlds/<world>/story.ts).
//
//   node tools/story-sheet.mjs [outDir] [world]      (default: shots-e2e, fairy) -> <outDir>/story-sheet-<scene>.png
//
// tools/shot.mjs makes the sheets of the first world next to the pictures of the frames (the size "mobile").
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 480, H = 268, GAP = 16, TEXT_H = 92, COLS = 3, FONT = 20, LINE_CHARS = 38;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The words of `text` in lines of at most LINE_CHARS signs (a longer word stands alone). */
export function wrap(text, max = LINE_CHARS) {
  const lines = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + w).length <= max) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  return lines;
}

/** The scenes of a world from its story.ts: [{ id, shots: [{ image, line }] }] in the order written. */
export function scenesOf(world = 'fairy') {
  const src = readFileSync(join(ROOT, 'src/worlds', world, 'story.ts'), 'utf8');
  const scenes = [];
  for (const m of src.matchAll(/\bid: '(story_[a-z0-9_]+)'|image: '([^']+)', line: '([^']+)'/g)) {
    if (m[1]) scenes.push({ id: m[1], shots: [] });
    else if (scenes.length) scenes.at(-1).shots.push({ image: m[2], line: m[3] });
  }
  return scenes.filter((s) => s.shots.length);
}

/** Writes one sheet per scene; returns their paths. */
export async function storySheets(outDir = 'shots-e2e', world = 'fairy') {
  const phrases = JSON.parse(readFileSync(join(ROOT, 'voice/phrases.json'), 'utf8'));
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const scene of scenesOf(world)) {
    const n = scene.shots.length, cols = Math.min(COLS, n), rows = Math.ceil(n / cols);
    const width = GAP + cols * (W + GAP), height = GAP + rows * (H + TEXT_H + GAP);
    const parts = [];
    for (const [i, s] of scene.shots.entries()) {
      const x = GAP + (i % cols) * (W + GAP), y = GAP + Math.floor(i / cols) * (H + TEXT_H + GAP);
      const text = phrases[s.line]?.[0];
      if (!text) throw new Error(`story-sheet: no recorded text for ${s.line} in voice/phrases.json`);
      parts.push({ input: await sharp(join(ROOT, 'public', `${s.image}.webp`)).resize(W, H).toBuffer(), left: x, top: y });
      const lines = wrap(`${i + 1}. ${text}`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${TEXT_H}">${lines.map((l, k) =>
        `<text x="4" y="${26 + k * (FONT + 6)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${FONT}" fill="#3b2a55">${esc(l)}</text>`).join('')}</svg>`;
      parts.push({ input: Buffer.from(svg), left: x, top: y + H });
    }
    const path = join(outDir, `story-sheet-${scene.id.replace('story_', '')}.png`);
    await sharp({ create: { width, height, channels: 3, background: '#fffaf2' } }).composite(parts).png().toFile(path);
    written.push(path);
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [outDir = 'shots-e2e', world = 'fairy'] = process.argv.slice(2);
  for (const p of await storySheets(outDir, world)) console.log(`story-sheet: ${p}`);
}
