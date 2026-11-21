// @vitest-environment happy-dom
/**
 * Characterisation of the panel tasks (ARCH-09, R20): while the generators move out of `tasks.ts`, one seed must keep
 * building the very same task. Each task is reduced to a hash of what the child is asked and of the whole stage and
 * options as built (`prompt + stage.outerHTML + opts.innerHTML`), for every type, level and ten seeds.
 * The hashes were taken from `runTask` before the split (commit c3808cf). A changed hash is a changed task:
 * fix the code, do not rewrite the table.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import { SKILL, runTask } from '../taskviews/panel';
import type { TaskHooks } from '../taskviews/panel';
import type { TaskType } from './types';
import type { Spoken } from '../../core/audio';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const SEEDS = Array.from({ length: 10 }, (_, i) => `char-${i + 1}`);
const TYPES = Object.keys(SKILL) as TaskType[];

/** FNV-1a over the UTF-16 code units, as 8 hex digits (no node:crypto in the browser-typed sources). */
function fnv(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const realTimeout = setTimeout;   // taken before the fake clock is installed, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

function shot(type: TaskType, level: number, seed: string) {
  document.body.innerHTML = MARKUP;
  const prompts: string[] = [];
  const spoken = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = { prompt: (k) => { prompts.push(k); }, number: () => {}, good: () => {}, wrong: spoken, hint: spoken };
  void runTask(type, level, hooks, createRng(seed));
  const text = `${prompts.join(' ')}\n${document.getElementById('taskStage')!.outerHTML}\n${document.getElementById('taskOpts')!.innerHTML}`;
  vi.clearAllTimers();
  return fnv(text);
}

/** type → level 1..3 → the hashes of SEEDS in order. */
const EXPECTED: Record<TaskType, [string, string, string]> = {
  count: [
    'c3bc149d c16838fd 1d55013f f713fe56 9d2025a9 e3abd662 d692a3fe f940c952 9a8be378 a1e8ac68',
    '0272d039 8c853922 dcbef96a 7164709b 9957898e 348ab945 dc2f74cc d53caa75 329608a0 c2116f7d',
    '5af90663 59812676 662c426c cb586b7b 7d94d8a6 0481168c fa951b19 ae9ae30f 0ac9709a 76536512',
  ],
  add: [
    'aa276da0 8742553b b463751c e223c74b d987029d 21e41547 9905ea2e 58e234a5 76bf3ff1 d6639939',
    'bfa11f9b 9e879e23 99c688dd 2735a601 0b0909d3 fd213f2c dbc48d24 03c58274 73b80c28 e1076d85',
    '67bbfe6e 511cd502 4a8a12a3 011af1ea a6a9eccf 5b3b1938 7810ff79 7e6833ae f8cf561f 780ae64e',
  ],
  sub: [
    '97a2d50d af28b6d9 b74180ca 3cc13d66 62ab96b0 a8dffe08 9b512c9e 1cd1aa52 618527bf 980c23cd',
    '97a2d50d bf5a0f9e a755a981 3cc13d66 91129bec a79e69a0 0cff2ae3 652f8165 aca09fde 980c23cd',
    '97a2d50d 9359cf58 5455327d 934fefb2 493faacc 69088ccd 0cff2ae3 5ce186f0 2b662e9c 88c1adae',
  ],
  compare: [
    'abfd7e7d cb9f3857 ca509479 b8037c30 3002df10 31db5737 b2f66ec8 d9c8033e cde3231e fc302266',
    'e387514a 217bc720 f53c8c73 a30e866e b3dc9ee4 7a24c5e8 5c528cb9 e4730176 9ad5276e c21c1d5b',
    '6dfdc776 4e6d6c79 87bd6e2f 3dc37713 3c227764 ce25ec41 b272751c b0168fc8 a0628abb a62be3cb',
  ],
  pattern: [
    '1fb919c1 2d41d27b ff0574a6 beeda8ef 82867a67 7b142375 b9af15e0 303aab35 cb02f070 8fabface',
    'bb43f84d c968bca3 b07f06fc f7e4dee7 b825a97f 0718d203 ff81ea78 1025c48f 8369b6b4 d4677d0e',
    'c964bff9 9ec22047 941cba8d bedbe523 d2e3e1d4 fe81e59e 37f3d8dc d9f04041 7476ce5c 227f736a',
  ],
  odd: [
    '65c5b153 934804b0 179a406f 0a596451 366362c2 33637b12 86f52d46 387a1587 bf792cb7 c8b73e04',
    'af542e96 1aa5da5a 6f33b08e 42b55d69 413e7f59 8b5c23d5 e48d12bb ae604392 26f21af7 74c1b2f0',
    '2e80011a ad6e0617 2b46515a 45d7da05 69dd504d 1be07d4a b8bfbe51 439689f3 4e491aaf 4a0cc9c5',
  ],
  pairs: [
    'dfca967a 44b70386 20e2fabe 483bbb16 fe218926 47518a36 2270e06e d821c4a6 79cee9ee 26453f26',
    '12cbf5db eb980273 78080f5b 6e4c2093 174d1cbb 8d348e6b 8b897dd3 4f2bbbe3 eff6bd43 7cf409cb',
    'b9077fcf 2fa00acb ff205b93 bd1cd893 56c943cf 1608e66b ac1b675f 5abe126b 7faa7e83 8a862bef',
  ],
  order: [
    '3e96fffd 778dc691 869c6d39 3877c709 43abf645 70284dd9 70284dd9 43abf645 ea0d82c5 be750171',
    '327f3c81 c53bc242 3bbbf4b4 7ef860c1 e6d2d822 8e94a0e0 cc111928 bea1e0d3 06f8bf85 cde7681d',
    '617798e5 0f52d0be 014b9b43 7abcfb73 aee84191 b692abbb 5a9a3c54 36e20ec1 614bf0a9 31ea7601',
  ],
  sort: [
    'c26bd3a1 48cbcc5b 88d45334 5be2e39a 558409b2 facc131d de738d0b 959f1874 6f71555f c26bd3a1',
    '092a8530 da547918 5ad97a04 565c6a39 80207385 f08f751a 565c6a39 ea35f784 97dd3583 092a8530',
    '2ea2941b de1536d8 82f327c4 2c9c89f6 de1536d8 a0a8cb67 df40eef6 133c77c4 97dd3583 092a8530',
  ],
  simon: [
    '7a976a54 96e8d247 d13e1552 872856e5 43a918c9 88bb941a 281669b9 d0c47740 347f7986 fc101a62',
    '70233ce5 3ec8d238 faf6dd0b 3094877f e1e57026 fcc7d7cb d9d8fc13 f30c275a 57f9120c a33cc5db',
    '0673ce2b ba1ac4ed 5a5250a1 756bc84d aaab1b3f 1d9cfde1 8b836369 a916ea8b cc482f73 b4573141',
  ],
  // The composition of a number came after the split (LEARN-06, LEARN-07): recorded when it was made. It has no levels
  // 1-2 of its own and plays levels 1-3 alike (the missing addend up to 10; the house is the same on every level).
  missing: ['c2f2488c a2dd18e2 44052225 a60f6c9a 60dee478 84c7dcbd 922919d1 0df8fcff 12d8c1d1 88d9b4bf', 'c2f2488c a2dd18e2 44052225 a60f6c9a 60dee478 84c7dcbd 922919d1 0df8fcff 12d8c1d1 88d9b4bf', 'c2f2488c a2dd18e2 44052225 a60f6c9a 60dee478 84c7dcbd 922919d1 0df8fcff 12d8c1d1 88d9b4bf'],
  house: ['20334d86 5fdc32ce 8a854d79 90fbb39c c230d66e 3b82f54d cac385fb f0af8ec2 196f804e f1ed93a3', '20334d86 5fdc32ce 8a854d79 90fbb39c c230d66e 3b82f54d cac385fb f0af8ec2 196f804e f1ed93a3', '20334d86 5fdc32ce 8a854d79 90fbb39c c230d66e 3b82f54d cac385fb f0af8ec2 196f804e f1ed93a3'],
  // The neighbours of a number and the signs came after the split (LEARN-08, LEARN-09): recorded when they were made.
  // Each is one kind on every level (the skill plays them on its 4 and 5, tasks/index.ts BY_LEVEL).
  neighbors: ['30369aec 727b44ca f3920ca3 0ef45512 2c5c994b 3c92a61b ae338323 d9f17adf 2acb9980 fc0b66f6', '30369aec 727b44ca f3920ca3 0ef45512 2c5c994b 3c92a61b ae338323 d9f17adf 2acb9980 fc0b66f6', '30369aec 727b44ca f3920ca3 0ef45512 2c5c994b 3c92a61b ae338323 d9f17adf 2acb9980 fc0b66f6'],
  signs: ['48bfa99e 9a3217c8 e28f4344 e29e7b44 8f952c4d 3ded5b3d 40fc8468 d91ec698 68fa82d7 6966ac39', '48bfa99e 9a3217c8 e28f4344 e29e7b44 8f952c4d 3ded5b3d 40fc8468 d91ec698 68fa82d7 6966ac39', '48bfa99e 9a3217c8 e28f4344 e29e7b44 8f952c4d 3ded5b3d 40fc8468 d91ec698 68fa82d7 6966ac39'],
  // Find the differences (LEARN-18) came after the split: recorded when it was made.
  diff: ['c085b1d1 171cedef 5216e01d 90091ab0 4a94762a 0efba182 05d5e445 936d9513 1defa07e afa01384', '8cef02ef 8be74a98 8cfde50b 0439dfbc 492b0c25 abedf56b 4587394c 6319e8ec a1eaf0fb 40b4b825', '695e7300 f4959c00 d83c1146 5db1dc04 2382482c 5b80873c 1e17f0e0 ef07394e e26d6520 26438270'],
  // The puzzle (LEARN-19) came after the split: recorded when it was made.
  puzzle: ['9cf7312d 829f6a59 f9b1a967 7bfd990d 27b869fd 44db2f59 383850c9 d9ad0361 e1efe62f bfc920b9', '59cb0c6c a3f41d19 362ffb79 663deea6 33ce96e1 ce9dd92f 0b6e6a3b ce530c44 4b5b20a0 cc2259f0', 'd0697bf6 519e030b e3c0ef1d 92b9bf30 901c3dc9 743cec5b 39a05fd1 5b975010 517ebf86 532739b4'],
};

describe('one seed builds the same task as before the split (ARCH-09, R20)', () => {
  it('the table covers every task type', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...TYPES].sort());
  });

  describe.each(TYPES)('%s', (type) => {
    it.each([1, 2, 3])('level %i: ten seeds give the recorded tasks', async (level) => {
      const got = SEEDS.map((seed) => shot(type, level, seed)).join(' ');
      expect(got).toBe(EXPECTED[type][level - 1]);
      await breathe();
    });
  });
});
