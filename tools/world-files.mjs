// Which part of the build a file belongs to (docs/15-tech.md, TECH-09; decision Q14): the size budget is counted per part.
// The core and the first world lie as they always did (models/<pack>/, voice/<clip>.mp3) and are one group: they are
// what the installation caches. Every next world keeps its files in folders of its own - models/<id>/, voice/<id>/,
// story/<id>/, and its code, code/<id>/ (its chunk: loaded as she enters it, src/worlds/index.ts) - and is a group of its own. The bank of the old game's clips (bank/) is a third kind: outside the limits.
// Pure functions of the path, no disk: tools/dist-size.mjs walks the build and asks these.

/** The group of everything that is neither the bank nor a next world's: the core together with the first world. */
export const CORE = 'core';
/** The group of the bank: loaded when a clip is first played, not part of any world. */
export const BANK = 'bank';
/** The name of a next world's group. */
export const worldGroup = (id) => `world:${id}`;
/** The folders of the build a next world keeps a folder of its own in. */
export const WORLD_FOLDERS = ['models', 'voice', 'story', 'code'];

/** A recorded clip of the voice (of the core, the first world or a next one); only the folder voice/ is the voice. */
export const isVoice = (path) => path.startsWith('voice/');
/** A clip of the bank; only the folder bank/ is the bank. */
export const isBank = (path) => path.startsWith('bank/');

/**
 * The id of the next world the file `path` (relative to the build, with `/`) belongs to, or null: a file is a world's
 * when it lies inside models/<id>/, voice/<id>/, story/<id>/ or code/<id>/ and `<id>` is one of `worlds`. A file merely
 * named after a world (models/<id>.glb, assets/<id>-x.js) is not.
 */
export function worldOf(path, worlds = []) {
  const [folder, id, inside] = path.split('/');
  return inside !== undefined && WORLD_FOLDERS.includes(folder) && worlds.includes(id) ? id : null;
}

/** The group of a file of the build: BANK, `world:<id>` for a file of one of the next `worlds`, CORE for the rest. */
export function groupOf(path, worlds = []) {
  if (isBank(path)) return BANK;
  const id = worldOf(path, worlds);
  return id === null ? CORE : worldGroup(id);
}
