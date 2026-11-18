const { chromium } = require('playwright');
const { open } = require('./t3.js');
const results = [];
const check = (name, ok, info) => { results.push([ok ? 'PASS' : 'FAIL', name, info]); };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await open(b, { width: 1280, height: 760 });
  // ---- generation
  await p.evaluate(() => window.__nad.setMode('heist'));
  const solv = await p.evaluate(() => { let ok = 0; for (let i = 1; i <= 30; i++) { const r = window.__nad.validate(i * 7919); if (r.card && r.ball && r.kick) ok++; } return ok; });
  check('30 random nights solvable', solv === 30, solv + '/30');
  await p.evaluate(() => { window.__nad.brief(424242); window.__nad.begin(); });
  await p.waitForTimeout(500);
  // pause the RAF-driven sim from interfering: we drive update() manually in small steps
  // ---- kick physics
  const kp = await p.evaluate(() => {
    const N = window.__nad, w = N.world(), g = N.goalInfo();
    const sx = (w.kick.x - 1024) / 8, sz = (w.kick.y - 768) / 8, base = Math.atan2(-sz, g.X - sx);
    const r = {};
    r.center = N.simulateKick(base, 1, 0);
    r.weak = N.simulateKick(base, 0, 0);
    r.wide = N.simulateKick(base + 0.3, 1, 0);
    r.wideL = N.simulateKick(base - 0.3, 1, 0);
    // aim straight at an upright: expect a collision (doink)
    const upr = Math.atan2(2.31 - sz, g.X - sx);
    // find a power whose ball crosses the goal line mid-upright (between crossbar and upright top)
    let pw = 0.3; for (; pw <= 1; pw += 0.01) { const t = N.simulateKick(base, pw, 0); if (t.crossY > 5 && t.crossY < 8) break; }
    r.post = N.simulateKick(upr, pw, 0); r.post.pw = pw;
    // wind pushes the ball sideways
    r.windL = N.simulateKick(base, 1, -1.5); r.windR = N.simulateKick(base, 1, 1.5);
    // energy check: ball never gains height after apex with no collisions
    return Object.fromEntries(Object.entries(r).map(([k, b]) => [k, { good: b.good, why: b.why, hits: b.hits, crossZ: +b.crossZ.toFixed(2), crossY: +b.crossY.toFixed(2), t: +b.t.toFixed(2) }]));
  });
  check('full-power straight kick is good', kp.center.good, JSON.stringify(kp.center));
  check('zero-power kick falls short', !kp.weak.good && kp.weak.why === 'short', JSON.stringify(kp.weak));
  check('aim +0.3 rad misses wide', !kp.wide.good && /wide/.test(kp.wide.why), JSON.stringify(kp.wide));
  check('aim -0.3 rad misses the other way', !kp.wideL.good && /wide/.test(kp.wideL.why) && kp.wideL.why !== kp.wide.why, kp.wideL.why + ' vs ' + kp.wide.why);
  check('kick at upright collides with the post', kp.post.hits > 0, JSON.stringify(kp.post));
  check('wind deflects in opposite directions', kp.windL.crossZ < kp.center.crossZ && kp.windR.crossZ > kp.center.crossZ, `${kp.windL.crossZ} < ${kp.center.crossZ} < ${kp.windR.crossZ}`);
  // ---- ball trajectory sanity: max height & flight time vs closed form without drag
  const traj = await p.evaluate(() => {
    const N = window.__nad; // compare drag-free projectile apex with formula
    const v0 = 29, el = 0.66, apexNoDrag = (v0 * Math.sin(el)) ** 2 / (2 * 9.81);
    const g = N.goalInfo(); const b = { x: 0, y: -7.8, z: 0, vx: v0 * Math.cos(el), vy: v0 * Math.sin(el), vz: 0, windAcc: 0, t: 0, judged: true, good: false, hits: 0, bounces: 0, spin: 0 };
    let maxY = b.y, landT = null;
    // move goal far away so it doesn't interfere
    const farG = { side: 1, X: 9999, baseX: 9999 };
    for (let i = 0; i < 2400 && landT === null; i++) { const vy0 = b.vy; window.__nad.__step(b, 1 / 240, farG); maxY = Math.max(maxY, b.y); if (b.bounces > 0) landT = b.t; }
    return { apex: maxY + 7.8, apexNoDrag, landT, range: b.x };
  }).catch(e => ({ err: e.message }));
  if (traj.err) check('trajectory probe', false, traj.err);
  else check('drag lowers apex slightly below vacuum value', traj.apex < traj.apexNoDrag && traj.apex > traj.apexNoDrag * 0.8, JSON.stringify(traj));

  // ---- player physics: drive update() manually
  const walk = await p.evaluate(() => {
    const N = window.__nad, pl = N.player(), K = N.keys;
    // top aisle opening at tile x=40-41, rail row y=20, concourse above: start at (41*16, 18*16)
    pl.x = 41 * 16; pl.y = 18 * 16 + 8; pl.h = N.groundAt(pl.x, pl.y); pl.vh = 0; pl.onGround = true;
    N.setYaw(Math.PI / 2); // face +y (down into the bowl toward the field)
    K['w'] = true;
    const hs = [];
    for (let i = 0; i < 60 * 9; i++) { N.step(1 / 60, 1); if (i % 30 === 0) hs.push(+pl.h.toFixed(2)); }
    K['w'] = false;
    return { endY: pl.y / 16, endH: pl.h, hs, mode: N.state().mode };
  });
  const mono = walk.hs.every((h, i) => i === 0 || h <= walk.hs[i - 1] + 1e-6);
  check('walking down an aisle descends the stairs step by step', mono && walk.hs[walk.hs.length - 1] < -6, walk.hs.join(' '));
  check('field wall at aisle bottom stops the player (no keycard gate here)', walk.endY < 34.2, 'endY tile ' + walk.endY.toFixed(2));
  const up = await p.evaluate(() => {
    const N = window.__nad, pl = N.player(), K = N.keys;
    N.setYaw(-Math.PI / 2); K['w'] = true;
    for (let i = 0; i < 60 * 10; i++) N.step(1 / 60, 1);
    K['w'] = false; return { h: pl.h, y: pl.y / 16 };
  });
  check('walking back up the stairs returns to the concourse', Math.abs(up.h) < 0.05 && up.y < 20, JSON.stringify(up));
  const jump = await p.evaluate(() => {
    const N = window.__nad, pl = N.player();
    pl.x = 30 * 16; pl.y = 17 * 16 + 8; pl.h = 0; pl.vh = 0; pl.onGround = true;
    pl.jumpQueued = true; let peak = 0, t = 0, landed = null;
    for (let i = 0; i < 120; i++) { N.step(1 / 120, 1); t += 1 / 120; peak = Math.max(peak, pl.h); if (i > 2 && pl.onGround && landed === null) landed = t; }
    return { peak, landed };
  });
  const expPeak = 5.6 * 5.6 / (2 * 16), expT = 2 * 5.6 / 16;
  check('jump apex matches v²/2g', Math.abs(jump.peak - expPeak) < 0.06, `${jump.peak.toFixed(3)} vs ${expPeak.toFixed(3)}`);
  check('jump airtime matches 2v/g', Math.abs(jump.landed - expT) < 0.04, `${jump.landed.toFixed(3)} vs ${expT.toFixed(3)}`);
  const wall = await p.evaluate(() => {
    const N = window.__nad, pl = N.player(), K = N.keys;
    pl.x = 30 * 16; pl.y = 16 * 16 + 8; pl.h = 0; // concourse next to the room wall (y=14)
    N.setYaw(-Math.PI / 2); K['w'] = true;
    for (let i = 0; i < 240; i++) N.step(1 / 60, 1);
    K['w'] = false; return pl.y / 16;
  });
  check('cannot walk through a wall', wall > 15.0, 'y tile ' + wall.toFixed(3));
  // ---- full flow: keycard + balls, kick for real through the UI
  const flow = await p.evaluate(async () => {
    const N = window.__nad; N.give(); const k = N.world().kick; const pl = N.player(); pl.x = k.x; pl.y = k.y; pl.h = N.groundAt(k.x, k.y);
    return true;
  });
  await p.keyboard.press('e');
  for (let i = 0; i < 600; i++) { const v = await p.evaluate(() => { const s = window.__nad.kickNow(); return s ? s.aim - s.center : 9; }); if (Math.abs(v) < 0.015) break; await p.waitForTimeout(5); }
  await p.keyboard.press('e');
  await p.screenshot({ path: 'shots/3d-kick-aim.png' });
  for (let i = 0; i < 600; i++) { const v = await p.evaluate(() => { const s = window.__nad.kickNow(); return s ? s.power - s.pmin : -9; }); if (v > 0.12) break; await p.waitForTimeout(5); }
  await p.keyboard.press('e');
  await p.waitForTimeout(900);
  await p.screenshot({ path: 'shots/3d-kick-flight.png' });
  let m = '';
  for (let i = 0; i < 40; i++) { m = await p.evaluate(() => window.__nad.state().mode); if (m === 'kickgood' || m === 'win') break; const kk = await p.evaluate(() => !!window.__nad.kickNow()); if (!kk && m === 'play') break; await p.waitForTimeout(250); }
  await p.screenshot({ path: 'shots/3d-good.png' });
  check('aimed kick through the real UI is GOOD', m === 'kickgood' || m === 'win', 'mode ' + m);
  const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
  console.log('headless fps', fps);
  m = await p.evaluate(() => { window.__nad.step(1 / 30, 30 * 6); return window.__nad.state().mode; });
  check('celebration ends on the win screen', m === 'win', m);
  await p.screenshot({ path: 'shots/3d-win.png' });
  const errs = p.errs.filter(e => !/GPU stall|GL Driver/.test(e));
  check('no runtime errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '  [' + r[2] + ']' : '');
  console.log(results.filter(r => r[0] === 'FAIL').length + ' failing');
  await b.close();
})();
