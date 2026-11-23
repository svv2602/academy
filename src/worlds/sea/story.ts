import type { StoryDef } from '../../game/story';

/**
 * The cut-scenes of the Underwater Kingdom (WORLD-13, docs/worlds/world-3.md «Раскадровка заставок»): the way in (three
 * frames, at the first entry into the sea, before its tour) and the Pearl of the Deep restored (three frames, after the
 * finale). Each frame: its picture (the world's own files, worlds-data/sea/story/sea/ - in the build story/sea/), the
 * cat's line (./strings.ts) and its move of the camera, as the forest's (src/worlds/forest/story.ts). Two frames side
 * by side never move the same way; each scene ends pulling out. The heroine and the cat swim at the bottom of the third
 * frame of the way in, the cat sits at the roots in the last: their subtitle goes to the top, and their parallax is
 * weak. Accepted by the customer on 2026-11-23, the second try of the third frame (CREDITS.md).
 */
const S = 7;   // seconds of a pass at least; a longer line makes it longer (src/game/story.ts passSeconds)
const F = 'story/sea/';

export const SEA_STORIES: readonly StoryDef[] = [
  {
    id: 'story_intro', icon: '📜', title: 'sea_story_title_intro',
    shots: [
      // the kingdom through the water, the castle of spiral shells, the ship's mast far off: down into it
      { image: `${F}w3_intro_1`, line: 'sea_story_intro_1', aim: [0.5, 0.45], zoom: 'in', pan: [0, -0.02], depth: 0.08, seconds: S },
      // the Pearl comes apart into five pearls over the throne, the gate shut by its lock: sideways along the castle
      { image: `${F}w3_intro_2`, line: 'sea_story_intro_2', aim: [0.5, 0.42], zoom: 'in', pan: [0.03, 0], depth: 0.05, seconds: S },
      // she swims down to the castle, the cat in its bubble, five lights far off: pulling out and rising (they are low)
      { image: `${F}w3_intro_3`, line: 'sea_story_intro_3', aim: [0.5, 0.45], zoom: 'out', pan: [0, 0.015], depth: 0.03, seconds: S, subtitleTop: true },
    ],
  },
  {
    id: 'story_pearl', icon: '🦪', title: 'sea_story_title_pearl',
    shots: [
      // the pearls come together into the Pearl over the throne: sideways towards it
      { image: `${F}w3_back_1`, line: 'sea_story_back_1', aim: [0.5, 0.4], zoom: 'in', pan: [-0.025, 0], depth: 0.06, seconds: S },
      // the sea awake: in, up towards the rays
      { image: `${F}w3_back_2`, line: 'sea_story_back_2', aim: [0.5, 0.45], zoom: 'in', pan: [0, 0.02], depth: 0.1, seconds: S },
      // the Great Tree with the Pearl in its nest, the cat at its roots: pulling out
      { image: `${F}w3_back_3`, line: 'sea_story_back_3', aim: [0.5, 0.4], zoom: 'out', pan: [0, -0.01], depth: 0.05, seconds: S, subtitleTop: true },
    ],
  },
];
