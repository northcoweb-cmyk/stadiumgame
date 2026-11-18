/* ---------- player: movement + vertical physics ---------- */
const PR = 4, GRAVITY = 16, JUMP_V = 5.6, STEP_UP = .55;
function tryMove(dx, dy) {
  let moved = true;
  for (const [mx, my] of [[dx, 0], [0, dy]]) {
    if (!mx && !my) continue;
    const nx = player.x + mx, ny = player.y + my;
    if (collides(nx, ny, PR)) { moved = false; continue; }
    const gh = groundAt(nx, ny);
    if (gh - player.h > STEP_UP) { moved = false; continue; }
    player.x = nx; player.y = ny;
    if (gh > player.h && player.onGround) player.h = gh;
  }
  return moved;
}
function updatePlayer(dt) {
  if (keys["arrowleft"]) camYaw -= dt * 2.2;
  if (keys["arrowright"]) camYaw += dt * 2.2;
  if (kick) { player.moving = false; player.mode = player.sneak ? "sneak" : "walk"; updateKick(dt); if (mode !== "play") return; }
  const [ix, iy, mag0] = kick ? [0, 0, 0] : inputVec();
  const mag = mag0;
  const sprint = (keys["shift"] || touchSprint) && mag > 0;
  player.mode = sprint ? "sprint" : player.sneak ? "sneak" : "walk";
  const spd = SPEED[player.mode] * (mag ? Math.max(.45, mag) : 0);
  player.moving = mag > 0 && player.onGround;
  if (mag > 0) {
    const fwd = -iy, rgt = ix;
    let mx = Math.cos(camYaw) * fwd - Math.sin(camYaw) * rgt, my = Math.sin(camYaw) * fwd + Math.cos(camYaw) * rgt;
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const ok = tryMove(mx * spd * dt, my * spd * dt);
    player.dir += angDiff(Math.atan2(my, mx), player.dir) * Math.min(1, dt * 12);
    if (!ok) {
      player.push += dt;
      if (player.push > .3) { const d = nearestDoor(); if (d) tryDoor(d, true); player.push = -.4; }
    } else player.push = 0;
    if (player.onGround) {
      player.stepT += dt;
      const iv = player.mode === "sprint" ? .3 : player.mode === "walk" ? .46 : .62;
      if (player.stepT >= iv) {
        player.stepT = 0;
        if (player.mode === "sprint") { emitNoise(player.x, player.y, 7 * T); sfx("step"); }
        else if (player.mode === "walk") { emitNoise(player.x, player.y, 2 * T); sfx("step"); }
      }
    }
  }
  // vertical physics: gravity, jumping, stairs
  const g = groundAt(player.x, player.y);
  if (player.jumpQueued && player.onGround && !kick) { player.vh = JUMP_V; player.onGround = false; player.h += .02; sfx("jump"); }
  player.jumpQueued = false;
  if (player.onGround && player.vh <= 0 && player.h - g <= .6) player.h = g;
  else { player.vh -= GRAVITY * dt; player.h += player.vh * dt; player.onGround = false; }
  if (player.h <= g) {
    if (!player.onGround && player.vh < -6.5) { emitNoise(player.x, player.y, 4 * T); sfx("land"); }
    player.h = g; player.vh = 0; player.onGround = true;
  }
  player.kickAnim = Math.max(0, (player.kickAnim || 0) - dt * 2.5);

  const [tx, ty] = tileOf(player.x, player.y);
  player.light = lightLvl[ty * W + tx] || 0;
  for (const gd of guards) { const d = dist(gd.x, gd.y, player.x, player.y); if (d < G_RANGE && Math.abs(angDiff(Math.atan2(player.y - gd.y, player.x - gd.x), gd.dir)) < G_HALF && los(gd.x, gd.y, player.x, player.y)) player.light = Math.max(player.light, 1 - d / G_RANGE * .5); }
  for (const it of items) {
    if (it.got) continue;
    if (!it.seen && dist(player.x, player.y, it.x, it.y) < 8 * T && los(player.x, player.y, it.x, it.y)) it.seen = true;
    if (dist(player.x, player.y, it.x, it.y) < 12 && Math.abs(player.h - groundAt(it.x, it.y)) < 1.6) {
      it.got = true; sfx("pickup");
      if (it.type === "card") { player.card = true; showToast("Field keycard! It opens the field gates and the players' tunnel.", 4.5); }
      else if (it.type === "bag") { player.balls += 3; showToast(`A bag of three footballs. Now get to the field and kick from the ${world.kick.yardLine}.`, 4.5); }
      else { player.balls += 1; showToast("Got the ball back."); }
    }
  }
  const s = sectionAt(player.x, player.y);
  if (s !== curSection) {
    const first = curSection === -1; curSection = s;
    if (!first) showSection(s);
    $("secLabel").textContent = s === 0 ? "Outside the stadium" : SECTIONS[s].n + " · " + SECTIONS[s].s.split(" · ")[0];
  }
  const r = 9;
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    const x = tx + ox, y = ty + oy;
    if (x < 0 || y < 0 || x >= W || y >= H || ox * ox + oy * oy > r * r) continue;
    const i = y * W + x;
    if (!explored[i]) { explored[i] = 1; fogImg.data[i * 4 + 3] = 0; fogDirty = true; }
  }
}
