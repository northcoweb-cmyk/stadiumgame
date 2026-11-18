const { chromium } = require('playwright');
const { open } = require('./t3.js');
const results = [];
const check = (name, ok, info) => results.push([ok ? 'PASS' : 'FAIL', name, info]);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await open(b, { width: 1280, height: 760 });
  const E = (fn, arg) => p.evaluate(fn, arg);
  // start a game-day run
  const fresh = async (seed) => { await E((s) => { window.__nad.streakBrief(s); window.__nad.begin(); }, seed); };
  await fresh(4242);
  check('crowd fills the seats', await E(() => window.__nad.seats()) > 5000, await E(() => window.__nad.seats()));
  check('3 field security and 22 players on the field', await E(() => window.__nad.fieldSec().length === 3 && window.__nad.athletes().length === 22));
  // ---- security checkpoint: sprinting gets you pushed back, walking clears you
  const cp = await E(() => {
    const N = window.__nad, pl = N.player(), K = N.keys;
    pl.x = 64 * 16; pl.y = 87 * 16; pl.h = 0; N.setYaw(-Math.PI / 2); N.streak().prevY = pl.y;
    K['w'] = true; K['shift'] = true;
    for (let i = 0; i < 90; i++) N.step(1 / 60, 1);
    const pushed = !N.streak().cleared && pl.y > 84 * 16 + 8;
    K['shift'] = false;
    for (let i = 0; i < 200 && !N.streak().cleared; i++) N.step(1 / 60, 1);
    K['w'] = false;
    return { pushed, cleared: N.streak().cleared };
  });
  check('sprinting through the metal detector gets you sent back', cp.pushed, JSON.stringify(cp));
  check('walking through the detector clears security', cp.cleared, JSON.stringify(cp));
  // ---- pick a spot and vault the wall
  const v = await E(() => {
    const N = window.__nad, pl = N.player();
    pl.x = 41 * 16 + 4; pl.y = 33 * 16 + 8; pl.h = N.groundAt(pl.x, pl.y); pl.vh = 0; pl.onGround = true;
    const spot = N.vaultSpot();
    pl.jumpQueued = true;
    const hs = [];
    for (let i = 0; i < 90; i++) { N.step(1 / 60, 1); hs.push(pl.h); }
    return { spot: !!spot, onto: spot && spot.onto, peak: Math.max(...hs), endH: pl.h, entered: N.streak().entered, alert: N.streak().alert, mode: N.mode() };
  });
  check('front row offers a vault onto the field', v.spot && v.onto, JSON.stringify(v));
  check('vault arcs over the wall and lands on the turf', v.endH < -7.9 && v.peak > -6.5, `peak ${v.peak.toFixed(2)} end ${v.endH.toFixed(2)}`);
  check('landing starts the streak and alerts security', v.entered && v.alert && v.mode === 'play', JSON.stringify(v));
  // isolate the player from the football players for the mechanic tests
  const iso = () => E(() => { const N = window.__nad; for (const a of N.athletes()) { a.x = 1400; a.y = 600; a.cd = 999; a.state = 'react'; } });
  // ---- juke: hard cut makes a committed chaser overshoot
  await iso();
  const juke = await E(() => {
    const N = window.__nad, pl = N.player(), K = N.keys, S = N.fieldSec();
    pl.x = 900; pl.y = 768; pl.h = -8; pl.vh = 0; pl.onGround = true; N.setYaw(0); pl.stam = 100;
    S.forEach((s, i) => { s.x = 300 + i * 40; s.y = 600; s.state = 'down'; s.t = 99; s.vx = s.vy = 0; });
    const g = S[0]; g.state = 'chase'; g.t = 0; g.x = pl.x - 34; g.y = pl.y; g.vx = 58; g.vy = 0; g.cd = 99;
    const d0 = N.streak().dodges;
    K['w'] = true; for (let i = 0; i < 14; i++) N.step(1 / 60, 1);
    K['w'] = false; K['s'] = true; for (let i = 0; i < 12; i++) N.step(1 / 60, 1);
    K['s'] = false;
    const st = g.state, dodges = N.streak().dodges - d0;
    // keep running away while he recovers
    N.setYaw(Math.PI); K['w'] = true; let maxGap = 0;
    for (let i = 0; i < 40; i++) { N.step(1 / 60, 1); maxGap = Math.max(maxGap, Math.hypot(g.x - pl.x, g.y - pl.y)); }
    K['w'] = false; const after = g.state, mode = N.mode(); g.state = 'down'; g.t = 99;
    return { st, dodges, after, maxGap: +maxGap.toFixed(1), mode };
  });
  check('cutting back on a chaser jukes him (he stumbles)', (juke.st === 'stumble' || juke.st === 'down') && juke.dodges >= 1 && juke.mode === 'play', JSON.stringify(juke));
  // ---- spin move
  const spin = await E(() => {
    const N = window.__nad, pl = N.player(), K = N.keys, S = N.fieldSec();
    const g = S[1]; g.state = 'chase'; g.x = pl.x - 22; g.y = pl.y; g.vx = 55; g.vy = 0; g.cd = 99; pl.spinCd = 0; pl.stam = 100;
    N.setYaw(0); K['w'] = true; N.step(1 / 60, 2); pl.spinQueued = true; N.step(1 / 60, 3); K['w'] = false;
    const r = { st: g.state, spin: pl.spin > 0, mode: N.mode() };
    g.state = 'down'; g.t = 99; return r;
  });
  check('Q spin move bursts away and makes the chaser whiff', spin.st === 'stumble' && spin.spin && spin.mode === 'play', JSON.stringify(spin));
  // ---- low dive: jump over it, diver faceplants
  const low = await E(() => {
    const N = window.__nad, pl = N.player(), S = N.fieldSec(), g = S[2];
    pl.x = 1000; pl.y = 700; pl.h = -8; pl.vh = 0; pl.onGround = true; pl.vx = pl.vy = 0;
    g.x = pl.x - 26; g.y = pl.y; g.state = 'wind'; g.dtype = 'low'; g.t = .05; g.vx = g.vy = 0; g.cd = 99;
    const d0 = N.streak().dodges;
    N.step(1 / 60, 4); pl.jumpQueued = true;
    let maxAir = 0; for (let i = 0; i < 45; i++) { N.step(1 / 60, 1); maxAir = Math.max(maxAir, g.air || 0); }
    const r = { mode: N.mode(), st: g.state, skid: g.skid, dodges: N.streak().dodges - d0, maxAir }; g.t = 99; return r;
  });
  check('jumping over a low diving tackle dodges it', low.mode === 'play' && low.dodges >= 1, JSON.stringify(low));
  check('the diver who misses falls on his face', low.st === 'down', JSON.stringify(low));
  // ---- flying leap: slide under it
  const leap = await E(() => {
    const N = window.__nad, pl = N.player(), K = N.keys, S = N.fieldSec(), g = S[0];
    S.forEach((s) => { s.state = 'down'; s.t = 99; s.x = 300; s.y = 600; });
    pl.x = 1100; pl.y = 800; pl.h = -8; pl.vh = 0; pl.onGround = true; pl.slideCd = 0; pl.stam = 100; N.setYaw(Math.PI);
    g.x = pl.x - 40; g.y = pl.y; g.state = 'wind'; g.dtype = 'leap'; g.t = .02; g.vx = g.vy = 0; g.cd = 99;
    const d0 = N.streak().dodges;
    K['w'] = true; N.step(1 / 60, 3); pl.slideQueued = true;
    let maxAir = 0; for (let i = 0; i < 40; i++) { N.step(1 / 60, 1); maxAir = Math.max(maxAir, g.air || 0); }
    K['w'] = false;
    const r = { mode: N.mode(), st: g.state, dodges: N.streak().dodges - d0, maxAir }; g.t = 99; return r;
  });
  check('flying leap sails higher than a low dive', leap.maxAir > low.maxAir + .3, `${leap.maxAir.toFixed(2)} vs ${low.maxAir.toFixed(2)}`);
  check('sliding under a flying leap dodges it, leaper eats turf', leap.mode === 'play' && leap.dodges >= 1 && leap.st === 'down', JSON.stringify(leap));
  // ---- stamina + energy drinks
  const stam = await E(() => {
    const N = window.__nad, pl = N.player(), K = N.keys;
    N.fieldSec().forEach((s) => { s.state = 'down'; s.t = 999; s.x = 300; s.y = 600; });
    pl.x = 1000; pl.y = 768; pl.h = -8; pl.stam = 100; pl.boost = 0; pl.exhausted = false; N.setYaw(0);
    K['w'] = true; K['shift'] = true;
    const x0 = pl.x; N.step(1 / 60, 60); const sprintDist = pl.x - x0, s1 = pl.stam;
    N.step(1 / 60, 240); const exhausted = pl.exhausted, s2 = pl.stam;
    K['shift'] = false; K['w'] = false;
    const e = { x: pl.x, y: pl.y, got: false, t: 0 }; N.energies().push(e); N.step(1 / 60, 2);
    return { sprintDist, s1, s2, exhausted, after: pl.stam, boost: pl.boost, got: e.got };
  });
  check('sprinting drains stamina', stam.s1 < 80, JSON.stringify(stam));
  check('running out of stamina leaves you gassed', stam.exhausted, JSON.stringify(stam));
  check('energy drink refills stamina and gives a boost', stam.got && stam.after > 99 && stam.boost > 3, JSON.stringify(stam));
  // ---- crowd hype climbs and security reinforcements cap at 8
  const sp = await E(() => {
    const N = window.__nad, st = N.streak(), pl = N.player();
    const h0 = st.hype; const counts = [];
    for (let k = 0; k < 9; k++) {
      N.fieldSec().forEach((s) => { s.state = 'down'; s.t = 999; s.x = 300; s.y = 600; });
      st.spawnT = 29.9; N.step(1 / 60, 10); counts.push(N.fieldSec().length);
    }
    return { counts, h0, h1: st.hype, mode: N.mode() };
  });
  check('a new guard every 30 s, capped at 8', sp.counts.join() === '4,5,6,7,8,8,8,8,8', sp.counts.join());
  check('crowd hype climbs while you stay on the field', sp.h1 > sp.h0, `${sp.h0.toFixed(1)} -> ${sp.h1.toFixed(1)}`);
  // ---- escape after a full minute
  const esc = await E(() => {
    const N = window.__nad, pl = N.player(), st = N.streak();
    st.fieldTime = 64; pl.x = 64 * 16; pl.y = 92 * 16; pl.h = 0; pl.vault = null; N.step(1 / 60, 2);
    return { mode: N.mode(), escaped: st.escaped, txt: document.getElementById('resultCard').textContent };
  });
  check('getting out of the stadium after a minute wins', esc.mode === 'escaped' && /got away/i.test(esc.txt), esc.mode);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'shots/s-escaped.png' });
  // ---- caught: tackle, cuffs, escort, jail, booking
  await fresh(777);
  await E(() => { const N = window.__nad, pl = N.player(); N.streak().cleared = true; pl.x = 1000; pl.y = 768; pl.h = -8; N.step(1 / 60, 2); });
  await iso();
  const ar = await E(() => {
    const N = window.__nad, pl = N.player(), g = N.fieldSec()[0];
    g.state = 'chase'; g.x = pl.x - 5; g.y = pl.y; g.vx = g.vy = 0; pl.slide = 0; pl.spin = 0;
    N.step(1 / 60, 2);
    return { mode: N.mode(), pinned: g.state };
  });
  check('a grab while not sliding starts the arrest', ar.mode === 'arrest' && ar.pinned === 'pin', JSON.stringify(ar));
  await p.waitForTimeout(1600);
  await p.screenshot({ path: 'shots/s-tackle.png' });
  const cuffs = await E(() => { const N = window.__nad; N.step(1 / 30, 110); return { cuffed: N.arrestState().cuffed, mode: N.mode() }; });
  check('handcuffs go on during the arrest', cuffs.cuffed, JSON.stringify(cuffs));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'shots/s-cuffed.png' });
  const jail = await E(async () => { const N = window.__nad; N.step(1 / 30, 200); await new Promise((r) => setTimeout(r, 1500)); return { mode: N.mode(), txt: document.getElementById('resultCard').textContent, shown: !document.getElementById('result').hidden }; });
  check('escorted off and booked in the holding cell', jail.mode === 'jail' && jail.shown && /Booked/i.test(jail.txt), jail.mode);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: 'shots/s-jail.png' });
  const errs = p.errs.filter((e) => !/GPU stall|GL Driver/.test(e));
  check('no runtime errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of results) console.log(r[0], '-', r[1], r[2] ? '  [' + r[2] + ']' : '');
  console.log(results.filter((r) => r[0] === 'FAIL').length + ' failing');
  await b.close();
})();
