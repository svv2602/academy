import type { StoryDef } from '../../game/story';

/**
 * The cut-scenes of the Sky Islands (WORLD-13, docs/worlds/world-5.md «Раскадровка заставок»): the way in (three
 * frames, at the first entry, before its tour) and the Star of Time restored (three frames, after the finale). Each
 * frame: its picture (the world's own files, worlds-data/sky/story/sky/ - in the build story/sky/), the cat's line
 * (./strings.ts) and its move of the camera, as the Sweet Land's (src/worlds/sweet/story.ts). Two frames side by side
 * never move the same way; each scene ends pulling out. The heroine and the cat stand at the bottom of the third frame
 * of the way in, the cat sits at the roots in the last: their subtitle goes to the top, and their parallax is weak.
 * Accepted by the lead on 2026-11-26 (CREDITS.md): the first tries of all six, w5_intro_3's heroine larger than asked
 * kept («крупная героиня со спины в начале пути смотрится хорошо»). The five rays of the story are the player's golden
 * lights (Shot.glows), never painted: asked "exactly five", the model of world 4 drew ten lights and six rubies.
 */
const S = 7;   // seconds of a pass at least; a longer line makes it longer (src/game/story.ts passSeconds)
const F = 'story/sky/';

export const SKY_STORIES: readonly StoryDef[] = [
  {
    id: 'story_intro', icon: '📜', title: 'sky_story_title_intro',
    shots: [
      // the islands from high above over the sea of clouds: in, rising over the clouds
      { image: `${F}w5_intro_1`, line: 'sky_story_intro_1', aim: [0.5, 0.45], zoom: 'in', pan: [0, 0.02], depth: 0.1, seconds: S },
      // the Star breaks apart over the observatory's dome, the islands gone dull: in, along the tower
      { image: `${F}w5_intro_2`, line: 'sky_story_intro_2', aim: [0.5, 0.4], zoom: 'in', pan: [-0.03, 0], depth: 0.05, seconds: S },
      // she and the cat from behind on the bridge to the observatory: pulling out, sideways
      {
        image: `${F}w5_intro_3`, line: 'sky_story_intro_3', aim: [0.5, 0.4], zoom: 'out', pan: [0.015, 0], depth: 0.04, seconds: S, subtitleTop: true,
        // the five rays scattered, in the sky over the observatory's island (the lead's word of 2026-11-26), round the tower
        glows: [[0.48, 0.29], [0.535, 0.17], [0.735, 0.15], [0.79, 0.25], [0.84, 0.37]], glowTint: 'gold',
      },
    ],
  },
  {
    id: 'story_star', icon: '⭐', title: 'sky_story_title_star',
    shots: [
      // the golden trails meet over the dome and the Star forms there: in, sideways
      {
        image: `${F}w5_back_1`, line: 'sky_story_back_1', aim: [0.5, 0.38], zoom: 'in', pan: [0.025, 0], depth: 0.06, seconds: S,
        // the five rays at the ends of the painted rings round the Star
        glows: [[0.525, 0.22], [0.565, 0.29], [0.7, 0.3], [0.775, 0.21], [0.735, 0.14]], glowTint: 'gold',
      },
      // the islands awake in the sunset: the clock goes, the cloud animals, two little dragons: in, up
      { image: `${F}w5_back_2`, line: 'sky_story_back_2', aim: [0.5, 0.45], zoom: 'in', pan: [0, 0.02], depth: 0.1, seconds: S },
      // the Great Tree with the Star's light in its nest, the cat at its roots: pulling out
      { image: `${F}w5_back_3`, line: 'sky_story_back_3', aim: [0.5, 0.4], zoom: 'out', pan: [0, -0.01], depth: 0.05, seconds: S, subtitleTop: true },
    ],
  },
];
