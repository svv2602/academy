import type { StoryDef } from '../../game/story';

/**
 * The cut-scenes of the Enchanted Forest (WORLD-13, docs/worlds/world-2.md «Раскадровка заставок»): the way in (three
 * frames, at the first entry into the forest, before its tour) and the Emerald of Wisdom restored (three frames, after
 * the finale). Each frame: its picture (the world's own files, worlds-data/forest/story/forest/ - in the build
 * story/forest/), the cat's line (./strings.ts) and its move of the camera, as the first world's (src/worlds/fairy/story.ts).
 * Two frames side by side never move the same way; each scene ends pulling out. The heroine and the cat stand at the
 * bottom of the third frame of the way in, the cat at the roots in the last: their subtitle goes to the top, and their
 * parallax is weak. Accepted by the customer on 2026-11-22 (CREDITS.md).
 */
const S = 7;   // seconds of a pass at least; a longer line makes it longer (src/game/story.ts passSeconds)
const F = 'story/forest/';

export const FOREST_STORIES: readonly StoryDef[] = [
  {
    id: 'story_intro', icon: '📜', title: 'forest_story_title_intro',
    shots: [
      // the forest asleep from high above: down towards it, the Old Oak at rest
      { image: `${F}w2_intro_1`, line: 'forest_story_intro_1', aim: [0.5, 0.42], zoom: 'in', pan: [0, -0.02], depth: 0.08, seconds: S },
      // the Emerald comes apart into its leaves: sideways along the Oak
      { image: `${F}w2_intro_2`, line: 'forest_story_intro_2', aim: [0.5, 0.48], zoom: 'in', pan: [0.03, 0], depth: 0.05, seconds: S },
      // she and the cat at the arch, the five lights far away: pulling out and rising (they stand near the bottom)
      { image: `${F}w2_intro_3`, line: 'forest_story_intro_3', aim: [0.5, 0.45], zoom: 'out', pan: [0, 0.015], depth: 0.03, seconds: S, subtitleTop: true },
    ],
  },
  {
    id: 'story_emerald', icon: '💚', title: 'forest_story_title_emerald',
    shots: [
      // the leaves come together into the Emerald over the altar: sideways towards it
      { image: `${F}w2_back_1`, line: 'forest_story_back_1', aim: [0.5, 0.4], zoom: 'in', pan: [-0.025, 0], depth: 0.06, seconds: S },
      // the forest awake: in, up towards the rays
      { image: `${F}w2_back_2`, line: 'forest_story_back_2', aim: [0.5, 0.45], zoom: 'in', pan: [0, 0.02], depth: 0.1, seconds: S },
      // the Great Tree with the Emerald in its nest, the cat at its roots: pulling out
      { image: `${F}w2_back_3`, line: 'forest_story_back_3', aim: [0.5, 0.4], zoom: 'out', pan: [0, -0.01], depth: 0.05, seconds: S, subtitleTop: true },
    ],
  },
];
