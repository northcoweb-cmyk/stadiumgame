/* ---------- kicking: real ball physics ---------- */
const GRAV = 9.81, DRAG = .0045, BALL_R = .12, POST_R = .075, CROSS_H = 2.5, POST_HALF = 2.31, UPRIGHT_H = 7.5, LAUNCH_EL = .66, REST = .55;
function goalInfo() { const side = world.kick.side, X = toX(world.kick.postX); return { side, X, baseX: X + side * 1.75 }; }
function launchBall(x, z, yaw, power, windAcc) {
  const v0 = 13 + power * 16;
  return { x, y: FIELD_Y + BALL_R + .08, z, vx: v0 * Math.cos(LAUNCH_EL) * Math.cos(yaw), vy: v0 * Math.sin(LAUNCH_EL), vz: v0 * Math.cos(LAUNCH_EL) * Math.sin(yaw), windAcc, t: 0, judged: false, good: false, hits: 0, bounces: 0, why: "", crossZ: 0, crossY: 0, done: false, spin: 0 };
}
// sphere vs capsule (post segment) with restitution
function collideSeg(b, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
  const t = L2 < 1e-9 ? 0 : clamp(((b.x - ax) * dx + (b.y - ay) * dy + (b.z - az) * dz) / L2, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t, cz = az + dz * t;
  let nx = b.x - cx, ny = b.y - cy, nz = b.z - cz;
  const d = Math.hypot(nx, ny, nz), min = BALL_R + POST_R;
  if (d >= min || d === 0) return false;
  nx /= d; ny /= d; nz /= d;
  b.x = cx + nx * min; b.y = cy + ny * min; b.z = cz + nz * min;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) { b.vx -= (1 + REST) * vn * nx; b.vy -= (1 + REST) * vn * ny; b.vz -= (1 + REST) * vn * nz; b.hits++; return true; }
  return false;
}
function stepBall(b, dt, g) {
  const px = b.x, sp = Math.hypot(b.vx, b.vy, b.vz);
  const airborne = b.y > FIELD_Y + BALL_R + .02;
  b.vx += -DRAG * sp * b.vx * dt;
  b.vy += (-GRAV - DRAG * sp * b.vy) * dt;
  b.vz += (-DRAG * sp * b.vz + (airborne ? b.windAcc : 0)) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.t += dt;
  b.spin += dt * (airborne ? 14 : Math.hypot(b.vx, b.vz) * 3);
  const cy = FIELD_Y + CROSS_H;
  let hit = false;
  hit = collideSeg(b, g.X, cy, -POST_HALF, g.X, cy + UPRIGHT_H, -POST_HALF) || hit;
  hit = collideSeg(b, g.X, cy, POST_HALF, g.X, cy + UPRIGHT_H, POST_HALF) || hit;
  hit = collideSeg(b, g.X, cy, -POST_HALF, g.X, cy, POST_HALF) || hit;
  hit = collideSeg(b, g.baseX, FIELD_Y, 0, g.baseX, cy, 0) || hit;
  hit = collideSeg(b, g.baseX, cy, 0, g.X, cy, 0) || hit;
  if (b.y < FIELD_Y + BALL_R) {
    b.y = FIELD_Y + BALL_R;
    if (b.vy < 0) { b.vy = -b.vy * .42; b.vx *= .72; b.vz *= .72; b.bounces++; if (b.vy < .6) b.vy = 0; }
  }
  if (b.y <= FIELD_Y + BALL_R + .001 && b.vy === 0) { const f = Math.pow(.25, dt); b.vx *= f; b.vz *= f; }
  if (!b.judged && (px - g.X) * (b.x - g.X) <= 0 && b.vx * g.side > 0) {
    b.judged = true; b.crossZ = b.z; b.crossY = b.y - FIELD_Y;
    if (b.bounces > 0) { b.good = false; b.why = "short"; }
    else {
      b.good = b.y > cy && Math.abs(b.z) < POST_HALF;
      b.why = b.good ? (b.hits ? "off the upright and in" : "") : b.y <= cy ? "under the crossbar" : (b.z * g.side > 0 ? "wide right" : "wide left");
    }
  }
  const sp2 = Math.hypot(b.vx, b.vy, b.vz);
  if (!b.judged && (b.t > 8 || (b.bounces > 0 && sp2 < .5) || b.vx * g.side < -1)) { b.judged = true; b.good = false; b.why = b.hits ? "doinked off the post" : "short"; }
  if (b.judged && (b.t > 9 || (b.bounces > 0 && sp2 < .4) || b.bounces >= 4 || (b.good && b.t > 4.5))) b.done = true;
  return hit;
}
function simulateKick(yaw, power, windAcc) {
  const g = goalInfo(), k = world.kick;
  const b = launchBall(toX(k.x), toZ(k.y), yaw, power, windAcc);
  let n = 0;
  while (!b.judged && n++ < 2400) stepBall(b, 1 / 240, g);
  return b;
}
function startKick() {
  const k = world.kick, g = goalInfo();
  player.x = k.x; player.y = k.y;
  const sx = toX(k.x), sz = toZ(k.y);
  const base = Math.atan2(0 - sz, g.X - sx), D = Math.abs(g.X - sx), wind = world.wind * .09;
  let pmin = 1;
  for (let p = 0; p <= 1.0001; p += .02) { if (simulateKick(base, p, 0).good) { pmin = p; break; } }
  const pref = Math.min(1, pmin + .25);
  let lo = -.3, hi = .3;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2, b = simulateKick(base + m, pref, wind); if (b.crossZ * g.side > 0) hi = m; else lo = m; }
  const center = clamp((lo + hi) / 2, -.28, .28);
  kick = { phase: "aim", t: 0, aim: 0, power: 0, base, D, pmin, center, halfWin: Math.atan(POST_HALF * .8 / D), wind, ball: null };
  player.dir = base; camYaw = base;
  showToast(`Press ${isTouch ? "USE" : "E"} to lock your aim inside the green window, then again to set the power.`, 4.5);
}
function kickPress() {
  if (!kick) return;
  if (kick.phase === "aim") { kick.aimLock = kick.aim; kick.phase = "power"; kick.t = 0; sfx("tick"); }
  else if (kick.phase === "power") {
    kick.powerLock = kick.power; kick.phase = "flight"; kick.t = 0;
    const k = world.kick;
    kick.ball = launchBall(toX(k.x), toZ(k.y), kick.base + kick.aimLock, kick.powerLock, kick.wind);
    player.balls--; stats.kicks++; player.kickAnim = 1;
    sfx("kick"); emitNoise(player.x, player.y, 20 * T);
  }
}
function updateKick(dt) {
  kick.t += dt;
  if (kick.phase === "aim") kick.aim = Math.sin(kick.t * 2.1) * .3;
  else if (kick.phase === "power") { const p = (kick.t * .85) % 2; kick.power = p < 1 ? p : 2 - p; }
  else if (kick.phase === "flight") {
    const b = kick.ball, g = goalInfo();
    const wasJudged = b.judged;
    for (let i = 0; i < 8; i++) if (stepBall(b, dt / 8, g)) { sfx("doink"); }
    if (!wasJudged && b.judged && b.good) goodKick();
    if (b.done && !b.good && mode === "play") {
      sfx("nogood");
      showToast(`No good, ${b.why}. ${player.balls > 0 ? `${player.balls} ball${player.balls > 1 ? "s" : ""} left.` : "Go grab the ball and try again."} Guards heard that.`, 4.5);
      items.push({ type: "ball", x: clamp(b.x * 8 + CX, TURF.x0 + 10, TURF.x1 - 10), y: clamp(b.z * 8 + CY, TURF.y0 + 10, TURF.y1 - 10), got: false, seen: true });
      kick = null;
    }
  }
}
function goodKick() {
  sfx("good"); mode = "kickgood"; celebrateT = 0; scoreFlash = 1;
  $("toast").hidden = true; $("prompt").hidden = true; $("kickUI").hidden = true; $("goodTxt").hidden = false;
  const g = goalInfo();
  spawnConfetti(g.X, FIELD_Y + CROSS_H + 4, 0);
  drawScoreboardTex(3);
}
