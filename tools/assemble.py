import re, sys, os
D = os.path.dirname(os.path.abspath(__file__))
src = open('/home/user/stadiumgame/topdown.html').read()
kick = open(os.path.join(D, 'kick_part.js')).read()
playerp = open(os.path.join(D, 'player_part.js')).read()
three = open(os.path.join(D, 'three_part.js')).read()

def rep(s, old, new, count=1):
    if old not in s:
        sys.exit('MISSING: ' + old[:90])
    return s.replace(old, new, count)

def cut(s, start, end, new):
    a = s.find(start); b = s.find(end, a + 1)
    if a < 0 or b < 0:
        sys.exit('CUT MISSING: ' + start[:60] + ' / ' + end[:60])
    return s[:a] + new + s[b:]

s = src
# ---------- head / css / html ----------
s = rep(s, '<link rel="preconnect" href="https://fonts.googleapis.com">', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<link rel="preconnect" href="https://fonts.googleapis.com">')
s = rep(s, '/* Layout: full-bleed night canvas that follows the player;', '/* Layout: full-bleed 3D view with a chase camera;')
s = rep(s, '@media (max-width: 760px) {', '''#kickUI {
  position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 150px); transform: translateX(-50%);
  width: min(420px, calc(100% - 32px)); padding: 12px 14px; display: grid; gap: 8px; pointer-events: none;
}
#kickUI .row { display: grid; grid-template-columns: 54px 1fr; align-items: center; gap: 10px; }
#kickUI .lbl { font-family: var(--mono); font-size: 11px; letter-spacing: .14em; color: var(--mute); }
.track { position: relative; height: 16px; background: #0b1020; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
#aimWin { position: absolute; top: 0; bottom: 0; background: rgba(95,211,138,.45); border-left: 1px solid var(--go); border-right: 1px solid var(--go); }
#aimNeedle, #powTick { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1px; background: var(--gold); box-shadow: 0 0 8px var(--gold); }
#powTick { background: #fff; box-shadow: none; width: 2px; }
#powFill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--gold); }
#kickInfo { font-family: var(--mono); font-size: 12px; color: #cfd6e6; text-align: center; letter-spacing: .06em; }
#goodTxt { position: absolute; left: 50%; top: 30%; transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap;
  font-family: var(--varsity); font-size: clamp(48px, 11vw, 120px); color: var(--gold); text-transform: uppercase;
  text-shadow: 0 5px 0 var(--navy), 0 0 40px rgba(230,195,74,.5); animation: pop .5s ease-out; }
@keyframes pop { from { transform: translate(-50%, -50%) scale(.6); opacity: 0; } }
#lookHint { position: absolute; left: 50%; top: 50%; transform: translate(-50%, 60px); font-family: var(--mono); font-size: 12px; color: rgba(233,237,246,.6); pointer-events: none; letter-spacing: .08em; }
@media (max-width: 760px) {
  #tbtns { bottom: calc(env(safe-area-inset-bottom, 0px) + 112px); }''')
s = rep(s, '  <div id="toast" hidden></div>\n', '''  <div id="toast" hidden></div>
  <div id="kickUI" class="panel" hidden>
    <div class="row"><span class="lbl">AIM</span><div class="track"><i id="aimWin"></i><b id="aimNeedle"></b></div></div>
    <div class="row"><span class="lbl">POWER</span><div class="track"><i id="powFill"></i><b id="powTick"></b></div></div>
    <div id="kickInfo"></div>
  </div>
  <div id="goodTxt" hidden>It's good!</div>
  <div id="lookHint" hidden>Drag or click the view to look around</div>
''')
s = rep(s, '<div><kbd>WASD</kbd><span>move</span></div>', '<div><kbd>WASD</kbd><span>move &middot; <kbd>Space</kbd> jump</span></div>\n        <div><kbd>Mouse</kbd><span>click or drag to look &middot; wheel zooms</span></div>')
s = rep(s, '<div><kbd>Touch</kbd><span>drag on the left to move</span></div>', '<div><kbd>Touch</kbd><span>left side moves, right side looks</span></div>')
s = rep(s, '<div><kbd>E</kbd><span>try doors, use, kick</span></div>', '<div><kbd>E</kbd><span>try doors, use, kick &middot; <kbd>&larr;&rarr;</kbd> turn</span></div>')
s = rep(s, '<button id="bSprint">Sprint</button>', '<button id="bSprint">Sprint</button>\n      <button id="bJump">Jump</button>')
s = rep(s, '#tbtns #bUse { grid-column: span 2;', '#tbtns #bUse { grid-column: span 1;')

# ---------- tuning for 3D scale (1 tile = 2 m) ----------
s = rep(s, 'const SPEED = { sneak: 46, walk: 78, sprint: 134 };', 'const SPEED = { sneak: 22, walk: 38, sprint: 64 };')
s = rep(s, 'speed: 44 + Math.random() * 6,', 'speed: 25 + Math.random() * 4,')
s = rep(s, 'for (const [x, y] of W0.lamps) if (R() < .8) L(x * T + 8, y * T + 8, 120, .9, [255, 214, 160]);', 'for (const lp of W0.lamps) { lp.on = R() < .8; if (lp.on) L(lp[0] * T + 8, lp[1] * T + 8, 120, .9, [255, 214, 160]); }')
# drawField: optional goalposts
s = rep(s, 'function drawField(c) {', 'function drawField(c, opts) {')
s = rep(s, '  drawGoalpost(c, x0, -1); drawGoalpost(c, x1, 1);\n}', '  if (!opts || opts.posts !== false) { drawGoalpost(c, x0, -1); drawGoalpost(c, x1, 1); }\n}')
# renderStatic: drop the 2D lighting canvases
s = cut(s, '  // darkness base\n', '  miniBase = document.createElement("canvas");', '')
s = rep(s, 'let mapCanvas, darkBase, glowCanvas, miniBase;', 'let mapCanvas, miniBase;')
# entities get height / physics state
s = rep(s, 'hidden: !!demo, card: false, balls: 0, push: 0, light: 0 };', 'hidden: !!demo, card: false, balls: 0, push: 0, light: 0, h: 0, vh: 0, onGround: true, jumpQueued: false, kickAnim: 0 };\n  player.h = groundAt(player.x, player.y);')
s = rep(s, 'rings = []; stats = { spotted: 0, doorsTried: 0, kicks: 0 };', 'rings = []; stats = { spotted: 0, doorsTried: 0, kicks: 0 };\n  camYaw = Math.atan2(CY - player.y, CX - player.x);')
s = rep(s, '''  rollNight(seed);
  renderStatic();
  setupEntities(demo);
  resize();''', '''  rollNight(seed);
  computeHeights();
  renderStatic();
  setupEntities(demo);
  buildWorld3D();
  buildActors();
  resize();''')
s = rep(s, 'if ((mode === "play") && !player.hidden && dist(g.x, g.y, player.x, player.y) < 13) caught();', 'if ((mode === "play") && !player.hidden && dist(g.x, g.y, player.x, player.y) < 10 && Math.abs(player.h - groundAt(g.x, g.y)) < 1.4) caught();')
s = rep(s, 'while (g.route.length >= 2 && clearLine(g.x, g.y, g.route[1][0], g.route[1][1], 6)) g.route.shift();', 'while (g.route.length >= 2 && clearLine(g.x, g.y, g.route[1][0], g.route[1][1], 4)) g.route.shift();')

# ---------- kicking + player ----------
s = cut(s, '/* ---------- kicking ---------- */', '/* ---------- player ---------- */', kick + '\n')
s = cut(s, '/* ---------- player ---------- */', 'function update(dt) {', playerp + '\n')
s = rep(s, '''    if (kick && kick.ball) { const b = kick.ball, u = clamp((kick.t += dt) / b.dur, 0, 1); b.s = b.carry * u; b.h = 4 * b.peak * u * (1 - u); b.x = b.x0 + Math.cos(b.hd) * b.s; b.y = b.y0 + Math.sin(b.hd) * b.s; }
    if (celebrateT > 3.2) { win(); return; }''', '''    if (kick && kick.ball) { const g = goalInfo(); for (let i = 0; i < 8; i++) if (stepBall(kick.ball, dt / 8, g)) sfx("doink"); }
    if (celebrateT > 5) { win(); return; }''')
s = rep(s, '''  for (const p of confetti) { p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  confetti = confetti.filter((p) => p.life > 0);
''', '')

# ---------- replace 2D renderer with the 3D engine ----------
s = cut(s, '/* ============================================================\n   Rendering', '/* ---------- minimap ---------- */', three + '\n')

# ---------- input: jump, look, touch look ----------
s = rep(s, '''  if (k === "e" || k === " ") { if (mode === "play") useAction(); }''', '''  if (k === "e") { if (mode === "play") useAction(); }
  if (k === " " && mode === "play") { if (kick && kick.phase !== "flight") useAction(); else player.jumpQueued = true; }''')
s = rep(s, '''cvEl.addEventListener("pointerdown", (e) => {
  audioInit();
  if (e.pointerType !== "touch" || mode !== "play") return;
  if (touchMove.id !== null) return;''', '''let look = { id: null, x: 0, y: 0 };
cvEl.addEventListener("pointerdown", (e) => {
  audioInit();
  if (mode !== "play") return;
  $("lookHint").hidden = true;
  if (e.pointerType !== "touch" || e.clientX > innerWidth * .5) {
    look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    try { cvEl.setPointerCapture(e.pointerId); } catch (_) {}
    if (e.pointerType === "mouse" && !document.pointerLockElement && cvEl.requestPointerLock) { try { const p = cvEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
    return;
  }
  if (touchMove.id !== null) return;''')
s = rep(s, '''cvEl.addEventListener("pointermove", (e) => {
  if (e.pointerId !== touchMove.id) return;''', '''cvEl.addEventListener("pointermove", (e) => {
  if (e.pointerId === look.id && !document.pointerLockElement) {
    camYaw += (e.clientX - look.x) * .006; camPitch = clamp(camPitch + (e.clientY - look.y) * .004, .2, 1.3);
    look.x = e.clientX; look.y = e.clientY; return;
  }
  if (e.pointerId !== touchMove.id) return;''')
s = rep(s, 'function endTouch(e) { if (e.pointerId !== touchMove.id) return;', '''document.addEventListener("mousemove", (e) => { if (document.pointerLockElement === cvEl && mode === "play") { camYaw += e.movementX * .0026; camPitch = clamp(camPitch + e.movementY * .002, .2, 1.3); } });
cvEl.addEventListener("wheel", (e) => { e.preventDefault(); camDist = clamp(camDist + e.deltaY * .01, 5, 24); }, { passive: false });
function endTouch(e) { if (e.pointerId === look.id) { look.id = null; return; } if (e.pointerId !== touchMove.id) return;''')
s = rep(s, '''$("bUse").addEventListener("pointerdown", (e) => { e.preventDefault(); useAction(); });''', '''$("bUse").addEventListener("pointerdown", (e) => { e.preventDefault(); useAction(); });
$("bJump").addEventListener("pointerdown", (e) => { e.preventDefault(); if (mode === "play") player.jumpQueued = true; });''')
# arrow left/right turn the camera, up/down move
s = rep(s, '''  if (keys["a"] || keys["arrowleft"]) x -= 1;
  if (keys["d"] || keys["arrowright"]) x += 1;''', '''  if (keys["a"]) x -= 1;
  if (keys["d"]) x += 1;''')

# ---------- audio extras ----------
s = rep(s, '    case "tick": tone(1800, .03, "square", .04); break;', '''    case "tick": tone(1800, .03, "square", .04); break;
    case "doink": tone(1250, .35, "triangle", .2, .97); tone(2400, .2, "sine", .08); break;
    case "jump": tone(220, .08, "triangle", .05, 1.5); break;
    case "land": tone(80, .12, "triangle", .14, .6); break;''')

# ---------- HUD: kick meter ----------
s = rep(s, '  pr.hidden = !msg; pr.textContent = msg;', '''  pr.hidden = !msg; pr.textContent = msg;
  const ku = $("kickUI");
  if (kick && kick.phase !== "flight") {
    ku.hidden = false;
    const map = (a) => clamp((a + .32) / .64, 0, 1) * 100;
    $("aimWin").style.left = map(kick.center - kick.halfWin) + "%"; $("aimWin").style.width = (map(kick.center + kick.halfWin) - map(kick.center - kick.halfWin)) + "%";
    $("aimNeedle").style.left = map(kick.phase === "aim" ? kick.aim : kick.aimLock) + "%";
    $("powFill").style.width = (kick.phase === "power" ? kick.power * 100 : 0) + "%";
    $("powFill").style.background = kick.power >= kick.pmin ? "var(--go)" : "var(--gold)";
    $("powTick").style.left = kick.pmin * 100 + "%";
    const w = world.wind, wtxt = w === 0 ? "no wind" : `wind ${Math.abs(w)} mph`;
    $("kickInfo").textContent = `${world.kick.dist}-yard attempt · ${wtxt} · ${kick.phase === "aim" ? "lock aim in the green" : "power past the white line"}`;
  } else ku.hidden = true;''')

# ---------- play start: camera snap instead of 2D scroll ----------
s = rep(s, '  camX = clamp(player.x - vw / scale / 2, 0, Math.max(0, PW - vw / scale)); camY = clamp(player.y - vh / scale / 2, 0, Math.max(0, PH - vh / scale));\n', '  buildActors(); snapCam();\n  $("lookHint").hidden = isTouch;\n')
s = rep(s, '  setupEntities(false);\n  mode = "play"; objKey = "";', '  setupEntities(false);\n  $("goodTxt").hidden = true; confetti.visible = false; drawScoreboardTex(0);\n  mode = "play"; objKey = "";')
s = rep(s, 'showToast("Find a way in. Walk into doors or press E to try them. C to sneak.", 5);', 'showToast("Find a way in. Walk into doors or press E to try them. C sneaks, Space jumps.", 5);')
s = rep(s, '''  if (!on) { $("banner").hidden = true;''', '''  if (!on) { $("goodTxt").hidden = true; $("kickUI").hidden = true; $("lookHint").hidden = true; if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); $("banner").hidden = true;''')

# ---------- loop ----------
s = rep(s, '''  update(dt);
  updateCamView(dt);
  render(now);''', '''  update(dt);
  render3D(now, dt);''')
s = rep(s, '  validate(seed) {', '''  groundAt: (x, y) => groundAt(x, y), keys, setYaw(a) { camYaw = a; }, player: () => player, simulateKick, goalInfo,
  kickNow: () => kick, items: () => items, __step: (b, dt, g) => stepBall(b, dt, g), snapCam: () => snapCam(), step(dt, n) { for (let i = 0; i < n; i++) update(dt); },
  validate(seed) {''')
s = rep(s, 'function boot() { toMenu(); requestAnimationFrame(frame); }', '''function boot() {
  if (!window.THREE) { document.body.insertAdjacentHTML("beforeend", '<p style="position:fixed;inset:auto 16px 16px;color:#fff;font-family:sans-serif">The 3D engine (three.js) could not load. Check your connection and reload.</p>'); return; }
  initThree(); toMenu(); requestAnimationFrame(frame);
}''')
s = rep(s, '<title>Northridge After Dark</title>', '<title>Northridge After Dark 3D</title>')
import streak_hooks
s = streak_hooks.apply(s, rep, cut)
open('/home/user/stadiumgame/index.html', 'w').write(s)
print('ok', len(s))
