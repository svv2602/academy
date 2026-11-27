// The pure helpers of the grey builds' routes (tools/forest-grey.mjs, tools/sea-grey.mjs, tools/sweet-grey.mjs): the legs
// of a route, the path between two zones, its length, the frame budget of a point. No browser and no build here: the
// CI job "plan" loads tools/worlds.mjs, which reaches these through tools/sweet-grey.mjs, without `npm ci` - a static
// import of playwright-core anywhere on that chain fails it (tools/ci-pieces.test.mjs checks the chain).

/** The legs of a route: consecutive targets, each pair once. */
export function routeLegs(route) {
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    if (!legs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) legs.push([a, b]);
  }
  return legs;
}

/** The line of points from zone `a` to zone `b` among `paths` (either way round), or null. */
export function pathBetween(paths, zones, a, b) {
  const same = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) < 1e-6;
  for (const p of paths) {
    if (same(p[0], zones[a]) && same(p[p.length - 1], zones[b])) return p;
    if (same(p[0], zones[b]) && same(p[p.length - 1], zones[a])) return [...p].reverse();
  }
  return null;
}

/** The frame budget of a point of a world of the shelf on q2 - worlds 2-5 (the lead's, 2026-11-21 and 2026-11-22): triangles and draw calls. */
export const BUDGET = { tris: 600000, calls: 112 };
/** The points of `views` and `tour` over BUDGET: their names and numbers. */
export function overBudget(views, tour, budget = BUDGET) {
  return [...views.map((v) => ({ at: `${v.from} -> ${v.to}`, calls: v.calls, tris: v.tris })), ...tour.map((t) => ({ at: `tour ${t.point}`, calls: t.calls, tris: t.tris }))]
    .filter((p) => p.tris > budget.tris || p.calls > budget.calls);
}

/**
 * `--budget` of the grey walkthroughs (the CI job "budget", .github/workflows/ci.yml): the draw of every point only - no
 * walk of the paths, no pictures, no checks of the look. Under the runner's software drawing a frame takes about a
 * second and the game's time steps 0.05 s a frame (src/game/loop.ts), so the seconds of game time the full measure waits
 * at a point were minutes there. A point is measured BUDGET_FRAMES frames after she is put on it, the camera put at once
 * where it would come to rest (src/game/debug.ts settleCamera) and the world's things near her shown (their `update`).
 */
export const BUDGET_FRAMES = 4;
/** Waits BUDGET_FRAMES frames of `page`, the camera snapped on the first. */
export const budgetSettle = (page) => page.evaluate((n) => new Promise((r) => {
  __game.settleCamera();
  let k = 0;
  const f = () => (++k >= n ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), BUDGET_FRAMES);

/** m along a line of points. */
export const lengthOf = (line) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);
