// The measure of the feet (tools/feet.mjs, the block "pet" of tools/shot.mjs): which part of a character stands on the
// ground and how fast it slides over it while the body moves. Runs in a page of the game with ?debug.
//
// A foot is the lowest part of a character - the vertices of its skinned meshes within the lowest 4 % of its height in
// its standing pose, by side (and front and back for four legs; the cat has no bones in its legs) - or, where it has
// them, the bone of the ball of the foot (the heroine: the middle of a sole rolls from heel to toes while it stands) or
// of the toes (the cat: four of them).
// In a frame the body stands on its lowest foot when that one is near its lowest (3 % of the height, 2 cm at least)
// and goes back under the body; its speed over the ground then is the slide.

/** Puts the helpers into the page: window.__feet(actor, four) and window.__mid(group). */
export async function installFeet(page) {
await page.evaluate(() => {
  const { THREE } = __game, v = new THREE.Vector3();
  window.__feet = (actor, four) => {
    // chosen in the standing pose (both feet down), then the pose of the moment is played on again
    actor.play('Idle', 0, 1); for (let i = 0; i < 60; i++) actor.update(1 / 60);
    actor.root.updateMatrixWorld(true);
    const verts = [];
    actor.model.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); verts.push({ m, i, y: v.y, x: v.x, z: v.z }); }
    });
    let lo = Infinity, hi = -Infinity;
    for (const p of verts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    const inv = actor.root.matrixWorld.clone().invert(), groups = {};
    for (const p of verts) {
      if (p.y > lo + (hi - lo) * 0.04) continue;
      const l = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(inv);
      const key = (l.x < 0 ? 'R' : 'L') + (four ? (l.z < 0 ? 'B' : 'F') : '');
      (groups[key] ??= []).push(p);
    }
    // a character with the bones of the balls of its feet (the heroine): the ball is the point she stands on - the middle
    // of a sole rolls from the heel to the toes and moves while the foot stands
    const balls = {};
    actor.model.traverse((o) => { if (o.isBone && /^ball_[lr]$/.test(o.name)) balls[o.name.endsWith('l') ? 'L' : 'R'] = [{ bone: o }]; });
    if (Object.keys(balls).length === 2) return { groups: balls, height: hi - lo };
    // four legs with the bones of their toes (the Meshy cat: frontToe.L ... rearToe.R; three.js drops the dots of node names): a toe is the point it stands on
    // (its idle stands on one paw lower than the others, so the lowest vertices would find one foot only)
    const toes = {};
    actor.model.traverse((o) => { const m = o.isBone && /^(front|rear)Toe\.?([LR])$/.exec(o.name); if (m) toes[m[2] + (m[1] === 'front' ? 'F' : 'B')] = [{ bone: o }]; });
    return { groups: Object.keys(toes).length === 4 ? toes : groups, height: hi - lo };
  };
  window.__mid = (group) => {
    if (group[0].bone) return group[0].bone.getWorldPosition(new THREE.Vector3());
    const s = new THREE.Vector3();
    for (const p of group) { group[0].m.getVertexPosition(p.i, v); s.add(v.applyMatrix4(p.m.matrixWorld)); }
    return s.multiplyScalar(1 / group.length);
  };
});
}

/** Starts recording the heroine, the cat and the pet (the ones of `who`) every frame. */
export async function startSlide(page, who = ['hero', 'cat', 'pet']) {
await page.evaluate((who) => {
  const all = { hero: [__game.hero, false], cat: [__game.cat, true], pet: [__game.pet, true] };
  const cast = Object.fromEntries(who.map((k) => [k, all[k]]));
  const measured = Object.fromEntries(Object.entries(cast).map(([k, [a, four]]) => [k, window.__feet(a, four)]));
  const feet = Object.fromEntries(Object.entries(measured).map(([k, m]) => [k, m.groups]));
  window.__feetHeight = Object.fromEntries(Object.entries(measured).map(([k, m]) => [k, m.height]));
  const log = window.__feetLog = Object.fromEntries(Object.keys(cast).map((k) => [k, []]));
  const tick = () => {
    const t = __game.time;
    for (const [k, [a]] of Object.entries(cast)) {
      a.root.updateMatrixWorld(true);
      const mids = Object.fromEntries(Object.entries(feet[k]).map(([f, g]) => { const m = window.__mid(g); return [f, [m.x, m.y, m.z]]; }));
      log[k].push({ t, root: [a.root.position.x, a.root.position.z], y: a.root.position.y, mids });
    }
    if (!window.__feetStop) requestAnimationFrame(tick);
  };
  window.__feetStop = false;
  requestAnimationFrame(tick);
}, who);
}

/**
 * Stops the recording; by character: the mean slide of a standing foot (m/s), its share of the body's speed (all, and
 * in steady motion only - no start, stop or turn of the clip in the last third of a second), the worst, the samples.
 */
export async function endSlide(page) {
  return page.evaluate(() => {
  window.__feetStop = true;
  const out = {};
  for (const [k, frames] of Object.entries(window.__feetLog)) {
    // the height of a foot over the ground under the character (the root stands on it)
    const lo = {};
    for (const f of frames) for (const [n, m] of Object.entries(f.mids)) lo[n] = Math.min(lo[n] ?? Infinity, m[1] - f.y);
    let slide = 0, body = 0, n = 0, worst = 0, sSlide = 0, sBody = 0, sn = 0;
    const speedAt = (i) => i < 1 ? 0 : Math.hypot(frames[i].root[0] - frames[i - 1].root[0], frames[i].root[1] - frames[i - 1].root[1]) / Math.max(1e-6, frames[i].t - frames[i - 1].t);
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i], dt = b.t - a.t;
      if (dt <= 0) continue;
      const speed = Math.hypot(b.root[0] - a.root[0], b.root[1] - a.root[1]) / dt;
      if (speed < 0.05) continue;
      // the foot the body stands on: the lowest one, if it is down (within 3 % of its height of its lowest)
      let name = null;
      for (const f in b.mids) if (name === null || b.mids[f][1] - b.y < b.mids[name][1] - b.y) name = f;
      const near = Math.max(0.02, window.__feetHeight[k] * 0.03);   // down: within 3 % of its height (2 cm at least)
      if (b.mids[name][1] - b.y > lo[name] + near || a.mids[name][1] - a.y > lo[name] + near) continue;
      // and it goes back under the body (a foot swung forward low is not standing)
      const fx = b.mids[name][0] - a.mids[name][0], fz = b.mids[name][2] - a.mids[name][2];
      const bx = b.root[0] - a.root[0], bz = b.root[1] - a.root[1];
      if ((fx - bx) * bx + (fz - bz) * bz >= 0) continue;
      const s = Math.hypot(fx, fz) / dt;
      slide += s; body += speed; n++; worst = Math.max(worst, s);
      // steady: the speed within 10 % over the last third of a second (no start, stop or turn of the clip in it)
      let steady = i > 20;
      for (let j = i - 20; steady && j < i; j++) if (Math.abs(speedAt(j) - speed) > speed * 0.1) steady = false;
      if (steady) { sSlide += s; sBody += speed; sn++; }
    }
    const moved = frames.length ? Math.hypot(frames.at(-1).root[0] - frames[0].root[0], frames.at(-1).root[1] - frames[0].root[1]) : 0;
    out[k] = { moved: +moved.toFixed(2), frames: frames.length, samples: n, slide: +(slide / Math.max(1, n)).toFixed(3), share: +(slide / Math.max(1e-9, body)).toFixed(3), worst: +worst.toFixed(2), steady: +(sSlide / Math.max(1e-9, sBody)).toFixed(3), steadyN: sn };
  }
  return out;
});
}
