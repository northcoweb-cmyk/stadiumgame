/* ============================================================
   GAME DAY STREAK mode
   Full crowd, game in progress. Clear security, pick an aisle,
   vault the wall, survive on the field, then escape the stadium.
   ============================================================ */
let GAME_MODE = "streak";
const isStreak = () => GAME_MODE === "streak";
let streak = null, fieldSec = [], athletes = [], refs = [], energies = [], seatSpots = [];
let arrest = null, jailGroup = null, jailLight = null, cuffMesh = null, escorts = [], crowdBoost = 0, chantT = 0;
const crowdU = { uTime: { value: 0 }, uAmp: { value: .15 }, uWave: { value: 0 } };
const ST = { run: 48, sprint: 80, boostMul: 1.3, guardSpeed: 60, diveSpeed: 92, diveTime: .42, windTime: .32, slideTime: .62, slideCd: .9, grabR: 9, maxSec: 8, spawnEvery: 30, goal: 60 };
const ARCH = { x0: 63 * T, x1: 65 * T, y: 84 * T + 8 };
const TUNNEL_MOUTH = [64 * T, 60 * T + 8];

function streakGuardDefs(R) {
  const post = (x, y, kind) => { const p = [[x, y, 9999]]; p.kind = kind; return p; };
  const ushers = [[41, 18], [59, 18], [78, 18], [50, 77], [78, 77], [21, 42], [106, 54]].map(([x, y]) => post(x, y, "usher"));
  const gates = [[63, 12], [66, 83], [14, 47], [113, 48]].map(([x, y]) => post(x, y, "gate"));
  const patrols = shuffle(R, GUARD_POOL.concourse).slice(0, 3);
  return [...ushers, ...gates, ...patrols];
}
function streakDoors(W0) {
  for (const g of W0.gates) { g.locked = g.gateId !== "S"; g.open = g.gateId === "S"; }
  for (const r of rooms) if (r.dock) r.dock.locked = true;
  for (const s of W0.shutters) { s.locked = false; s.open = true; }
  const wv = W0.wolves; wv.door.kind = "door"; wv.door.locked = false;
  wv.tunnel.kind = "door"; wv.tunnel.locked = false;
  for (const f of W0.fieldGates) { f.kind = "card"; f.locked = true; }
  // checkpoint barriers either side of the metal detector
  for (const x of [60, 61, 62, 65, 66, 67]) { G[84 * W + x] = "k"; furn[84 * W + x] = 0; }
}

/* ---------- setup ---------- */
function makeNPC(x, y, kind, extra = {}) {
  return Object.assign({ x, y, dir: 0, kind, state: "idle", t: 0, cd: 1 + Math.random() * 2, bob: Math.random() * 6, h: FIELD_Y, speed: 0, home: [x, y], aggro: 0, mark: 0 }, extra);
}
const FORM_O = [[-6, -24], [-6, -12], [-6, 0], [-6, 12], [-6, 24], [-6, 36], [-22, 0], [-42, 4], [-8, -84], [-8, 84], [-16, -56]];
const FORM_D = [[8, -18], [8, -6], [8, 6], [8, 18], [32, -30], [32, 0], [32, 30], [14, -84], [14, 84], [62, -36], [62, 36]];
function setupStreak() {
  streak = { cleared: false, alert: false, entered: false, fieldTime: 0, onField: false, hype: 12, peakHype: 12, dodges: 0, spawnT: 0, canT: 6, pointT: 0, milestones: {}, escaped: false, prevY: player.y, play: { los: CX + (Math.random() - .5) * 200, dir: 1, phase: "set", t: 0 }, boardT: 0, frontRow: false, maxSec: 3 };
  player.stam = 100; player.spin = 0; player.spinCd = 0; player.headHist = []; puffs = []; puffMeshes = []; player.boost = 0; player.exhausted = false; player.slide = 0; player.slideCd = 0; player.vault = null; player.vx = 0; player.vy = 0;
  fieldSec = [[TURF.x0 + 60, TURF.y1 - 10], [CX, TURF.y0 + 10], [TURF.x1 - 60, TURF.y1 - 10]].map(([x, y]) => makeNPC(x, y, "sec", { state: "post", dir: y > CY ? -Math.PI / 2 : Math.PI / 2, speed: ST.guardSpeed + Math.random() * 4 }));
  athletes = [];
  const pl = streak.play;
  FORM_O.forEach((o, i) => athletes.push(makeNPC(pl.los + o[0], CY + o[1], "wolves", { off: o, idx: i, aggro: .22, line: i < 6 })));
  FORM_D.forEach((o, i) => athletes.push(makeNPC(pl.los + o[0], CY + o[1], "rivals", { off: o, idx: i, aggro: .62, line: i < 4 })));
  refs = [[-60, -100], [70, 0], [-30, 104]].map(([dx, dy]) => makeNPC(pl.los + dx, CY + dy, "ref"));
  energies = [];
  crowdBoost = 0;
}

/* ---------- helpers ---------- */
const clampTurf = (n) => { n.x = clamp(n.x, TURF.x0 + 6, TURF.x1 - 6); n.y = clamp(n.y, TURF.y0 + 6, TURF.y1 - 6); };
function npcStep(n, tx, ty, spd, dt) {
  const dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy);
  if (d < 1.5) { n.moving = false; return; }
  const s = Math.min(d, spd * dt);
  n.x += dx / d * s; n.y += dy / d * s; n.moving = true;
  n.dir += clamp(angDiff(Math.atan2(dy, dx), n.dir), -9 * dt, 9 * dt);
  n.bob += dt * spd * .26;
  clampTurf(n);
}
function playerOnField() { return sectionAt(player.x, player.y) === 4 && player.h < FIELD_Y + .6 && !player.vault; }
function playerAirborne() { return !!player.vault || player.h - groundAt(player.x, player.y) > .3; }
function pop(text, cls) { const el = $("popTxt"); el.textContent = text; el.className = cls || ""; el.hidden = true; void el.offsetWidth; el.hidden = false; popT = 1.1; }
let popT = 0;
function addHype(v) { streak.hype = clamp(streak.hype + v, 0, 100); streak.peakHype = Math.max(streak.peakHype, streak.hype); }
function dodge(label, hype) { streak.dodges++; addHype(hype); pop(label); crowdBoost = Math.min(1, crowdBoost + .6); sfx("roar"); }

/* ---------- vaulting the wall ---------- */
function vaultSpot() {
  if (!streak || !streak.cleared) return null;
  const tx = Math.floor(player.x / T), ty = Math.floor(player.y / T), here = G[ty * W + tx];
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const a = G[(ty + dy) * W + tx + dx], b = G[(ty + 2 * dy) * W + tx + 2 * dx];
    if (a !== "F") continue;
    const x = (tx + 2 * dx) * T + 8, y = (ty + 2 * dy) * T + 8;
    if (here === "a" && b === "g") return { x: x - dx * 2, y: y - dy * 2, h: FIELD_Y, onto: true };
    if (here === "g" && b === "a") return { x, y, h: groundAt(x, y), onto: false };
  }
  return null;
}
function startVault(v) {
  player.vault = { t: 0, dur: v.onto ? .8 : 1.15, x0: player.x, y0: player.y, h0: player.h, x1: v.x, y1: v.y, h1: v.h, onto: v.onto };
  player.dir = Math.atan2(v.y - player.y, v.x - player.x);
  sfx("jump");
  if (!v.onto) showToast("Climbing into the stands. Security can still grab you while you climb.", 2.5);
}
function updateVault(dt) {
  const v = player.vault; v.t += dt;
  const u = Math.min(1, v.t / v.dur), e = u * u * (3 - 2 * u);
  player.x = lerp(v.x0, v.x1, e); player.y = lerp(v.y0, v.y1, e);
  player.h = lerp(v.h0, v.h1, e) + Math.sin(Math.PI * u) * (v.onto ? 1.4 : .9);
  if (u >= 1) { player.vault = null; player.h = v.h1; player.vh = 0; player.onGround = true; if (v.onto) sfx("land"); }
}

/* ---------- player movement in streak mode ---------- */
function streakMovement(dt, ix, iy, mag) {
  if (player.vault) { updateVault(dt); player.moving = false; return; }
  player.slideCd = Math.max(0, player.slideCd - dt);
  player.boost = Math.max(0, player.boost - dt);
  if (player.slideQueued && player.slide <= 0 && player.slideCd <= 0 && player.onGround && mag > 0 && player.stam >= 10) {
    player.slide = ST.slideTime; player.slideCd = ST.slideCd + ST.slideTime; player.stam -= 10; sfx("slide");
    player.slideDir = Math.atan2(Math.sin(camYaw) * -iy + Math.cos(camYaw) * ix, Math.cos(camYaw) * -iy - Math.sin(camYaw) * ix);
  }
  player.slideQueued = false;
  player.spinCd = Math.max(0, (player.spinCd || 0) - dt);
  if (player.spin > 0) player.spin -= dt;
  if (player.spinQueued && player.spinCd <= 0 && player.onGround && player.stam >= 12 && player.slide <= 0) {
    // burst sideways, away from the nearest chaser
    let nx = 0, ny = 0, bd = 1e9;
    for (const sg of fieldSec) { const d = dist(sg.x, sg.y, player.x, player.y); if (d < bd) { bd = d; nx = sg.x; ny = sg.y; } }
    const fwd = Math.atan2(player.vy, player.vx) || player.dir, side = Math.sin(Math.atan2(ny - player.y, nx - player.x) - fwd) > 0 ? -1 : 1;
    player.spin = .42; player.spinCd = 1.6; player.stam -= 12; player.spinDir = fwd + side * 1.1;
    sfx("slide"); triggerJuke(true);
  }
  player.spinQueued = false;
  if (player.jumpQueued && player.onGround) {
    const v = vaultSpot();
    if (v) { player.jumpQueued = false; startVault(v); return; }
  }
  const wantSprint = (keys["shift"] || touchSprint) && mag > 0 && !player.exhausted;
  let spd = mag > 0 ? (wantSprint ? ST.sprint : ST.run) * Math.max(.5, mag) : 0;
  if (player.boost > 0 && mag > 0) spd *= ST.boostMul;
  if (wantSprint && player.boost <= 0) { player.stam -= 24 * dt; if (player.stam <= 0) { player.stam = 0; player.exhausted = true; pop("GASSED", "warn"); } }
  else player.stam = Math.min(100, player.stam + (mag > 0 ? 11 : 20) * dt);
  if (player.exhausted && player.stam >= 30) player.exhausted = false;
  let mx = 0, my = 0;
  if (player.slide > 0) {
    player.slide -= dt;
    const k = player.slide / ST.slideTime;
    spd = (ST.run * .6 + ST.sprint * 1.05 * k);
    mx = Math.cos(player.slideDir); my = Math.sin(player.slideDir);
    player.mode = "slide";
  } else if (player.spin > 0) {
    spd = ST.sprint * 1.1; mx = Math.cos(player.spinDir); my = Math.sin(player.spinDir); player.mode = "sprint";
  } else if (mag > 0) {
    const fwd = -iy, rgt = ix;
    mx = Math.cos(camYaw) * fwd - Math.sin(camYaw) * rgt; my = Math.sin(camYaw) * fwd + Math.cos(camYaw) * rgt;
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    player.mode = wantSprint ? "sprint" : "walk";
  } else player.mode = "walk";
  const x0 = player.x, y0 = player.y;
  if (spd > 0) {
    tryMove(mx * spd * dt, my * spd * dt);
    if (player.slide <= 0) player.dir += angDiff(Math.atan2(my, mx), player.dir) * Math.min(1, dt * 12);
    if (player.onGround && player.slide <= 0) { player.stepT += dt; if (player.stepT > (wantSprint ? .26 : .36)) { player.stepT = 0; sfx("step"); if (streak.alert) emitNoise(player.x, player.y, (wantSprint ? 5 : 2) * T); } }
  }
  player.moving = spd > 0 && player.onGround;
  // body contact: athletes and refs block you
  for (const n of [...athletes, ...refs]) {
    if (n.state === "dive") continue;
    const dx = player.x - n.x, dy = player.y - n.y, d = Math.hypot(dx, dy), min = 9;
    if (d < min && d > .01 && playerOnField()) { player.x = n.x + dx / d * min; player.y = n.y + dy / d * min; }
  }
  player.vx = (player.x - x0) / Math.max(dt, 1e-4); player.vy = (player.y - y0) / Math.max(dt, 1e-4);
  // juke detection: compare heading now with heading a moment ago
  const sp = Math.hypot(player.vx, player.vy);
  player.jukeCd = Math.max(0, (player.jukeCd || 0) - dt);
  player.headHist = player.headHist || [];
  if (sp > 30) player.headHist.push([streak.clock, Math.atan2(player.vy, player.vx)]);
  streak.clock = (streak.clock || 0) + dt;
  while (player.headHist.length && streak.clock - player.headHist[0][0] > .22) player.headHist.shift();
  if (sp > 30 && player.headHist.length > 2 && player.jukeCd <= 0 && playerOnField()) {
    const old = player.headHist[0][1], cur = Math.atan2(player.vy, player.vx);
    if (Math.abs(angDiff(cur, old)) > 1.15 && triggerJuke(false)) player.jukeCd = .6;
  }
  // vertical: gravity, jumping, stairs (same model as the heist)
  const g = groundAt(player.x, player.y);
  if (player.jumpQueued && player.onGround && player.slide <= 0) { player.vh = JUMP_V; player.onGround = false; player.h += .02; sfx("jump"); }
  player.jumpQueued = false;
  if (player.onGround && player.vh <= 0 && player.h - g <= .6) player.h = g;
  else { player.vh -= GRAVITY * dt; player.h += player.vh * dt; player.onGround = false; }
  if (player.h <= g) { if (!player.onGround && player.vh < -6.5) sfx("land"); player.h = g; player.vh = 0; player.onGround = true; }
}

/* ---------- the field: players, refs, security ---------- */
const DIVE = { low: { speed: 92, time: .42, arc: .5, wind: .32, range: 34 }, leap: { speed: 104, time: .55, arc: 1.25, wind: .42, range: 48 } };
let puffs = [];
function updatePlaySim(dt) {
  const pl = streak.play; pl.t += dt;
  if (pl.phase === "set" && pl.t > 3.2) { pl.phase = "snap"; pl.t = 0; for (const a of athletes) { const fwd = a.kind === "wolves" ? pl.dir : -pl.dir; a.route = a.line ? [a.x + fwd * 10, a.y + (Math.random() - .5) * 8] : [a.x + fwd * (30 + Math.random() * 110) * (a.kind === "wolves" ? 1 : -.4), a.y + (Math.random() - .5) * 70]; } }
  else if (pl.phase === "snap" && pl.t > 3) { pl.phase = "set"; pl.t = 0; pl.los = clamp(pl.los + pl.dir * Math.random() * 40, FIELD.gl0 + 80, FIELD.gl1 - 80); if (pl.los >= FIELD.gl1 - 85) pl.dir = -1; if (pl.los <= FIELD.gl0 + 85) pl.dir = 1; if (Math.random() < .5) sfx("whistleSoft"); }
  for (const a of athletes) {
    if (pl.phase === "set" || !a.route) npcStep(a, pl.los + a.off[0] * pl.dir, CY + a.off[1], 26, dt);
    else npcStep(a, a.route[0], a.route[1], a.line ? 14 : 52, dt);
    if (!a.moving) a.dir += angDiff(a.kind === "wolves" ? (pl.dir > 0 ? 0 : Math.PI) : (pl.dir > 0 ? Math.PI : 0), a.dir) * Math.min(1, dt * 4);
  }
  refs.forEach((r, i) => npcStep(r, pl.los + [-60, 70, -30][i] * pl.dir, CY + [-100, 0, 104][i], 30, dt));
}
// steering with momentum: chasers can only accelerate so fast, so sharp cuts make them overshoot
function steer(n, tx, ty, maxSpd, acc, dt) {
  const dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy) || 1;
  const want = Math.min(maxSpd, d * 4);
  const dvx = dx / d * want - n.vx, dvy = dy / d * want - n.vy, dm = Math.hypot(dvx, dvy), lim = acc * dt;
  if (dm > lim) { n.vx += dvx / dm * lim; n.vy += dvy / dm * lim; } else { n.vx += dvx; n.vy += dvy; }
  n.x += n.vx * dt; n.y += n.vy * dt; clampTurf(n);
  const sp = Math.hypot(n.vx, n.vy);
  n.moving = sp > 6; n.bob += dt * sp * .26;
  if (sp > 4) n.dir += clamp(angDiff(Math.atan2(n.vy, n.vx), n.dir), -10 * dt, 10 * dt);
}
function faceplant(n, label) {
  n.state = "down"; n.t = 1.5; n.skid = .45;
  n.vx = Math.cos(n.dir) * 70; n.vy = Math.sin(n.dir) * 70;
  puffs.push({ x: n.x + Math.cos(n.dir) * 10, y: n.y + Math.sin(n.dir) * 10, t: 0 });
  sfx("thud");
  if (label) dodge(label, n.kind === "sec" ? 7 : 5);
}
function diverUpdate(n, dt) {
  if (n.state === "wind") {
    n.t -= dt; n.dir += angDiff(Math.atan2(player.y - n.y, player.x - n.x), n.dir) * Math.min(1, dt * 12);
    if (n.vx !== undefined) { n.vx *= .85; n.vy *= .85; }
    if (n.t <= 0) {
      const D = DIVE[n.dtype || "low"];
      n.state = "dive"; n.t = D.time; n.dodged = false;
      const px = player.x + player.vx * .3, py = player.y + player.vy * .3;
      n.diveDir = Math.atan2(py - n.y, px - n.x); n.dir = n.diveDir; sfx("grunt");
    }
    return true;
  }
  if (n.state === "dive") {
    const D = DIVE[n.dtype || "low"];
    n.t -= dt;
    n.x += Math.cos(n.diveDir) * D.speed * dt; n.y += Math.sin(n.diveDir) * D.speed * dt; clampTurf(n);
    const u = 1 - n.t / D.time;
    n.air = Math.sin(Math.PI * u) * D.arc;
    if (!n.dodged && dist(n.x, n.y, player.x, player.y) < 10 && mode === "play") {
      // low dives go under a jump; flying leaps sail over a slide
      const escaped = n.dtype === "leap" ? player.slide > 0 : playerAirborne();
      if (escaped) { n.dodged = true; dodge(n.dtype === "leap" ? "SLID UNDER!" : "HURDLE!", 8); }
      else { startArrest(n); return true; }
    }
    if (n.t <= 0) {
      n.air = 0;
      const near = dist(n.x, n.y, player.x, player.y) < 30;
      faceplant(n, !n.dodged && near ? "FACEPLANT!" : null);
      if (!near && !n.dodged) { crowdBoost = Math.min(1, crowdBoost + .3); }
    }
    return true;
  }
  if (n.state === "stumble") {
    n.t -= dt; n.x += n.vx * dt; n.y += n.vy * dt; n.vx *= Math.pow(.25, dt); n.vy *= Math.pow(.25, dt); clampTurf(n); n.bob += dt * 20;
    if (n.t <= 0) { if (n.willFall) faceplant(n, null); else { n.state = "chase"; n.cd = 1; } }
    return true;
  }
  if (n.state === "down" || n.state === "stun") {
    n.t -= dt;
    if (n.skid > 0) { n.skid -= dt; n.x += n.vx * dt; n.y += n.vy * dt; n.vx *= Math.pow(.02, dt); n.vy *= Math.pow(.02, dt); clampTurf(n); }
    if (n.t <= 0) { n.state = n.kind === "sec" ? "chase" : "react"; n.cd = 2 + Math.random() * 2; n.vx = 0; n.vy = 0; }
    return true;
  }
  return false;
}
function maybeDive(n, dt, chanceLow, chanceLeap) {
  n.cd -= dt;
  const d = dist(n.x, n.y, player.x, player.y);
  if (n.cd > 0 || !playerOnField() || d < 12) return false;
  if (d < DIVE.low.range || (chanceLeap > 0 && d < DIVE.leap.range)) {
    n.cd = .45;
    const leap = chanceLeap > 0 && d > 26 && Math.random() < chanceLeap;
    if (leap || (d < DIVE.low.range && Math.random() < chanceLow)) {
      n.dtype = leap ? "leap" : "low";
      n.state = "wind"; n.t = DIVE[n.dtype].wind; n.mark = .6;
      if (leap && !streak.leapTip) { streak.leapTip = true; showToast("Flying tackle! Slide (C) under the high ones, jump (Space) the low dives.", 3.5); }
      return true;
    }
  }
  return false;
}
// a sharp cut (or spin move) near a committed chaser makes them overshoot; some trip
function triggerJuke(spin) {
  let hit = 0;
  for (const s of fieldSec) {
    if (s.state !== "chase") continue;
    const d = dist(s.x, s.y, player.x, player.y), sp = Math.hypot(s.vx, s.vy);
    if (d > (spin ? 34 : 30) || sp < 25) continue;
    s.state = "stumble"; s.t = .55; s.willFall = spin ? Math.random() < .7 : Math.random() < .45 + (30 - d) / 60;
    s.vx *= 1.1; s.vy *= 1.1; hit++;
  }
  if (hit) dodge(hit > 1 ? `DOUBLE JUKE!` : spin ? "SPIN MOVE!" : "JUKE!", 6 + hit * 3);
  return hit;
}
function updateField(dt) {
  for (const p of puffs) p.t += dt; puffs = puffs.filter((p) => p.t < .8);
  if (!streak.alert) { updatePlaySim(dt); for (const s of fieldSec) { s.dir += angDiff(Math.atan2(CY - s.y, streak.play.los - s.x), s.dir) * Math.min(1, dt * 2); } return; }
  const onF = playerOnField();
  const tx = clamp(player.x + player.vx * .25, TURF.x0 + 6, TURF.x1 - 6), ty = clamp(player.y + player.vy * .25, TURF.y0 + 6, TURF.y1 - 6);
  for (const s of fieldSec) {
    if (s.vx === undefined) { s.vx = 0; s.vy = 0; }
    s.mark = Math.max(0, s.mark - dt);
    if (diverUpdate(s, dt)) { if (mode !== "play") return; continue; }
    if (s.state === "post" || s.state === "react") s.state = "chase";
    if (onF && maybeDive(s, dt, .3, .22)) continue;
    let sx = 0, sy = 0;
    for (const o of fieldSec) { if (o === s) continue; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy); if (d < 22 && d > .01) { sx += dx / d * (22 - d); sy += dy / d * (22 - d); } }
    const gx = onF ? tx : clamp(player.x, TURF.x0 + 8, TURF.x1 - 8), gy = onF ? ty : clamp(player.y, TURF.y0 + 8, TURF.y1 - 8);
    steer(s, gx + sx * .8, gy + sy * .8, s.speed, 125, dt);
    const d = dist(s.x, s.y, player.x, player.y);
    if (d < ST.grabR && mode === "play" && Math.abs(player.h - FIELD_Y) < 1.3) {
      if (player.slide > 0 || player.spin > 0) { s.state = "stumble"; s.t = .5; s.willFall = true; dodge(player.spin > 0 ? "SPIN MOVE!" : "SLIPPED HIM!", 7); }
      else { startArrest(s); return; }
    }
  }
  for (const a of athletes) {
    if (a.vx === undefined) { a.vx = 0; a.vy = 0; }
    a.mark = Math.max(0, a.mark - dt);
    if (diverUpdate(a, dt)) { if (mode !== "play") return; continue; }
    if (a.state !== "react") { a.state = "react"; a.cd = 1 + Math.random() * 3; }
    const d = dist(a.x, a.y, player.x, player.y);
    if (onF && maybeDive(a, dt, a.aggro * .55, 0)) continue;
    if (onF && d > 70) npcStep(a, player.x, player.y, a.kind === "rivals" ? 30 : 18, dt);
    else if (onF && d < 46 && a.kind === "rivals" && a.aggro > .5) npcStep(a, tx, ty, 34, dt);
    else { a.moving = false; a.dir += angDiff(Math.atan2(player.y - a.y, player.x - a.x), a.dir) * Math.min(1, dt * 5); }
  }
  for (const r of refs) { r.moving = false; r.dir += angDiff(Math.atan2(player.y - r.y, player.x - r.x), r.dir) * Math.min(1, dt * 4); }
}

/* ---------- main streak update (runs inside update) ---------- */
function streakUpdate(dt) {
  crowdU.uTime.value += dt;
  crowdBoost = Math.max(0, crowdBoost - dt * .5);
  if (mode === "arrest") { updateArrest(dt); return true; }
  if (mode === "jail" || mode === "escaped") { if (mode === "escaped") streak.hype = Math.min(100, streak.hype + dt * 20); setCrowdLook(); return true; }
  if (mode !== "play" && mode !== "menu" && mode !== "brief") return false;
  if (mode !== "play") { updateField(dt); setCrowdLook(); return mode === "brief"; }
  // security checkpoint at the main gate
  if (!streak.cleared) {
    const inX = player.x > ARCH.x0 && player.x < ARCH.x1;
    if (inX && streak.prevY > ARCH.y && player.y <= ARCH.y) {
      if (player.mode === "sprint" || !player.onGround) { player.y = ARCH.y + 22; sfx("beepno"); showToast("\"Whoa, slow down! Walk through the detector.\"", 3); }
      else { streak.cleared = true; sfx("beepok"); showToast("Cleared security. Now find your spot: pick an aisle and get down to the front row.", 5); }
    }
  }
  streak.prevY = player.y;
  const tx = Math.floor(player.x / T), ty = Math.floor(player.y / T);
  if (!streak.frontRow && streak.cleared && (vaultSpot() || (G[ty * W + tx] === "a" && player.h < FIELD_Y + 1.6))) { streak.frontRow = true; showToast(`Front row. Press ${isTouch ? "JUMP" : "Space"} to hop the wall onto the field.`, 4); }
  const onF = playerOnField();
  if (onF && !streak.entered) enterField();
  if (streak.alert) {
    if (onF) {
      streak.fieldTime += dt; streak.spawnT += dt;
      let threat = 0; for (const s of fieldSec) if (dist(s.x, s.y, player.x, player.y) < 32) threat = 1;
      addHype(dt * (1.25 + threat * 2));
      if (streak.spawnT >= ST.spawnEvery && fieldSec.length < ST.maxSec) {
        streak.spawnT = 0;
        fieldSec.push(makeNPC(TUNNEL_MOUTH[0], TUNNEL_MOUTH[1], "sec", { state: "chase", speed: ST.guardSpeed + Math.random() * 5, dir: -Math.PI / 2 }));
        streak.maxSec = Math.max(streak.maxSec, fieldSec.length);
        buildFieldActor(fieldSec[fieldSec.length - 1]);
        pop(`+1 SECURITY (${fieldSec.length}/${ST.maxSec})`, "warn"); sfx("radio");
      }
      if (streak.fieldTime >= ST.goal && !streak.goalHit) { streak.goalHit = true; pop("ONE MINUTE!", "gold"); sfx("horn"); showToast("You did a full minute! Now get out of the stadium without getting caught.", 5); }
    } else {
      streak.hype = Math.max(20, streak.hype - dt * .8);
      // the crowd points you out to security in the stands and concourse
      streak.pointT -= dt;
      if (streak.pointT <= 0 && sectionAt(player.x, player.y) !== 0) {
        streak.pointT = 2.6;
        for (const g of guards) if (g.state !== "chase" && dist(g.x, g.y, player.x, player.y) < 560) investigate(g, player.x, player.y, .5);
      }
    }
    // energy drinks
    streak.canT -= dt;
    if (onF && streak.canT <= 0 && energies.filter((e) => !e.got).length < 3) { streak.canT = 7 + Math.random() * 4; spawnEnergy(); }
    for (const m of [25, 50, 75, 100]) if (streak.hype >= m && !streak.milestones[m]) {
      streak.milestones[m] = true; spawnEnergy(true);
      pop(m === 25 ? "THE CROWD IS ON ITS FEET" : m === 50 ? "THEY'RE DOING THE WAVE" : m === 75 ? "WHOLE STADIUM CHANTING" : "PANDEMONIUM", "gold");
      crowdBoost = 1; sfx("roar");
    }
    for (const e of energies) if (!e.got && dist(e.x, e.y, player.x, player.y) < 12 && onF) { e.got = true; player.stam = 100; player.exhausted = false; player.boost = 3.5; addHype(4); pop("ENERGY BOOST", "boost"); sfx("boost"); }
    if (sectionAt(player.x, player.y) === 0) { escaped(); return true; }
  }
  updateField(dt);
  if (mode !== "play") return true;
  setCrowdLook();
  return false;
}
function enterField() {
  streak.entered = true; streak.alert = true; streak.hype = Math.max(streak.hype, 22);
  sfx("whistle"); sfx("roar"); crowdBoost = 1;
  pop("STREAKER ON THE FIELD!", "gold");
  showToast("Security is coming! Space jumps diving tackles, C slides out of grabs. Stay out here a full minute.", 6);
  for (const g of world.gates) { g.locked = false; openDoor(g); }
  for (const a of athletes) { a.state = "react"; a.cd = 1.5 + Math.random() * 3; }
  for (const s of fieldSec) s.state = "chase";
}
function spawnEnergy(thrown) {
  let x, y, tries = 0;
  do {
    if (thrown) { x = clamp(player.x + (Math.random() - .5) * 140, TURF.x0 + 20, TURF.x1 - 20); y = clamp(player.y + (Math.random() - .5) * 100, TURF.y0 + 20, TURF.y1 - 20); }
    else { x = TURF.x0 + 30 + Math.random() * (TURF.x1 - TURF.x0 - 60); y = TURF.y0 + 30 + Math.random() * (TURF.y1 - TURF.y0 - 60); }
  } while (tries++ < 20 && fieldSec.some((s) => dist(s.x, s.y, x, y) < 50));
  const e = { x, y, got: false, t: 0 };
  energies.push(e); buildEnergyMesh(e);
  if (thrown) showToast("The crowd threw you an energy drink!", 2.5);
}
function setCrowdLook() {
  const h = streak ? streak.hype : 10;
  crowdU.uAmp.value = .1 + h / 100 * .85 + crowdBoost * .25;
  crowdU.uWave.value = h > 48 ? Math.min(1, (h - 48) / 35) : 0;
  if (AC && crowdGain) crowdGain.gain.setTargetAtTime(muted ? 0 : .05 + h * .0028 + crowdBoost * .12, AC.currentTime, .25);
  if (streak && streak.alert && h > 40 && mode === "play") { chantT -= 1 / 60; if (chantT <= 0) { chantT = 2.4; tone(196, .16, "sawtooth", .02 + h * .0004); tone(147, .2, "sawtooth", .02 + h * .0004, 1, .28); } }
}

/* ---------- arrest: tackle, cuffs, escort, jail ---------- */
function startArrest(by) {
  if (mode !== "play") return;
  mode = "arrest";
  const where = by ? Math.atan2(player.y - by.y, player.x - by.x) : player.dir + Math.PI;
  arrest = { t: 0, by, ang: where, cuffed: false, x: player.x, y: player.y, h: player.h, walker: null };
  player.vault = null; player.slide = 0;
  if (by && by.x !== undefined) { by.state = "pin"; by.x = player.x - Math.cos(where) * 6; by.y = player.y - Math.sin(where) * 6; by.dir = where; }
  sfx("hit"); sfx("ohh"); sfx("whistle"); crowdBoost = 1;
  setPlayUI(false); $("streakHud").hidden = true; $("stamWrap").hidden = true;
  // two more security officers run in to help
  escorts.forEach((m) => actorGroup.remove(m)); escorts = [];
  for (const s of [-1, 1]) {
    const m = makeHuman({ body: 0xf2d21b, legs: 0x1a1f2b, head: 0x9a6e4f, cap: 0x111111 });
    m.rotation.order = "YXZ";
    m.userData.p = { x: player.x + Math.cos(where + s * 1.7) * 60, y: player.y + Math.sin(where + s * 1.7) * 60, side: s };
    escorts.push(m); actorGroup.add(m);
  }
  if (!cuffMesh) {
    cuffMesh = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: .95, roughness: .2 });
    for (const x of [-.07, .07]) { const r = new THREE.Mesh(new THREE.TorusGeometry(.055, .014, 8, 18), cm); r.position.x = x; r.rotation.y = Math.PI / 2; cuffMesh.add(r); }
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .09, 6), cm); ch.rotation.z = Math.PI / 2; cuffMesh.add(ch);
    cuffMesh.position.set(0, .95, -.3); playerMesh.add(cuffMesh);
  }
  cuffMesh.visible = false;
}
function updateArrest(rdt) {
  const a = arrest, slow = a.t < .9 ? .32 : 1, dt = rdt * slow;
  a.t += dt;
  setCrowdLook();
  if (a.t > 1.35 && !a.cuffed) { a.cuffed = true; cuffMesh.visible = true; sfx("cuff"); pop("CUFFED", "warn"); }
  // escorts run in
  for (const m of escorts) {
    const p = m.userData.p, tgtX = a.x + Math.cos(a.ang + p.side * Math.PI / 2) * 7, tgtY = a.y + Math.sin(a.ang + p.side * Math.PI / 2) * 7;
    if (a.t < 2.7) { const dx = tgtX - p.x, dy = tgtY - p.y, d = Math.hypot(dx, dy); if (d > 1) { const s = Math.min(d, 70 * dt); p.x += dx / d * s; p.y += dy / d * s; p.dir = Math.atan2(dy, dx); p.mv = true; } else { p.mv = false; p.dir = Math.atan2(a.y - p.y, a.x - p.x); } }
  }
  if (a.t > 2.7) {
    if (!a.walker) {
      const onF = sectionAt(a.x, a.y) === 4;
      a.walker = { x: a.x, y: a.y, dir: 0, route: [], bob: 0 };
      if (onF) a.walker.route = [[TUNNEL_MOUTH[0], TUNNEL_MOUTH[1]], [64 * T, 63 * T + 8], [64 * T, 70 * T]];
      else routeTo(a.walker, 64 * T, 84 * T);
      if (by(a)) { a.by.state = "stun"; a.by.t = 99; }
    }
    const w = a.walker;
    if (w.route.length) {
      const [tx, ty] = w.route[0], dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      if (d < 2) w.route.shift(); else { const s = Math.min(d, 13 * dt); w.x += dx / d * s; w.y += dy / d * s; w.dir = Math.atan2(dy, dx); }
    }
    player.x = w.x; player.y = w.y; player.h = groundAt(w.x, w.y); player.dir = w.dir;
    escorts.forEach((m) => { const p = m.userData.p; p.x = w.x + Math.cos(w.dir + p.side * Math.PI / 2) * 5; p.y = w.y + Math.sin(w.dir + p.side * Math.PI / 2) * 5; p.dir = w.dir; p.mv = true; });
  }
  const f = $("fade");
  if (a.t > 5.4) f.style.opacity = Math.min(1, (a.t - 5.4) / .7);
  if (a.t > 6.3) goJail();
}
const by = (a) => a.by && a.by.state !== undefined;
function buildJail() {
  jailGroup = new THREE.Group(); jailGroup.position.set(0, 0, -420); scene.add(jailGroup);
  const conc = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: .9, map: MAT.wall.map });
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || conc); o.position.set(x, y, z); o.receiveShadow = true; jailGroup.add(o); return o; };
  box(6, .1, 9, 0, -.05, 1.5); box(6, .1, 9, 0, 3.3, 1.5);
  box(.2, 3.3, 9, -3, 1.65, 1.5); box(.2, 3.3, 9, 3, 1.65, 1.5);
  const chart = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#8d939d"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#1c2c57"; c.fillRect(0, 0, w, 70); c.fillStyle = "#eef1f7"; c.font = "34px Graduate, Georgia, serif"; c.textAlign = "center"; c.fillText("NORTHRIDGE STADIUM SECURITY", w / 2, 48);
    c.strokeStyle = "#2a2e36"; c.fillStyle = "#2a2e36"; c.font = "22px 'Share Tech Mono', monospace"; c.textAlign = "left";
    for (let i = 0; i <= 12; i++) { const y = 470 - i * 30; c.lineWidth = i % 2 ? 1.5 : 3; c.beginPath(); c.moveTo(150, y); c.lineTo(362, y); c.stroke(); if (!(i % 2)) c.fillText(`${4 + i / 2}'0"`, 372, y + 7); }
    c.font = "26px Graduate, Georgia, serif"; c.textAlign = "center"; c.fillText("HOLDING CELL 1", w / 2, 505);
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.3), new THREE.MeshStandardMaterial({ map: chart, roughness: .9 })); back.position.set(0, 1.65, -2); jailGroup.add(back);
  const bars = new THREE.MeshStandardMaterial({ color: 0x9aa2b0, metalness: .85, roughness: .3 });
  for (let i = 0; i < 17; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 3.2, 8), bars); b.position.set(-2.75 + i * .34, 1.6, 2); b.castShadow = true; jailGroup.add(b); }
  for (const y of [.25, 3.0]) { const b = new THREE.Mesh(new THREE.BoxGeometry(5.8, .08, .08), bars); b.position.set(0, y, 2); jailGroup.add(b); }
  box(4.2, .12, .7, -.4, .48, -1.6, new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: .7 }));
  for (const x of [-2.2, 1.4]) box(.12, .48, .5, x, .24, -1.6);
  box(.6, .5, .5, 2.4, .25, -1.5, new THREE.MeshStandardMaterial({ color: 0xcfd4dc, roughness: .3, metalness: .4 }));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); bulb.position.set(0, 2.9, 0); jailGroup.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .4, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.set(0, 3.1, 0); jailGroup.add(cord);
  const g = makeHuman({ body: 0x2b3756, legs: 0x141a29, head: 0x8a7562, cap: 0x10162a }); g.position.set(1.9, 0, 3.4); g.rotation.y = -2.6; jailGroup.add(g); jailGroup.userData.guard = g;
  const sign = textPlane("HOLDING · NORTHRIDGE STADIUM", 3.2, .4, { size: 120 }); sign.position.set(0, 3.12, 2.08); jailGroup.add(sign);
  jailLight.position.set(0, 2.7, -420);
  jailGroup.visible = false;
}
function goJail() {
  mode = "jail"; $("popTxt").hidden = true;
  if (!jailGroup) buildJail();
  jailGroup.visible = true; jailLight.intensity = 2.2;
  escorts.forEach((m) => actorGroup.remove(m)); escorts = [];
  snapCam();
  setTimeout(() => { $("fade").style.opacity = 0; }, 150);
  setTimeout(showBooked, 900);
  sfx("door"); sfx("cell");
}
function streakGrade(t) { return t >= 60 ? "Stadium legend" : t >= 40 ? "Highlight reel" : t >= 20 ? "Viral clip" : t >= 8 ? "Brief cameo" : "Blink and you missed it"; }
function saveStreak(escapedClean) {
  const t = Math.round(streak.fieldTime * 10) / 10;
  save.streak = save.streak || { best: 0, escapes: 0 };
  const better = t > (save.streak.best || 0);
  if (better) save.streak.best = t;
  if (escapedClean) save.streak.escapes = (save.streak.escapes || 0) + 1;
  writeSave();
  return better;
}
function streakRows(better) {
  return `<div class="rows">
      <div><span>Time on the field</span><b>${fmt(streak.fieldTime)}${better ? " · new best" : ""}</b></div>
      <div><span>Peak crowd</span><b>${Math.round(streak.peakHype)}%</b></div>
      <div><span>Tackles dodged</span><b>${streak.dodges}</b></div>
      <div><span>Security sent after you</span><b>${streak.maxSec}</b></div>
      <div><span>Rating</span><b style="color:var(--gold)">${streakGrade(streak.fieldTime)}</b></div>
    </div>`;
}
function showBooked() {
  if (mode !== "jail") return;
  const better = saveStreak(false);
  $("result").classList.add("side");
  $("resultCard").innerHTML = `
    <div class="kicker">Northridge Stadium Security &middot; Booking #${String(nightSeed % 100000).padStart(5, "0")}</div>
    <h2 class="red">Booked</h2>
    <p>${streak.entered ? `You lasted ${fmt(streak.fieldTime)} on the field before they cuffed you. Charges: trespassing on the field of play and delay of game.` : "You didn't even make it onto the field. Security walked you straight to the holding cell."}</p>
    ${streakRows(better)}
    <div class="actions"><button class="btn primary" id="againBtn">Streak again</button><button class="btn" id="menuBtn">Main menu</button></div>`;
  show("result");
  $("againBtn").addEventListener("click", () => openStreakBrief(freshSeed()));
  $("menuBtn").addEventListener("click", toMenu);
  $("againBtn").focus();
}
function escaped() {
  mode = "escaped"; setPlayUI(false); streak.escaped = true;
  sfx("horn"); sfx("roar"); crowdBoost = 1;
  const full = streak.fieldTime >= ST.goal;
  const better = saveStreak(full);
  $("result").classList.remove("side");
  $("resultCard").innerHTML = `
    <div class="kicker">Game Day &middot; Wolves vs. Rivals</div>
    <h2 class="gold">${full ? "You got away!" : "Escaped early"}</h2>
    <p>${full ? `A full ${fmt(streak.fieldTime)} on the field, then out the gate before security could catch you. The clip is already everywhere.` : `You made it out, but only managed ${fmt(streak.fieldTime)} on the field. The crowd wanted a full minute.`}</p>
    ${streakRows(better)}
    <div class="actions"><button class="btn primary" id="againBtn">Streak again</button><button class="btn" id="menuBtn">Main menu</button></div>`;
  show("result");
  $("againBtn").addEventListener("click", () => openStreakBrief(freshSeed()));
  $("menuBtn").addEventListener("click", toMenu);
  $("againBtn").focus();
}

/* ---------- briefing ---------- */
function openStreakBrief(seed) {
  GAME_MODE = "streak";
  newNight(seed, true);
  mode = "brief";
  $("result").classList.remove("side");
  $("briefCard").innerHTML = `
    <div class="kicker">Game Day &middot; Wolves vs. Rivals &middot; 3rd quarter</div>
    <h2>Sold out at Northridge</h2>
    <p>The stadium is packed and the game is on. You're starting in the south parking lot with a ticket in your pocket and a bad idea.</p>
    <div class="intel">
      <div><b>Get in</b>Walk through the metal detector at the Main Gate. Don't run through it.</div>
      <div><b>Pick your spot</b>Choose any aisle in any section and head down to the front row. Press Space at the wall to jump onto the field.</div>
      <div><b>On the field</b>Three guards start on the sidelines. Another runs out of the tunnel every 30 seconds, up to 8. Players will dive at you too.</div>
      <div><b>Moves</b>Shift sprints but drains stamina. Energy drinks refill it and give you a burst. Cut hard to juke security; they overshoot and some fall on their face. Q is a spin move.</div><div><b>Tackles</b>Space jumps over low diving tackles. C slides under flying leaps and out of grabs. Anyone who misses eats turf.</div>
      <div><b>Win</b>Stay on the field for a full minute, then escape the stadium past the ushers and concourse security.</div>
    </div>
    <div class="actions"><button class="btn primary" id="goBtn">Head to the gate</button><button class="btn" id="backBtn">Back</button></div>`;
  show("brief");
  $("goBtn").addEventListener("click", beginPlay);
  $("backBtn").addEventListener("click", toMenu);
  $("goBtn").focus();
}

/* ---------- 3D: crowd, field actors, energy drinks ---------- */
function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .75 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = crowdU.uTime; sh.uniforms.uAmp = crowdU.uAmp; sh.uniforms.uWave = crowdU.uWave;
    sh.vertexShader = "uniform float uTime; uniform float uAmp; uniform float uWave;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      float bob = max(0.0, sin(uTime * (4.0 + ph * .45) + ph));
      float ang = atan(ip.z, ip.x * .55);
      float wave = pow(max(0.0, sin(ang - uTime * 1.7)), 10.0);
      transformed.y += bob * uAmp * .42 + wave * uWave * .62;`);
  };
  m.customProgramCacheKey = () => "crowd";
  return m;
}
function buildCrowd(group) {
  const R = rng(world.seed + 77);
  const body = mergeGeos([boxAt(.38, .5, .24, 0, .72, .06), boxAt(.1, .42, .1, -.25, .7, .0), boxAt(.1, .42, .1, .25, .7, .0)]);
  const head = boxAt(.2, .22, .2, 0, 1.1, .04);
  const sign = boxAt(.62, .4, .03, 0, 1.55, -.05);
  const shirts = [0x1c2c57, 0x1c2c57, 0x24397a, 0xeef1f7, 0xe6c34a, 0x6b7280, 0x1c2c57];
  const skins = [0xe0b48c, 0xc68a5e, 0x8d5a3b, 0x5c3a24, 0xf1c9a5];
  const bl = [], hl = [], sl = [];
  for (const s of seatSpots) {
    if (R() > .86) continue;
    const away = sectionAt(s.x * 8 + CX, s.z * 8 + CY) === 3 && R() < .55;
    const it = { x: s.x, y: s.y, z: s.z, ry: s.ry };
    bl.push({ ...it, color: away ? 0xb3262e : shirts[Math.floor(R() * shirts.length)] });
    hl.push({ ...it, color: skins[Math.floor(R() * skins.length)] });
    if (R() < .012) sl.push({ ...it, color: R() < .5 ? 0xeef1f7 : away ? 0xb3262e : 0xe6c34a });
  }
  const mat = crowdMaterial();
  group.add(instanced(body, mat, bl), instanced(head, mat, hl), instanced(sign, mat, sl));
  return bl.length;
}
function athleteColors(n) {
  if (n.kind === "wolves") return { body: 0x1c2c57, legs: 0xe8e8e8, head: 0xe6c34a, helmet: true };
  if (n.kind === "rivals") return { body: 0xb3262e, legs: 0xdddddd, head: 0xf2f2f2, helmet: true };
  if (n.kind === "ref") return { body: 0xf0f0f0, legs: 0x111111, head: 0x9a6e4f, cap: 0x111111, stripes: true };
  return { body: 0xf2d21b, legs: 0x1a1f2b, head: 0x9a6e4f, cap: 0x111111 };
}
function buildFieldActor(n) {
  const c = athleteColors(n);
  const m = makeHuman(c);
  m.rotation.order = "YXZ";
  if (c.helmet) { const mask = new THREE.Mesh(new THREE.BoxGeometry(.22, .1, .06), MAT.metal); mask.position.set(0, 1.66, .17); m.add(mask); m.scale.setScalar(1.08); }
  if (c.stripes) for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(.06, .64, .31), new THREE.MeshStandardMaterial({ color: 0x111111 })); s.position.set(-.18 + i * .12, 1.2, 0); m.add(s); }
  if (n.kind === "sec") { const v = textPlane("SECURITY", .46, .16, { size: 150, bg: "#f2d21b", fg: "#111", border: false, tint: 0xffffff }); v.position.set(0, 1.32, -.16); v.rotation.y = Math.PI; m.add(v); }
  n.markSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex["!"], depthTest: false })); n.markSpr.scale.set(.9, .9, 1); n.markSpr.position.y = 2.6; n.markSpr.renderOrder = 9; n.markSpr.visible = false; m.add(n.markSpr);
  n.mesh = m; actorGroup.add(m);
}
function buildEnergyMesh(e) {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .22, 14), new THREE.MeshStandardMaterial({ color: 0x24397a, emissive: 0x2c4486, emissiveIntensity: .6, metalness: .6, roughness: .3 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.072, .072, .06, 14), new THREE.MeshBasicMaterial({ color: 0xe6c34a })); g.add(can, band);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.glow, color: 0x7fe0ff, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(1.8, 1.8, 1); g.add(glow);
  e.mesh = g; actorGroup.add(g);
}
function buildStreakActors() {
  for (const n of [...fieldSec, ...athletes, ...refs]) buildFieldActor(n);
  for (const e of energies) buildEnergyMesh(e);
}
function buildCheckpoint(group) {
  const z = toZ(ARCH.y), x = toX((ARCH.x0 + ARCH.x1) / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: .5, roughness: .4 });
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.3, 2.3, .5), m); p.position.set(x + s * 1.7, 1.15, z); p.castShadow = true; group.add(p); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, .3, .5), m); top.position.set(x, 2.35, z); group.add(top);
  const led = new THREE.Mesh(new THREE.BoxGeometry(1.2, .1, .52), new THREE.MeshBasicMaterial({ color: 0x5fd38a })); led.position.set(x, 2.35, z); group.add(led);
  const sign = textPlane("SECURITY CHECKPOINT", 4.2, .5, { size: 120 }); sign.position.set(x, 2.85, z + .27); group.add(sign);
  const rope = new THREE.MeshStandardMaterial({ color: 0x1c2c57 });
  for (const xs of [[60, 62], [65, 67]]) {
    const cx = toX(((xs[0] + xs[1] + 1) / 2) * T), w = (xs[1] - xs[0] + 1) * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, .9, .2), rope); b.position.set(cx, .45, z); group.add(b);
  }
  const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.6, .8, .7), new THREE.MeshStandardMaterial({ color: 0x5a606b })); tbl.position.set(x - 3.6, .4, z + 1.6); group.add(tbl);
}
function applyModeLook() {
  const s = isStreak();
  hemi.intensity = s ? .7 : .62;
  renderer.toneMappingExposure = s ? 1.08 : 1.25;
  scene.fog.density = s ? .0045 : .0065;
  towerSpots.forEach((sp) => { if (sp.intensity > 0) sp.intensity = s ? 2.4 : 2.6; });
  if (rainGain && AC) rainGain.gain.value = s ? 0 : .035;
  if (crowdGain && AC) crowdGain.gain.value = s ? .06 : 0;
}
function drawStreakBoard() {
  const c = scoreCanvas.getContext("2d"), w = 1024, h = 440;
  c.fillStyle = "#04070f"; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0d1d4a"); g.addColorStop(1, "#060b1c"); c.fillStyle = g; c.fillRect(12, 12, w - 24, h - 24);
  c.strokeStyle = "#2c4486"; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
  c.textAlign = "center"; c.textBaseline = "middle";
  if (streak && streak.alert) {
    const blink = Math.floor(performance.now() / 400) % 2;
    c.font = "70px Graduate, Georgia, serif"; c.fillStyle = blink ? "#e6c34a" : "#ff3b4e"; c.fillText("STREAKER!", w / 2, 95);
    c.font = "150px 'Share Tech Mono', monospace"; c.fillStyle = "#eef1f7"; c.fillText(fmt(streak.fieldTime), w / 2, 235);
    c.fillStyle = "#1b2233"; c.fillRect(140, 340, w - 280, 40); c.fillStyle = "#e6c34a"; c.fillRect(140, 340, (w - 280) * streak.hype / 100, 40);
    c.font = "28px 'Share Tech Mono', monospace"; c.fillStyle = "#9fb0d8"; c.fillText("CROWD METER", w / 2, 405);
  } else {
    c.font = "50px Graduate, Georgia, serif"; c.fillStyle = "#eef1f7"; c.fillText("WOLVES        RIVALS", w / 2, 80);
    c.font = "170px 'Share Tech Mono', monospace"; c.fillStyle = "#e6c34a"; c.fillText("21", w * .27, 225); c.fillStyle = "#ff6a6a"; c.fillText("17", w * .73, 225);
    c.font = "44px 'Share Tech Mono', monospace"; c.fillStyle = "#9fb0d8"; c.fillText(`3RD QTR  ${fmt(Math.max(0, 522 - (streak ? time : 0)))}`, w / 2, 370);
  }
  scoreTex.needsUpdate = true;
}
function streakCamera(dt) {
  if (mode === "arrest" && arrest) {
    const cx = toX(player.x), cz = toZ(player.y), ch = player.h, a = arrest.ang + Math.PI * .65 + arrest.t * .28, d = arrest.t < 1 ? 4.2 : 6.5;
    return [new THREE.Vector3(cx, ch + .6, cz), new THREE.Vector3(cx + Math.cos(a) * d, ch + (arrest.t < 1 ? 1.4 : 2.6), cz + Math.sin(a) * d)];
  }
  if (mode === "jail") { const t = performance.now() / 1000; return [new THREE.Vector3(0, 1.0, -420.6), new THREE.Vector3(.7 + Math.sin(t * .2) * .2, 1.75, -415.3)]; }
  if (mode === "escaped") { menuT += dt; const a = menuT * .06; return [new THREE.Vector3(0, FIELD_Y + 4, 0), new THREE.Vector3(Math.cos(a) * 80, 30, Math.sin(a) * 60)]; }
  return null;
}
function poseNPC(n, now) {
  if (!n.mesh) return;
  const m = n.mesh, gnd = groundAt(n.x, n.y), u = m.userData;
  m.position.set(toX(n.x), gnd, toZ(n.y)); m.rotation.y = Math.PI / 2 - n.dir; m.rotation.x = 0; m.rotation.z = 0; m.scale.y = m.scale.x;
  if (n.state === "wind") { m.scale.y = m.scale.x * (n.dtype === "leap" ? .78 : .86); m.rotation.x = .35; animHuman(m, 0, 0, 0); u.shL.rotation.x = u.shR.rotation.x = -.8; }
  else if (n.state === "dive") {
    m.rotation.x = n.dtype === "leap" ? 1.05 : 1.3; m.position.y = gnd + .45 + (n.air || 0);
    animHuman(m, 0, 0, 0); u.shL.rotation.x = u.shR.rotation.x = -2.7; u.hipL.rotation.x = .3; u.hipR.rotation.x = .5;
  } else if (n.state === "stumble") {
    const k = 1 - Math.max(0, n.t) / .55; m.rotation.x = .25 + k * (n.willFall ? .9 : .3); m.rotation.z = Math.sin(now * 18) * .25;
    animHuman(m, n.bob * 1.6, .9, 0); u.shL.rotation.z = .9; u.shR.rotation.z = -.9;
  } else if (n.state === "down" || n.state === "stun" || n.state === "pin") {
    m.rotation.x = Math.PI / 2; m.position.y = gnd + .18; animHuman(m, 0, 0, 0);
    u.shL.rotation.x = u.shR.rotation.x = -2.9; u.shL.rotation.z = u.shR.rotation.z = 0;
    if (n.state === "down" && n.t < .5 && n.t > 0) { const k = 1 - n.t / .5; m.rotation.x = Math.PI / 2 * (1 - k); m.position.y = gnd + .18 * (1 - k); }
  } else { animHuman(m, n.bob * 1.4, n.moving ? (n.kind === "sec" ? .7 : .55) : 0, 0); u.shL.rotation.z = u.shR.rotation.z = 0; }
  if (n.markSpr) { n.markSpr.visible = n.state === "wind"; if (n.markSpr.visible) n.markSpr.material.color.setHex(n.dtype === "leap" ? 0xe6c34a : 0xffffff); }
}
let puffMeshes = [];
function renderPuffs() {
  while (puffMeshes.length < puffs.length) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.glow, color: 0x8fa86a, transparent: true, depthWrite: false })); actorGroup.add(s); puffMeshes.push(s); }
  puffMeshes.forEach((s, i) => { const p = puffs[i]; s.visible = !!p; if (!p) return; const k = p.t / .8; s.position.set(toX(p.x), FIELD_Y + .25 + k * .5, toZ(p.y)); s.scale.setScalar(.6 + k * 2.4); s.material.opacity = .8 * (1 - k); });
}
function renderStreak(now, dt) {
  for (const n of [...fieldSec, ...athletes, ...refs]) poseNPC(n, now);
  renderPuffs();
  for (const e of energies) if (e.mesh) { e.mesh.visible = !e.got; e.mesh.position.set(toX(e.x), FIELD_Y + .35 + Math.sin(now * 3 + e.x) * .08, toZ(e.y)); e.mesh.rotation.y = now * 2; }
  streak.boardT -= dt; if (streak.boardT <= 0) { streak.boardT = .4; drawStreakBoard(); }
  // guards' sight fans stay hidden until the streak starts
  if (!streak.alert) for (const g of guards) if (g.fan) g.fan.visible = false;
  const pm = playerMesh;
  pm.rotation.x = 0;
  if (cuffMesh) cuffMesh.visible = !!(arrest && arrest.cuffed && (mode === "arrest" || mode === "jail"));
  if (player.vault) { pm.rotation.x = .5; animHuman(pm, 0, 0, 0); pm.userData.hipL.rotation.x = pm.userData.hipR.rotation.x = -1.1; }
  else if (player.spin > 0 && mode === "play") { pm.rotation.y += (1 - player.spin / .42) * Math.PI * 2; }
  else if (player.slide > 0 && mode === "play") { pm.rotation.x = -1.05; pm.position.y = player.h + .25; pm.userData.hipL.rotation.x = pm.userData.hipR.rotation.x = -.4; }
  if (mode === "arrest" && arrest) {
    if (arrest.t < 2.7) { pm.rotation.x = Math.PI / 2; pm.rotation.y = Math.PI / 2 - arrest.ang; pm.position.set(toX(arrest.x), arrest.h + .2, toZ(arrest.y)); animHuman(pm, 0, 0, 0); }
    else animHuman(pm, now * 7, .35, 0);
    if (arrest.cuffed) { pm.userData.shL.rotation.set(.55, 0, .28); pm.userData.shR.rotation.set(.55, 0, -.28); }
    for (const m of escorts) { const p = m.userData.p; m.position.set(toX(p.x), groundAt(p.x, p.y), toZ(p.y)); m.rotation.y = Math.PI / 2 - (p.dir || 0); animHuman(m, now * 9, p.mv ? .6 : 0, 0); if (arrest.t > 2.7) { m.userData.shL.rotation.x = m.userData.shR.rotation.x = -.6; } }
  }
  if (mode === "jail") {
    pm.visible = true; pm.position.set(-.6, .45 - .86 + .06, -421.55); pm.rotation.set(.18, 0, 0); pm.scale.y = 1;
    animHuman(pm, 0, 0, 0); pm.userData.hipL.rotation.x = pm.userData.hipR.rotation.x = -Math.PI / 2;
    pm.userData.shL.rotation.set(.55, 0, .28); pm.userData.shR.rotation.set(.55, 0, -.28);
    jailLight.intensity = 2.1 + (Math.random() < .03 ? -1.4 : 0);
    if (jailGroup && jailGroup.userData.guard) animHuman(jailGroup.userData.guard, now, 0, 0);
  } else if (jailGroup) { jailGroup.visible = false; jailLight.intensity = 0; }
}
function updateStreakHud(dt) {
  $("fieldTime").textContent = fmt(streak.fieldTime);
  $("fieldClock").classList.toggle("done", streak.fieldTime >= ST.goal);
  $("hypeFill").style.width = streak.hype + "%";
  const sf = $("stamFill"); sf.style.width = player.stam + "%";
  sf.style.background = player.boost > 0 ? "#7fe0ff" : player.exhausted ? "var(--cctv)" : player.stam < 30 ? "#ffb05a" : "var(--go)";
  $("stamWrap").classList.toggle("boost", player.boost > 0);
  $("secTxt").textContent = streak.alert ? `${fieldSec.length}/${ST.maxSec}` + (fieldSec.length < ST.maxSec && playerOnField() ? ` · +1 in ${Math.ceil(ST.spawnEvery - streak.spawnT)}s` : "") : "Off duty";
  if (popT > 0) { popT -= dt; if (popT <= 0) $("popTxt").hidden = true; }
}
