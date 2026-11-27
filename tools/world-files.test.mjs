// Runs in `npm test`: which part of the build a file belongs to (tools/world-files.mjs) - the groups the size budget
// of tools/dist-size.mjs is counted by.
import { describe, expect, it } from 'vitest';
import { BANK, CORE, EN, WORLD_FOLDERS, groupOf, isBank, isEn, isVoice, worldGroup, worldOf } from './world-files.mjs';

describe('the part of the build a file belongs to', () => {
  it('gives a next world the files inside its own folders of models, voice, story frames and code (TECH-09)', () => {
    expect(WORLD_FOLDERS).toEqual(['models', 'voice', 'story', 'code']);
    for (const path of ['models/probe/tree.glb', 'models/probe/tex/bark.webp', 'voice/probe/intro.mp3', 'story/probe/01.webp', 'code/probe/probe-1a2b.js']) {
      expect([path, worldOf(path, ['probe'])]).toEqual([path, 'probe']);
      expect([path, groupOf(path, ['probe'])]).toEqual([path, 'world:probe']);
    }
    expect(worldGroup('probe')).toBe('world:probe');
    // Each world gets its own files, whatever the order of the list.
    expect(groupOf('models/sea/fish.glb', ['probe', 'sea'])).toBe('world:sea');
    expect(groupOf('voice/probe/intro.mp3', ['sea', 'probe'])).toBe('world:probe');
  });

  it('keeps everything else in the group of the core and the first world: they lie as they always did', () => {
    const worlds = ['probe', 'sea'];
    for (const path of ['index.html', 'sw.js', 'assets/index-abc.js', 'models/hero/base.glb', 'models/nature2/Fern.glb', 'voice/intro.mp3',
      // the folder of the first world, were it to get one: `fairy` is not a next world
      'models/fairy/castle.glb', 'voice/fairy/intro.mp3', 'story/fairy/01.webp']) {
      expect([path, groupOf(path, worlds)]).toEqual([path, CORE]);
      expect([path, worldOf(path, worlds)]).toEqual([path, null]);
    }
    expect(CORE).toBe('core');
  });

  it('does not take a file merely named after a world for the world\'s', () => {
    const worlds = ['probe', 'sea'];
    // a file, not a folder; another folder of the build; a longer or shorter name; the id deeper in the path
    for (const path of ['models/probe.glb', 'voice/probe.mp3', 'models/probe', 'assets/probe/x.js', 'probe/models/x.glb', 'models/seaside/x.glb',
      'models/se/x.glb', 'models/hero/probe/x.glb', 'voice/old/sea/x.mp3']) {
      expect([path, groupOf(path, worlds)]).toEqual([path, CORE]);
    }
  });

  it('knows no next worlds unless they are listed', () => {
    expect(groupOf('models/probe/tree.glb')).toBe(CORE);
    expect(worldOf('models/probe/tree.glb')).toBe(null);
    expect(groupOf('models/probe/tree.glb', [])).toBe(CORE);
  });

  it('keeps the bank apart from the core and from every world', () => {
    expect(BANK).toBe('bank');
    expect(groupOf('bank/q_add_1_2.mp3', ['probe'])).toBe(BANK);
    expect(groupOf('bank/probe/x.mp3', ['probe'])).toBe(BANK);
    // Only the folder bank/ is the bank.
    expect(groupOf('assets/bank.js', ['probe'])).toBe(CORE);
    expect(groupOf('models/probe/bank/x.glb', ['probe'])).toBe('world:probe');
    expect([isBank('bank/x.mp3'), isBank('assets/bank.js'), isBank('voice/bank/x.mp3')]).toEqual([true, false, false]);
  });

  it('keeps the English clips (en/, Season 2) apart from the core, the bank and every world', () => {
    expect(EN).toBe('en');
    expect(groupOf('en/wb_w_owl.mp3', ['probe'])).toBe(EN);
    expect(groupOf('en/probe/x.mp3', ['probe'])).toBe(EN);
    // Only the folder en/ is the English bank.
    expect([groupOf('assets/en.js', ['probe']), groupOf('voice/en/x.mp3', []), groupOf('models/probe/en/x.glb', ['probe'])]).toEqual([CORE, CORE, 'world:probe']);
    expect([isEn('en/x.mp3'), isEn('assets/en.js'), isEn('bank/en/x.mp3'), isVoice('en/x.mp3'), isBank('en/x.mp3')]).toEqual([true, false, false, false, false]);
  });

  it('tells the voice by the folder voice/, of the first load and of a next world alike', () => {
    expect([isVoice('voice/intro.mp3'), isVoice('voice/probe/intro.mp3')]).toEqual([true, true]);
    expect([isVoice('assets/voice.js'), isVoice('models/probe/voice/x.glb'), isVoice('bank/x.mp3'), isVoice('story/probe/01.webp')]).toEqual([false, false, false, false]);
  });
});
