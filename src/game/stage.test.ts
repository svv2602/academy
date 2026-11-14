import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playScene, sceneFailed, type Stage } from './stage';

/** A stage the way the game keeps it: one flag, plus a record of what was called and in which order. */
function makeStage() {
  const log: string[] = [];
  let held = false;
  const stage: Stage = {
    busy: () => held,
    take: () => { held = true; log.push('take'); },
    release: () => { held = false; log.push('release'); },
  };
  return { stage, log, held: () => held };
}

describe('playScene', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errors = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errors.mockRestore(); });

  it('holds the controls while the scene runs and gives them back once when it ends', async () => {
    const { stage, log, held } = makeStage();
    let end!: () => void;
    const running = playScene(stage, 'talk', () => new Promise<void>((r) => { end = () => { log.push('body'); r(); }; }));
    expect(held()).toBe(true);
    expect(log).toEqual(['take']);
    end();
    expect(await running).toBe('done');
    expect(held()).toBe(false);
    expect(log).toEqual(['take', 'body', 'release']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('gives the controls back when the scene throws, and reports the error', async () => {
    const { stage, log, held } = makeStage();
    const boom = new Error('boom');
    const end = await playScene(stage, 'finale', () => { throw boom; });
    expect(end).toBe('failed');
    expect(held()).toBe(false);
    expect(log).toEqual(['take', 'release']);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith('scene "finale" failed:', boom);
  });

  it('gives the controls back when the scene rejects after a pause, and reports the error', async () => {
    const { stage, log, held } = makeStage();
    const boom = new Error('later');
    const end = await playScene(stage, 'finale', async () => { await Promise.resolve(); log.push('body'); throw boom; });
    expect(end).toBe('failed');
    expect(held()).toBe(false);
    expect(log).toEqual(['take', 'body', 'release']);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(sceneFailed('finale'), boom);
  });

  it('gives the controls back when taking them fails half-way', async () => {
    const { stage, log, held } = makeStage();
    const take = stage.take;
    stage.take = () => { take(); throw new Error('half'); };
    expect(await playScene(stage, 'talk', () => { log.push('body'); })).toBe('failed');
    expect(held()).toBe(false);
    expect(log).toEqual(['take', 'release']);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('refuses a second scene while one is running: nothing is taken, run, released or reported', async () => {
    const { stage, log, held } = makeStage();
    let end!: () => void;
    const first = playScene(stage, 'talk', () => new Promise<void>((r) => { end = r; }));
    const body = vi.fn();
    expect(await playScene(stage, 'finale', body)).toBe('refused');
    expect(body).not.toHaveBeenCalled();
    expect(held()).toBe(true);                // the first scene still holds the controls
    expect(log).toEqual(['take']);
    end();
    expect(await first).toBe('done');
    expect(log).toEqual(['take', 'release']);
    expect(errors).not.toHaveBeenCalled();
  });

  it('starts the next scene after a failed one', async () => {
    const { stage, log } = makeStage();
    expect(await playScene(stage, 'finale', () => Promise.reject(new Error('first')))).toBe('failed');
    const body = vi.fn();
    expect(await playScene(stage, 'finale', body)).toBe('done');
    expect(body).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['take', 'release', 'take', 'release']);
    expect(errors).toHaveBeenCalledTimes(1);
  });
});
