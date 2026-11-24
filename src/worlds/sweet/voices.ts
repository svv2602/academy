/**
 * Who speaks with which voice in the Sweet Land (VOICE-10, docs/worlds/world-4.md "Персонажи", the line draft of
 * 2026-11-18): the five voices of the whole game, no new one. The ids and emojis are those of ./index.ts FRIENDS.
 *
 * No value import here: tools/sync_phrases.mjs loads this file in Node, like the world's strings.ts.
 */
export const voices = {
  id: 'sweet',
  narrator: 'cat',
  cast: {
    cat: { emoji: '🐱', voice: 'Puck' },        // the cat-narrator
    pastila: { emoji: '🧁', voice: 'Sulafat' },  // the fairy confectioner: kind grown-up
    imbir: { emoji: '🍪', voice: 'Leda' },       // the gingerbread man: childlike, quick
    tyanuchka: { emoji: '🍬', voice: 'Orus' },   // the jelly strongman: deep, funny
    kakao: { emoji: '🍫', voice: 'Charon' },     // the miller: wise elder
    polosatik: { emoji: '🍭', voice: 'Leda' },   // the lollipop guard: childlike, quick
  },
  /**
   * What the characters say in their own voice: their own lines only (`<id>_*` of ./strings.ts). The shared lines of a
   * conversation and the questions of the panel's tasks they say with the cat's clip (src/core/voice.ts `clipFor`), as
   * the sea's and the forest's characters do - no new recording of a shared line.
   */
  voiced: ['own'] as string[],
  /** Their own lines are never the cat's: no clip of the narrator for them. */
  only: ['own'] as string[],
} as const satisfies {
  id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[]; only?: readonly string[];
};
