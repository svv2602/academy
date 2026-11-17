// @vitest-environment node
/**
 * What the first world tells the achievements (PLAY-08): the number of its ground stars and its chest among its secrets
 * (`groundStars`, `chest`, `secrets` of `fairy`, src/worlds/fairy/index.ts) must be what the world really lays out
 * (src/worlds/fairy/chest-stars.ts). The world's module needs the page, so both are read as text: a star or a secret
 * added there and not here turns this red.
 */
import { describe, expect, it } from 'vitest';

const raw = import.meta.glob(['./index.ts', './chest-stars.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const index = raw['./index.ts'], chestStars = raw['./chest-stars.ts'];

/** The literal of `fairy`'s field `name`, as written. */
const field = (name: string) => index.slice(index.indexOf('export const fairy')).match(new RegExp(`\\n  ${name}: ([^\\n]+),\\n`))?.[1];

describe('the first world\'s facts for the achievements', () => {
  it('groundStars is the number of the stars chest-stars.ts lays on the ground', () => {
    const spots = chestStars.match(/const starSpots: \[number, number\]\[\] = \[(.*)\];/)?.[1];
    expect(spots, 'starSpots of chest-stars.ts').toBeTruthy();
    const n = spots!.match(/\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/g)?.length ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(Number(field('groundStars'))).toBe(n);
  });

  it('the chest is a secret, and its flag is the one chest-stars.ts sets when it opens', () => {
    const chest = field('chest'), secrets = field('secrets');
    expect(chest).toBe("'chest'");
    expect(secrets).toMatch(/^\[.*\]$/);
    expect(secrets!.slice(1, -1).split(',').map((x: string) => x.trim())).toContain(chest);
    expect(chestStars).toContain(`ws.flags.${chest!.slice(1, -1)} = true`);
  });
});
