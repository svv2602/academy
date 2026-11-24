// What the way between the hub and the forest expects of the arches (tools/hub-grey.mjs `hubExpect`), held to the
// hub's own rules (src/worlds/hub/portals.ts) for the worlds of each build: the published one (the forest), the grey
// one (the forest, the sea, the Sweet Land) and the probe one. No browser.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorlds, hubExpect } from './hub-grey.mjs';
import { GREY_PARTS, NO_PROBE_PARTS, PUBLISH_PARTS } from './worlds.mjs';
import { openArches, portalWorlds, wakingArches, woke } from '../src/worlds/hub/portals.ts';

/** The places of the shelf of the worlds (src/worlds/<id>/index.ts `shelf`, `test`): the hub has none. */
const PLACE = { fairy: { shelf: 0 }, hub: {}, probe: { shelf: 1, test: true }, forest: { shelf: 1 }, sea: { shelf: 2 }, sweet: { shelf: 3 } };
/** The registry of a build: its worlds in the order src/worlds/index.ts lists them. */
const registry = (ids) => ids.map((id) => ({ id, ...PLACE[id] }));

/** What the hub shows with the worlds `ids` for the worlds done `done`, entered with no arch awake yet. */
function hubShows(ids, done) {
  const open = openArches(portalWorlds(registry(ids)), (id) => done.includes(id));
  return { arches: open, woke: wakingArches(open, {}) };
}

describe('the way between the hub and the forest: what the arches show by the worlds of the build', () => {
  it.each([
    ['the published build before the sea (the forest)', ['fairy', 'hub', 'forest'], ['forest']],
    ['the published build (the forest, the sea)', ['fairy', 'hub', 'forest', 'sea'], ['forest', 'sea']],
    ['the grey build (the forest, the sea, the Sweet Land)', ['fairy', 'hub', 'forest', 'sea', 'sweet'], ['forest', 'sea', 'sweet']],
  ])('%s: hubExpect is what the hub\'s rules give', (_, ids, next) => {
    const want = hubExpect(next);
    expect(hubShows(ids, ['fairy'])).toEqual(want.fairies);
    expect(hubShows(ids, ['fairy', 'forest'])).toEqual({ arches: want.forest.arches, woke: want.forest.woke });
    // the flags set as they wake: woke<shelf> of each (src/worlds/hub/index.ts), never one of a place that slept
    expect(want.forest.woke.map(woke).every((f) => want.forest.flags.includes(f))).toBe(true);
    expect(want.forest.none.some((f) => want.forest.woke.map(woke).includes(f))).toBe(false);
    // a save from before the sea was in the build: the forest's arch awake already
    if (want.older) {
      const open = openArches(portalWorlds(registry(ids)), (id) => ['fairy', 'forest'].includes(id));
      expect(wakingArches(open, { woke1: true })).toEqual(want.older.woke);
      expect(want.older.flags).toContain(woke(2));
    } else expect(next).not.toContain('sea');
  });

  it('without the sea in the build, the forest done wakes the forest\'s arch alone and the sea\'s place sleeps', () => {
    expect(hubExpect(['forest']).forest).toEqual({ arches: ['fairy', 'forest', null, null, null], woke: [1], flags: ['woke1'], none: ['woke2', 'sea_wake'] });
    expect(hubExpect(['forest']).older).toBeNull();
    expect(hubExpect(['forest', 'sea']).forest.arches).toEqual(['fairy', 'forest', 'sea', null, null]);
  });

  it('the part "hub-forest" holds a publication and needs no probe build; "hub-grey" stays a part of ci.yml alone', () => {
    expect(PUBLISH_PARTS).toContain('hub-forest');
    expect(GREY_PARTS).not.toContain('hub-forest');
    expect(PUBLISH_PARTS).not.toContain('hub-grey');
    expect(NO_PROBE_PARTS).toEqual([...GREY_PARTS, 'hub-forest', 'forest']);
  });

  it('buildWorlds reads the next worlds of a build from its worlds.json; none without the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-way-'));
    expect(buildWorlds(dir)).toEqual([]);
    writeFileSync(join(dir, 'worlds.json'), JSON.stringify({ worlds: { forest: { files: [] } } }));
    expect(buildWorlds(dir)).toEqual(['forest']);
  });
});

describe('the probe build: the probe world stands behind the forest\'s arch', () => {
  // The probe world and the forest share the place 1 (the probe world is the second world's stand-in, R32); the hub
  // takes the first world of the registry with that place (portalWorlds). So the probe world must come before the
  // forest in src/worlds/index.ts, or the part "hub" of tools/worlds.mjs would find the forest behind that arch.
  const source = readFileSync(new URL('../src/worlds/index.ts', import.meta.url), 'utf8');
  const list = source.slice(source.indexOf('export const WORLDS'), source.indexOf('];', source.indexOf('export const WORLDS')));
  const order = ['fairy', 'hub', ...[...list.matchAll(/import\('\.\/(\w+)'\)/g)].map((m) => m[1])];

  it('the registry lists the probe world before the forest', () => {
    expect(order.slice(0, 2)).toEqual(['fairy', 'hub']);
    expect(order).toContain('probe');
    expect(order).toContain('forest');
    expect(order.indexOf('probe')).toBeLessThan(order.indexOf('forest'));
  });

  it('in the probe build (the published worlds and the probe world) the place 1 is the probe world\'s', () => {
    const probeBuild = order.filter((id) => id !== 'sea' && id !== 'sweet');
    expect(portalWorlds(registry(probeBuild))).toEqual(['fairy', 'probe', null, null, null]);
    // the forest put before it would take the place: what this test is for
    expect(portalWorlds(registry(['fairy', 'hub', 'forest', 'probe']))[1]).toBe('forest');
  });
});
