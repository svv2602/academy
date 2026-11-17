/**
 * Who speaks with which voice in the first world (VOICE-10): the table "character - voice", set once here and never in a
 * line. The voices are the five of the whole game (the customer's decision of 2026-11-15); characters may share one.
 * A character is named by its id (`<id>_hi` is its greeting) and by the emoji the game passes as the speaker of a line.
 *
 * No value import here: tools/sync_phrases.mjs loads this file in Node, like the world's strings.ts. The game hands
 * the table to src/core/voice.ts (`setCast`); voice/phrases.json gets it through `recordingList()` of src/ui/strings.ts.
 */
export const voices = {
  id: 'fairy',
  /** The narrator: says every line no character says in its own voice. His clips keep their names (`<key>.mp3`). */
  narrator: 'cat',
  cast: {
    cat: { emoji: '🐱', voice: 'Puck' },        // the cat-narrator: the voice the game has always had
    unicorn: { emoji: '🦄', voice: 'Sulafat' }, // kind grown-up, shared with the queen
    fox: { emoji: '🦊', voice: 'Leda' },        // childlike, quick
    mushking: { emoji: '🍄', voice: 'Orus' },   // deep, funny
    deer: { emoji: '🦌', voice: 'Charon' },     // wise elder
    queen: { emoji: '👑', voice: 'Sulafat' },   // kind grown-up
  },
  /**
   * What the characters say in their own voice - the one list of the amount of recording. Each entry is `'own'`
   * (every character's own lines: the keys `<id>_...` of this world, its greeting `<id>_hi`), a key a character says
   * (`'npc_next'`), `*` at its end for a prefix (`'t_*'`), or `!<key>` to take back a line of a prefix the narrator
   * says. Such a line is recorded once in every voice of a character, as `<key>@<voice>`; the narrator's clip `<key>`
   * stays as it is. The customer's answer of 2026-11-16 (R40): everything a character says - the greetings, the three
   * shared lines of a conversation and the questions of the tasks (src/game/dialogue.ts, `hooksFor` in
   * src/game/context.ts). `t_stars_back` is the cat's hint after the star search (star-search.ts), not the deer's.
   */
  voiced: ['own', 'npc_next', 'npc_again', 'npc_done', 't_*', '!t_stars_back'] as string[],
} as const satisfies {
  id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[];
};
