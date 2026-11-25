import type { StoryDef } from '../../game/story';

/**
 * The cut-scenes of the Sweet Land (WORLD-13, docs/worlds/world-4.md «Раскадровка заставок»): the way in (three frames,
 * at the first entry, before its tour) and the Ruby of Joy restored (three frames, after the finale). Each frame: its
 * picture (the world's own files, worlds-data/sweet/story/sweet/ - in the build story/sweet/), the cat's line
 * (./strings.ts) and its move of the camera, as the sea's (src/worlds/sea/story.ts). Two frames side by side never move
 * the same way; each scene ends pulling out. The heroine and the cat stand at the bottom of the third frame of the way
 * in, the cat sits at the roots in the last: their subtitle goes to the top, and their parallax is weak.
 * Accepted by the customer on 2026-11-25 (CREDITS.md): the second tries of w4_intro_3, w4_back_1 and w4_back_2. The
 * model did not count the rubies of two frames (six, four): the story's five are the player's lights over them
 * (Shot.glows) - the customer's choice.
 */
const S = 7;   // seconds of a pass at least; a longer line makes it longer (src/game/story.ts passSeconds)
const F = 'story/sweet/';

export const SWEET_STORIES: readonly StoryDef[] = [
  {
    id: 'story_intro', icon: '📜', title: 'sweet_story_title_intro',
    shots: [
      // the land from high above, bright and sweet: in, along the carousel
      { image: `${F}w4_intro_1`, line: 'sweet_story_intro_1', aim: [0.5, 0.45], zoom: 'in', pan: [0.03, 0], depth: 0.07, seconds: S },
      // the Ruby comes apart over the candle, the land faded: in, the camera going down
      { image: `${F}w4_intro_2`, line: 'sweet_story_intro_2', aim: [0.5, 0.38], zoom: 'in', pan: [0, -0.015], depth: 0.05, seconds: S },
      // she and the cat from behind at the edge of the square, the rubies over the candle: pulling out and rising. The
      // picture is moved down by 7 % of its height, the sky drawn on above it (the rubies were at its very top: the zoom
      // took them off a phone held sideways); the aim between the rubies and her keeps them in view
      {
        image: `${F}w4_intro_3`, line: 'sweet_story_intro_3', aim: [0.5, 0.38], zoom: 'out', pan: [0, 0.015], depth: 0.03, seconds: S, subtitleTop: true,
        // on five of the six painted rubies; the sixth, the highest, is background
        glows: [[0.393, 0.188], [0.449, 0.255], [0.499, 0.141], [0.565, 0.231], [0.613, 0.142]],
      },
    ],
  },
  {
    id: 'story_ruby', icon: '🍭', title: 'sweet_story_title_ruby',
    shots: [
      // five rubies fly to the candle and join into the Ruby: in, up to the candle
      {
        image: `${F}w4_back_1`, line: 'sweet_story_back_1', aim: [0.5, 0.38], zoom: 'in', pan: [0, 0.02], depth: 0.06, seconds: S,
        // on the four painted small rubies of the arc, and the fifth still low on its left trail
        glows: [[0.328, 0.314], [0.402, 0.212], [0.596, 0.212], [0.672, 0.314], [0.29, 0.42]],
      },
      // the land awake: the carousel turns, confetti of sugar powder: in, sideways
      { image: `${F}w4_back_2`, line: 'sweet_story_back_2', aim: [0.5, 0.5], zoom: 'in', pan: [-0.03, 0], depth: 0.08, seconds: S },
      // the Great Tree with the Ruby in its nest, the cat at its roots: pulling out
      { image: `${F}w4_back_3`, line: 'sweet_story_back_3', aim: [0.5, 0.4], zoom: 'out', pan: [0, -0.01], depth: 0.05, seconds: S, subtitleTop: true },
    ],
  },
];
