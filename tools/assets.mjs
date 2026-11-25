// The asset pipeline: npm run assets
//
// Reads the source models from models-src/ (never shipped) and writes what the game downloads into public/models/
// under the same relative paths - but a next world's (TECH-09, decision Q14: models-src/<id>/ of a world that is not the
// first one nor the installation's) goes to worlds-data/<id>/models/<id>/, outside public/: public/ is copied into
// every build, and a world's models belong only to a build that has the world (vite.config.ts `worldFiles` puts
// worlds-data/<id>/ into it under models/<id>/, the path the game asks for):
//   - geometry and animation: EXT_meshopt_compression. Nothing is quantized, simplified or resampled — every float
//     the loader reads is bit-identical to the source, so src/core/assets.ts needs the decoder and nothing else.
//     Unindexed models are welded first (identical vertices only), then vertices are reordered for the codec;
//   - textures: WebP, longest side at most MAX_TEXTURE, always a separate file <model dir>/tex/<name>.webp that the
//     .glb references by relative URI (models share them and no .glb carries megabytes of images). Colour maps are
//     lossy (quality COLOR_QUALITY, alpha lossless); normal and other data maps are lossless. Colour under
//     transparent texels is kept (`exact`): the leaf textures are edge-bled on purpose, see tools/usd2glb.py.
// public/models/ and every worlds-data/<id>/models/ are rebuilt from scratch on every run and the output is
// byte-reproducible on one machine: a second run changes nothing. The script fails if a file exceeds MAX_FILE, the core
// (public/models/) exceeds MAX_TOTAL or a next world's models exceed MAX_WORLD (tools/dist-size.mjs); the same limits
// are checked by tools/assets.test.mjs in `npm test`.
//
//   node tools/assets.mjs [--check]     --check: build in memory, write nothing, fail if the output differs
//
// Adding a model: put the source .glb into models-src/, npm run assets, npm run e2e -- --update-models.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, reorder, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_WORLD, installedWorlds, sourceWorlds } from './dist-size.mjs';
import { WORLDS_DATA } from './vite-worlds.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SRC_DIR = 'models-src';
export const OUT_DIR = 'public/models';
/** The next worlds' own files, outside public/: worlds-data/<id>/ holds them at their paths in the build (models/<id>/…). */
export { WORLDS_DATA };
/** Longest side of a shipped texture, pixels (docs/15-tech.md, TECH-02). */
export const MAX_TEXTURE = 1024;
/** sharp resize options that bring any image within MAX_TEXTURE and never enlarge it. */
export const FIT = { width: MAX_TEXTURE, height: MAX_TEXTURE, fit: 'inside', withoutEnlargement: true };
/** One shipped file, bytes (docs/15-tech.md, "Бюджет": one file up to 1 MB). */
export const MAX_FILE = 1_000_000;
/** All of public/models (the core with the first world), bytes: the 12 MB first-load budget minus code, voice and headroom for both. */
export const MAX_TOTAL = 10_000_000;
/** WebP quality of colour maps: 40 dB PSNR or better on every texture of the first world. */
export const COLOR_QUALITY = 90;

/**
 * Where a model made with a service came from, written into the shipped file as glTF `asset.copyright` and
 * `asset.extras.source` (CREDITS.md has the same in words). Meshy's terms (https://www.meshy.ai/terms-of-use, §2.4)
 * ask not to remove the marks of generation from its output; its textured models carry none, its rigged ones only
 * the data of the skeleton, and Blender and this pipeline write their own `asset` - so the record is put back here.
 */
function forest(generated, rest) {
  return {
    copyright: `Generated with Meshy (https://www.meshy.ai) on a paid plan on ${generated}; ${rest}`,
    source: { tool: 'Meshy', url: 'https://www.meshy.ai', plan: 'paid', generated, terms: 'https://www.meshy.ai/terms-of-use', credits: 'CREDITS.md' },
  };
}
export const PROVENANCE = {
  'extra/cat.glb': {
    copyright: 'Generated with Meshy (https://www.meshy.ai) on a paid plan on 2026-11-19; skeleton and clips: Meshy Service Assets',
    source: { tool: 'Meshy', url: 'https://www.meshy.ai', plan: 'paid', generated: '2026-11-19', terms: 'https://www.meshy.ai/terms-of-use', credits: 'CREDITS.md' },
  },
  'hero/child.glb': {
    copyright: 'Mesh and texture generated with Meshy (https://www.meshy.ai) on a paid plan on 2026-11-15; skeleton and animations: Quaternius, CC0 1.0',
    source: { tool: 'Meshy', url: 'https://www.meshy.ai', plan: 'paid', generated: '2026-11-15', terms: 'https://www.meshy.ai/terms-of-use', credits: 'CREDITS.md' },
  },
  // the forest (2026-11-20/21, the customer's decision 2026-11-21): Meshy's meshes and textures; the gnomes with Meshy's
  // skeleton and clips, the squirrel and the hedgehog with Meshy's skeleton and our own clips, the owls with our own
  // skeleton and clips (no rig of Meshy for a bird)
  'forest/borovik.glb': forest('2026-11-21', 'skeleton and clips: Meshy Service Assets'),
  'forest/tropka.glb': forest('2026-11-21', 'skeleton and clips: Meshy Service Assets'),
  'forest/kolyuchka.glb': forest('2026-11-21', 'skeleton: Meshy Service Assets; clips: our own'),
  'forest/shustrik.glb': forest('2026-11-20', 'skeleton: Meshy Service Assets; clips: our own'),
  'forest/mudrena.glb': forest('2026-11-20', 'skeleton and clips: our own'),
  'forest/owlet.glb': forest('2026-11-20', 'the owl made small and pale; skeleton and clips: our own'),
  // the sea (2026-11-22, the customer's word: Meshy for the sea's five): Meshy's mesh and texture, our own skeleton and
  // clips (no rig of Meshy for a mermaid's tail)
  'sea/khvylia.glb': forest('2026-11-22', 'skeleton and clips: our own'),
  'sea/bulk.glb': forest('2026-11-22', 'skeleton and clips: our own'),
  'sea/pantsyr.glb': forest('2026-11-22', 'skeleton and clips: our own'),
  'sea/kleshnya.glb': forest('2026-11-22', 'skeleton and clips: our own'),
  'sea/iskorka.glb': forest('2026-11-22', 'skeleton and clips: our own'),
  // the Sweet Land (2026-11-24, the lead's decisions on the customer's word): Meshy's mesh and texture, our own skeleton,
  // clips and wings
  'sweet/pastila.glb': forest('2026-11-24', 'skeleton, clips and wings: our own'),
  // and Imbir, Tyanuchka and Kakao the same way; Polosatik is made by code, no Meshy in him (not listed)
  'sweet/imbir.glb': forest('2026-11-24', 'skeleton and clips: our own'),
  'sweet/tyanuchka.glb': forest('2026-11-24', 'skeleton and clips: our own'),
  'sweet/kakao.glb': forest('2026-11-24', 'skeleton, clips and the beard\'s chocolate colour: our own'),
  // the Sky Islands (2026-11-25, the customer's decision for world 5: the three people in Meshy): Meshy's mesh and texture,
  // our own skeleton and clips; Lazur's texture recoloured by the parts of her figure
  'sky/lazur.glb': forest('2026-11-25', 'skeleton, clips and the texture\'s colours by the parts of the figure: our own'),
  'sky/mertsal.glb': forest('2026-11-25', 'skeleton and clips: our own'),
  'sky/veterok.glb': forest('2026-11-25', 'skeleton and clips (no arm bones: his hands stay on his hips): our own'),
};

const quiet = { debug() {}, info() {}, warn(m) { throw new Error(`gltf-transform warning: ${m}`); }, error(m) { throw new Error(m); } };

export async function createIO() {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
}

/** Every file under `dir`, as sorted posix paths relative to it. */
export function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(dir.length + 1).split('\\').join('/')).sort();
}

/** Source models: every .glb under models-src/. Other files there (textures) are inputs of those models. */
export function listSources(srcDir = join(ROOT, SRC_DIR)) {
  return listFiles(srcDir).filter((f) => f.endsWith('.glb'));
}

/**
 * Any image the browser formats cover -> WebP no larger than MAX_TEXTURE on its longest side.
 * Role 'color' is lossy. Role 'normal' (normal, roughness and occlusion maps) is lossless: lossy WebP halves the
 * chroma resolution, which on the heroine's outfit turned 5% of the normals by more than 7 degrees even at quality 100.
 */
export async function encodeTexture(image, role = 'color') {
  const options = role === 'normal'
    ? { lossless: true, effort: 6, exact: true }
    : { quality: COLOR_QUALITY, alphaQuality: 100, effort: 6, exact: true, smartSubsample: true };
  const { width, height, hasAlpha } = await sharp(image).metadata();
  if (!hasAlpha || Math.max(width, height) <= MAX_TEXTURE) return sharp(image).resize(FIT).webp(options).toBuffer();
  // sharp premultiplies by alpha before it resizes (and drops the alpha channel only afterwards), which would wipe
  // the colour under transparent texels: split the decoded image, shrink colour and alpha apart, interleave them again.
  const { data } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(width * height * 3), a = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) { data.copy(rgb, i * 3, i * 4, i * 4 + 3); a[i] = data[i * 4 + 3]; }
  const colour = await sharp(rgb, { raw: { width, height, channels: 3 } }).resize(FIT).raw().toBuffer({ resolveWithObject: true });
  const alpha = await sharp(a, { raw: { width, height, channels: 1 } }).resize(FIT).raw().toBuffer({ resolveWithObject: true });
  const n = colour.info.width * colour.info.height, step = alpha.info.channels, rgba = Buffer.alloc(n * 4);   // grey comes back as 3 equal channels
  for (let i = 0; i < n; i++) { colour.data.copy(rgba, i * 4, i * 3, i * 3 + 3); rgba[i * 4 + 3] = alpha.data[i * step]; }
  return sharp(rgba, { raw: { width: colour.info.width, height: colour.info.height, channels: 4 } }).webp(options).toBuffer();
}

/** [width, height] of a WebP file, read from its header (lossy, lossless and extended layouts). */
export function webpSize(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  throw new Error(`unknown WebP chunk "${kind}"`);
}

/** Splits a .glb into its JSON and binary chunks. */
export function readGlb(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb file');
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.toString('utf8', 20, 20 + jsonLength));
  const bin = b.length > 20 + jsonLength ? b.subarray(28 + jsonLength, 28 + jsonLength + b.readUInt32LE(20 + jsonLength)) : null;
  return { json, bin };
}

export function writeGlb(json, bin) {
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const parts = [Buffer.alloc(12), Buffer.alloc(8), text];
  parts[1].writeUInt32LE(text.length, 0); parts[1].writeUInt32LE(0x4e4f534a, 4);
  if (bin) {
    const head = Buffer.alloc(8); head.writeUInt32LE(bin.length, 0); head.writeUInt32LE(0x004e4942, 4);
    parts.push(head, bin);
  }
  const out = Buffer.concat(parts);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  return out;
}

/**
 * The textures of a source model: [{ texture, role, uri, path }]. The material slot decides the role ('color' or
 * 'normal', see encodeTexture); `uri` is what the shipped .glb references, `path` the shipped file under public/models.
 */
export function modelTextures(doc, rel) {
  const roles = new Map();
  const set = (t, role) => {
    if (!t) return;
    if (roles.has(t) && roles.get(t) !== role) throw new Error(`${rel}: texture "${t.getName() || t.getURI()}" is used both as colour and as data map`);
    roles.set(t, role);
  };
  for (const m of doc.getRoot().listMaterials()) {
    set(m.getBaseColorTexture(), 'color'); set(m.getEmissiveTexture(), 'color');
    set(m.getNormalTexture(), 'normal');
    // Data maps (roughness, occlusion) are lossless too.
    set(m.getMetallicRoughnessTexture(), 'normal'); set(m.getOcclusionTexture(), 'normal');
  }
  return doc.getRoot().listTextures().map((texture) => {
    const id = texture.getURI() || texture.getName(), role = roles.get(texture);
    if (!texture.getImage() || !role) throw new Error(`${rel}: texture "${id}" has no image or is not used by any material`);
    const stem = basename(id, extname(id));
    if (!/^[\w-]+$/.test(stem)) throw new Error(`${rel}: cannot make a file name from texture "${id}"`);
    const uri = `tex/${stem}.webp`;
    return { texture, role, uri, path: posix.join(posix.dirname(rel), uri) };
  });
}

/**
 * Builds the shipped files of one source model: the compressed .glb and the textures it references.
 * `textures` is shared between calls: a texture several models use is encoded once and must be the same image.
 * Returns Map<relative output path, bytes>.
 */
export async function packModel(io, rel, textures = new Map(), srcDir = join(ROOT, SRC_DIR)) {
  const doc = await io.read(join(srcDir, rel));
  doc.setLogger(quiet);
  const out = new Map(), uris = [];
  for (const { texture, role, uri, path } of modelTextures(doc, rel)) {
    const image = texture.getImage(), hash = createHash('sha256').update(image).update(role).digest('hex');
    const known = textures.get(path);
    if (known && known.hash !== hash) throw new Error(`${rel}: ${path} is already produced from a different image or role (by ${known.from})`);
    const entry = known ?? { hash, from: rel, bytes: await encodeTexture(image, role) };
    textures.set(path, entry); out.set(path, entry.bytes);
    // The image leaves the .glb: its URI is written into the JSON chunk below.
    texture.setImage(null).setMimeType('image/webp').setURI(uri);
    uris.push(uri);
  }
  if (uris.length) doc.createExtension(EXTTextureWebP).setRequired(true);

  await doc.transform(
    weld({ overwrite: false }),                                   // only unindexed primitives; bitwise identical vertices
    dedup({ propertyTypes: [PropertyType.ACCESSOR] }),
  );
  if (doc.getRoot().listMeshes().length) await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  // Method "quantize" means "compress the accessors as they are": no filters, so float data stays lossless.
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const { json, bin } = readGlb(await io.writeBinary(doc));
  if ((json.images ?? []).length !== uris.length) throw new Error(`${rel}: expected ${uris.length} images in the output, got ${(json.images ?? []).length}`);
  (json.images ?? []).forEach((image, i) => { image.uri = uris[i]; });
  const made = PROVENANCE[rel];
  if (made) json.asset = { ...json.asset, copyright: made.copyright, extras: { ...(json.asset.extras ?? {}), source: made.source } };
  out.set(rel, writeGlb(json, bin));
  return out;
}

/** Every shipped file, built in memory: Map<relative path, bytes>, sorted by path. */
export async function buildAll(srcDir = join(ROOT, SRC_DIR), log = () => {}) {
  const io = await createIO(), textures = new Map(), files = new Map();
  for (const rel of listSources(srcDir)) {
    const made = await packModel(io, rel, textures, srcDir);
    for (const [path, bytes] of made) files.set(path, bytes);
    log(rel, statSync(join(srcDir, rel)).size, made.get(rel).length);
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The next worlds of the sources: every folder of src/worlds/ but the first world's and the installation's (the hub). */
export function nextWorlds() {
  const installed = installedWorlds();
  return sourceWorlds().worlds.filter((id) => !installed.includes(id));
}

/** The next world a model belongs to (its first folder is the world's id), or null: the core's. */
export function worldOfModel(rel, worlds = nextWorlds()) {
  const id = rel.split('/')[0];
  return rel.includes('/') && worlds.includes(id) ? id : null;
}

/** Where a shipped file of `rel` (a path under models/) lies, relative to the root: public/models/… or worlds-data/<id>/models/…. */
export function shippedPath(rel, worlds = nextWorlds()) {
  const id = worldOfModel(rel, worlds);
  return id === null ? posix.join(OUT_DIR, rel) : posix.join(WORLDS_DATA, id, 'models', rel);
}

/** Every shipped file, as paths under models/, sorted: the core's (public/models/) and the next worlds'. */
export function listShipped(worlds = nextWorlds(), root = ROOT) {
  const own = worlds.flatMap((id) => listFiles(join(root, WORLDS_DATA, id, 'models')).filter((f) => worldOfModel(f, worlds) === id));
  return [...listFiles(join(root, OUT_DIR)), ...own].sort();
}

/**
 * Size problems of a set of shipped files ({path, size}, paths under models/); empty when it fits the budget. The core
 * (public/models/) and each next world (TECH-09) are counted apart: MAX_TOTAL and MAX_WORLD.
 */
export function overBudget(files, worlds = nextWorlds()) {
  const problems = files.filter((f) => f.size > MAX_FILE).map((f) => `${f.path}: ${f.size} bytes, the limit for one file is ${MAX_FILE}`);
  const parts = new Map();
  for (const f of files) { const id = worldOfModel(f.path, worlds); parts.set(id, (parts.get(id) ?? 0) + f.size); }
  for (const [id, total] of parts) {
    const max = id === null ? MAX_TOTAL : MAX_WORLD;
    if (total > max) problems.push(`${id === null ? OUT_DIR : posix.join(WORLDS_DATA, id, 'models')}: ${total} bytes in total, the limit is ${max}`);
  }
  return problems;
}

async function main() {
  const check = process.argv.includes('--check');
  const srcDir = join(ROOT, SRC_DIR), outDir = join(ROOT, OUT_DIR);
  const kb = (n) => `${(n / 1024).toFixed(0).padStart(6)} KB`;
  let before = 0;
  const files = await buildAll(srcDir, (rel, src, dst) => { before += src; console.log(`${kb(src)} -> ${kb(dst)}  ${rel}`); });
  for (const [path, bytes] of files) if (path.endsWith('.webp')) console.log(`${''.padStart(9)}    ${kb(bytes.length)}  ${path} (${webpSize(bytes).join('x')})`);
  // Source textures that sit next to the models are part of the "before" weight.
  for (const f of listFiles(srcDir)) if (!f.endsWith('.glb')) before += statSync(join(srcDir, f)).size;

  const sizes = [...files].map(([path, bytes]) => ({ path, size: bytes.length }));
  const total = sizes.reduce((s, f) => s + f.size, 0), heaviest = sizes.reduce((a, b) => (b.size > a.size ? b : a));
  const part = (id) => sizes.filter((f) => worldOfModel(f.path) === id).reduce((s, f) => s + f.size, 0);
  const own = nextWorlds().filter((id) => part(id) > 0).map((id) => `, ${WORLDS_DATA}/${id}: ${(part(id) / 1e6).toFixed(2)} MB`).join('');
  console.log(`\n${SRC_DIR}: ${(before / 1e6).toFixed(2)} MB -> ${(total / 1e6).toFixed(2)} MB in ${sizes.length} files (${OUT_DIR}: ${(part(null) / 1e6).toFixed(2)} MB${own}); `
    + `heaviest: ${heaviest.path}, ${(heaviest.size / 1e6).toFixed(2)} MB`);

  const worlds = nextWorlds();
  if (check) {
    const onDisk = listShipped(worlds);
    const stale = [...files].filter(([path, bytes]) => { const at = join(ROOT, shippedPath(path, worlds)); return !existsSync(at) || !readFileSync(at).equals(bytes); }).map(([path]) => path);
    const extra = onDisk.filter((path) => !files.has(path));
    if (stale.length || extra.length) {
      console.error(`the models are not what the sources produce. Run: npm run assets\n  differs or missing: ${stale.join(', ') || '-'}\n  not produced: ${extra.join(', ') || '-'}`);
      process.exitCode = 1;
    }
  } else {
    rmSync(outDir, { recursive: true, force: true });
    for (const id of worlds) rmSync(join(ROOT, WORLDS_DATA, id, 'models'), { recursive: true, force: true });
    for (const [path, bytes] of files) { const at = join(ROOT, shippedPath(path, worlds)); mkdirSync(dirname(at), { recursive: true }); writeFileSync(at, bytes); }
  }
  const problems = overBudget(sizes, worlds);
  if (problems.length) { console.error(`over budget:\n  ${problems.join('\n  ')}`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
