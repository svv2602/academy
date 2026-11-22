/**
 * Who speaks with which voice in the Enchanted Forest (VOICE-10, docs/worlds/world-2.md "Персонажи"): the five voices
 * of the whole game, no new one. The ids and emojis are those of ./index.ts FRIENDS.
 *
 * No value import here: tools/sync_phrases.mjs loads this file in Node, like the world's strings.ts.
 */
export const voices = {
  id: 'forest',
  narrator: 'cat',
  cast: {
    cat: { emoji: '🐱', voice: 'Puck' },         // the cat-narrator
    borovik: { emoji: '🍄', voice: 'Orus' },      // the gnome, the village's elder: deep, funny
    mudrena: { emoji: '🦉', voice: 'Charon' },    // the owl: wise elder
    shustrik: { emoji: '🐿️', voice: 'Leda' },     // the squirrel: childlike, quick
    yasen: { emoji: '🌳', voice: 'Charon' },      // the old ash, and the trees' chorus of the finale: wise elder
    kolyuchka: { emoji: '🦔', voice: 'Leda' },    // the hedgehog, the guide: childlike, quick
  },
  /**
   * What the characters say in their own voice: their own lines only (`<id>_*` of ./strings.ts). The shared lines of a
   * conversation and the questions of the tasks they say with the cat's clip (src/core/voice.ts `clipFor`) - no new
   * recording of a shared line.
   */
  voiced: ['own'] as string[],
  /** Their own lines are never the cat's: no clip of the narrator for them. */
  only: ['own'] as string[],
} as const satisfies {
  id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[]; only?: readonly string[];
};
