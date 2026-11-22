/**
 * Who speaks with which voice in the Underwater Kingdom (VOICE-10, docs/worlds/world-3.md "Персонажи"): the five voices
 * of the whole game, no new one. The ids and emojis are those of ./index.ts FRIENDS.
 *
 * No value import here: tools/sync_phrases.mjs loads this file in Node, like the world's strings.ts.
 */
export const voices = {
  id: 'sea',
  narrator: 'cat',
  cast: {
    cat: { emoji: '🐱', voice: 'Puck' },          // the cat-narrator
    khvylia: { emoji: '🧜‍♀️', voice: 'Sulafat' }, // the queen of the mermaids: kind grown-up
    bulk: { emoji: '🐉', voice: 'Leda' },          // the sea dragon: childlike, quick
    pantsyr: { emoji: '🐢', voice: 'Charon' },     // the turtle: wise elder
    kleshnya: { emoji: '🦀', voice: 'Orus' },      // the crab, the cook: deep, funny
    iskorka: { emoji: '🐟', voice: 'Leda' },       // the lantern fish: childlike, quick
  },
  /**
   * What the characters say in their own voice: their own lines only (`<id>_*` of ./strings.ts). The shared lines of a
   * conversation and the questions of the tasks they say with the cat's clip (src/core/voice.ts `clipFor`), as the
   * forest's characters do - no new recording of a shared line.
   */
  voiced: ['own'] as string[],
  /** Their own lines are never the cat's: no clip of the narrator for them. */
  only: ['own'] as string[],
} as const satisfies {
  id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[]; only?: readonly string[];
};
