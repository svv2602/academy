import type { StoryDef } from '../../game/story';

/**
 * The cut-scenes of the Fairy Kingdom (WORLD-13): the introduction of a new save (five frames, before the tour) and the
 * return of the Crystal of Light (three frames, after the finale). Each frame: its picture in public/story/, the cat's
 * line (./strings.ts) and its move of the camera - what the frame is about (`aim`, it stays at rest), zoom in or pull
 * out, the sideways or upward parallax and its strength. Two frames side by side never move the same way; each scene
 * ends pulling out (the whole kingdom). The parallax is weaker where a near thing stands at the edge of the frame (the
 * unicorn of the third frame, the heroine and the cat at the bottom of the fifth): there it grew out of the frame.
 * Their subtitle goes to the top: the shards of the third and the cat of the fifth lie at the bottom of the frame.
 * The moves come from the probe of 2026-11-15 (src/game/story.ts plays them the same way).
 */
const S = 7;   // seconds of a pass at least; a longer line makes it longer (src/game/story.ts passSeconds)

export const FAIRY_STORIES: readonly StoryDef[] = [
  {
    id: 'story_intro', icon: '📜', title: 'story_intro',
    shots: [
      // the kingdom shines: in on the gazebo with the whole crystal, the grass goes under the camera
      { image: 'story/w1_intro_1', line: 'story_intro_1', aim: [0.5, 0.42], zoom: 'in', pan: [0, -0.02], depth: 0.1, seconds: S },
      // the crystal comes apart: sideways along the pond, the five shards over the gazebo at rest
      { image: 'story/w1_intro_2', line: 'story_intro_2', aim: [0.5, 0.5], zoom: 'in', pan: [0.03, 0], depth: 0.05, seconds: S },
      // the five friends keep the shards: a slow rise over the panorama (the unicorn stands at the edge: weak parallax)
      { image: 'story/w1_intro_3', line: 'story_intro_3', aim: [0.55, 0.45], zoom: 'in', pan: [0, 0.015], depth: 0.03, seconds: S, subtitleTop: true },
      // the heroine lands, the cat greets her: round them against the wood
      { image: 'story/w1_intro_4', line: 'story_intro_4', aim: [0.38, 0.6], zoom: 'in', pan: [-0.03, 0], depth: 0.07, seconds: S },
      // off they go: pulling out to the whole kingdom (the heroine and the cat near the bottom edge: weak parallax)
      { image: 'story/w1_intro_5', line: 'story_intro_5', aim: [0.5, 0.4], zoom: 'out', pan: [0, -0.01], depth: 0.04, seconds: S, subtitleTop: true },
    ],
  },
  {
    id: 'story_crystal', icon: '💎', title: 'story_crystal',
    shots: [
      // the shards gathered: sideways towards them over the pond
      { image: 'story/w1_crystal_1', line: 'story_crystal_1', aim: [0.55, 0.4], zoom: 'in', pan: [0.025, 0], depth: 0.06, seconds: S, subtitleTop: true },
      // the crystal is whole again: in on it in the gazebo
      { image: 'story/w1_crystal_2', line: 'story_crystal_2', aim: [0.67, 0.55], zoom: 'in', pan: [0, -0.01], depth: 0.1, seconds: S },
      // the kingdom in bloom and the Great Tree far away: pulling out to the whole world and the rainbow
      { image: 'story/w1_crystal_3', line: 'story_crystal_3', aim: [0.45, 0.45], zoom: 'out', pan: [0, 0.015], depth: 0.06, seconds: S, subtitleTop: true },
    ],
  },
];
