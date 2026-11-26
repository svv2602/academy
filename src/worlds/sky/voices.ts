/**
 * Who speaks with which voice on the Sky Islands (VOICE-10, docs/worlds/world-5.md "Персонажи", the line draft of
 * 2026-11-18): the five voices of the whole game, no new one. The ids and emojis are those of ./index.ts FRIENDS.
 *
 * No value import here: tools/sync_phrases.mjs loads this file in Node, like the world's strings.ts.
 */
export const voices = {
  id: 'sky',
  narrator: 'cat',
  cast: {
    cat: { emoji: '🐱', voice: 'Puck' },         // the cat-narrator
    lazur: { emoji: '☁️', voice: 'Sulafat' },    // the cloud fairy: kind grown-up
    gromykhalo: { emoji: '🐉', voice: 'Orus' },   // the good dragon: deep, funny
    mertsal: { emoji: '🔭', voice: 'Charon' },    // the stargazer: wise elder
    veterok: { emoji: '🧭', voice: 'Leda' },      // the ship's boy: childlike, quick
    chirika: { emoji: '🐦', voice: 'Leda' },      // the swallow-postwoman: childlike, quick
  },
  /**
   * What the characters say in their own voice: their own lines only (`<id>_*` of ./strings.ts). The shared lines of a
   * conversation and the questions of the panel's tasks they say with the cat's clip (src/core/voice.ts `clipFor`), as
   * the Sweet Land's characters do - no new recording of a shared line.
   */
  voiced: ['own'] as string[],
  /** Their own lines are never the cat's: no clip of the narrator for them. */
  only: ['own'] as string[],
} as const satisfies {
  id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[]; only?: readonly string[];
};
