# Game Day Streak hooks, applied after the 3D build is assembled (s = full html)
import re
def apply(s, rep, cut):
    # include streak module
    streak = open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'streak_part.js')).read()
    s = rep(s, '/* ---------- player: movement + vertical physics ---------- */', streak + '\n/* ---------- player: movement + vertical physics ---------- */')
    # ---------- generation overrides ----------
    s = s.replace('if (R() < .72) L(', 'if (R() < .72 || isStreak()) L(')
    s = rep(s, 'const towersOn = shuffle(R, [0, 1, 2, 3]).slice(0, R() < .5 ? 2 : 3);', 'const towersOn = isStreak() ? [0, 1, 2, 3] : shuffle(R, [0, 1, 2, 3]).slice(0, R() < .5 ? 2 : 3);')
    s = rep(s, '  ].filter((c) => !solid[c.y * W + c.x]);', '  ].filter((c) => !solid[c.y * W + c.x]);\n  if (isStreak()) camDefs.length = 0;')
    s = rep(s, '    ...shuffle(R, GUARD_POOL.concourse).slice(0, 4),\n  ];', '    ...shuffle(R, GUARD_POOL.concourse).slice(0, 4),\n  ];\n  if (isStreak()) { guardDefs.length = 0; guardDefs.push(...streakGuardDefs(R)); }')
    s = rep(s, '  const boxes = rooms.filter(', '  const boxes = isStreak() ? [] : rooms.filter(')
    s = rep(s, '  for (const s of W0.shutters) { s.open = !s.locked; }', '  for (const s of W0.shutters) { s.open = !s.locked; }\n  if (isStreak()) streakDoors(W0);')
    # ---------- entities ----------
    s = rep(s, '  alarm = 0; camsOff = 0; time = 0; toastT = 0; kick = null; curSection = -1; celebrateT = 0; scoreFlash = 0;\n}',
        '  alarm = 0; camsOff = 0; time = 0; toastT = 0; kick = null; curSection = -1; celebrateT = 0; scoreFlash = 0;\n  if (isStreak()) { items = []; player.x = 64 * T; player.y = 93 * T; player.h = groundAt(player.x, player.y); camYaw = -Math.PI / 2; arrest = null; escorts = []; cuffMesh = null; setupStreak(); } else streak = null;\n}')
    s = rep(s, '  if (player.hidden || (mode !== "play" && mode !== "kickgood")) return 0;', '  if (player.hidden || (mode !== "play" && mode !== "kickgood")) return 0;\n  if (isStreak() && (!streak || !streak.alert)) return 0;')
    s = rep(s, 'function emitNoise(x, y, r) {\n', 'function emitNoise(x, y, r) {\n  if (isStreak() && (!streak || !streak.alert)) return;\n')
    s = rep(s, '< 1.4) caught();', '< 1.4 && (!isStreak() || (streak && streak.alert))) caught(g);')
    s = rep(s, 'function caught() {\n', 'function caught(by0) {\n  if (isStreak()) { startArrest(by0 || null); return; }\n')
    s = rep(s, 'function update(dt) {\n', 'function update(dt) {\n  if (isStreak() && streak && streakUpdate(dt)) return;\n')
    s = rep(s, 'function toggleSneak() { if (mode !== "play") return;', 'function toggleSneak() { if (mode !== "play") return; if (isStreak()) { player.slideQueued = true; return; }')
    s = rep(s, '  if (k === "m") toggleMute();', '  if (k === "m") toggleMute();\n  if (k === "q" && mode === "play" && isStreak()) player.spinQueued = true;')
    # ---------- audio: rain + crowd beds ----------
    s = rep(s, '    const g = AC.createGain(); g.gain.value = .035;\n    src.connect(f); f.connect(g); g.connect(master); src.start();',
        '''    rainGain = AC.createGain(); rainGain.gain.value = isStreak() ? 0 : .035;
    src.connect(f); f.connect(rainGain); rainGain.connect(master); src.start();
    const src2 = AC.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = .7;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 650; bp.Q.value = .6;
    crowdGain = AC.createGain(); crowdGain.gain.value = isStreak() ? .06 : 0;
    src2.connect(bp); bp.connect(crowdGain); crowdGain.connect(master); src2.start();''')
    s = rep(s, 'let AC = null, master = null,', 'let rainGain = null, crowdGain = null;\nlet AC = null, master = null,')
    s = rep(s, '    case "land": tone(80, .12, "triangle", .14, .6); break;', '''    case "land": tone(80, .12, "triangle", .14, .6); break;
    case "whistle": tone(2900, .45, "square", .05); tone(3150, .45, "square", .04); break;
    case "whistleSoft": tone(2900, .25, "square", .015); break;
    case "roar": crowdBoost = Math.min(1, crowdBoost + .5); tone(180, .6, "sawtooth", .03, 1.3); break;
    case "ohh": tone(330, .9, "sawtooth", .05, .6); tone(260, .9, "sawtooth", .04, .6); crowdBoost = 1; break;
    case "hit": tone(70, .25, "sine", .45, .5); tone(140, .1, "square", .15, .5); break;
    case "thud": tone(60, .2, "sine", .35, .6); tone(110, .08, "triangle", .12, .5); break;
    case "cuff": tone(3200, .03, "square", .12); tone(2400, .04, "square", .12, 1, .07); tone(2800, .03, "square", .1, 1, .16); break;
    case "radio": for (let i = 0; i < 3; i++) tone(900 + Math.random() * 600, .05, "square", .04, 1, i * .06); break;
    case "horn": tone(110, 1.1, "sawtooth", .14); tone(138, 1.1, "sawtooth", .1); break;
    case "slide": tone(160, .35, "triangle", .1, .5); break;
    case "boost": tone(400, .3, "triangle", .12, 3); break;
    case "grunt": tone(140, .12, "sawtooth", .06, .7); break;
    case "cell": tone(90, .5, "square", .12, .6, .3); tone(60, .4, "triangle", .2, .8, .32); break;''')
    # ---------- minimap ----------
    s = rep(s, '  const k = world.kick; mctx.strokeStyle = "#e6c34a"; mctx.lineWidth = 1.5;',
        '  if (isStreak() && streak) for (const s2 of fieldSec) { mctx.fillStyle = "#ff3b4e"; mctx.fillRect(s2.x * sx - 1.5, s2.y * sy - 1.5, 3, 3); }\n  const k = isStreak() ? { x: -99, y: -99 } : world.kick; mctx.strokeStyle = "#e6c34a"; mctx.lineWidth = 1.5;')
    # ---------- HUD ----------
    s = rep(s, 'function objectives() {\n', '''function objectives() {
  if (isStreak() && streak) return [
    [streak.cleared, "Walk through stadium security"],
    [streak.frontRow || streak.entered, "Pick an aisle and get down to the front row"],
    [streak.entered, "Jump the wall onto the field"],
    [streak.fieldTime >= ST.goal, "Stay on the field for a full minute"],
    [streak.escaped, "Escape the stadium without getting caught"],
  ];
''')
    s = rep(s, 'function updateHud(dt) {\n', 'function updateHud(dt) {\n  if (isStreak() && streak) updateStreakHud(dt);\n')
    s = rep(s, 'mc.textContent = player.mode === "sneak" ? "Sneak" : player.mode === "sprint" ? "Sprint" : "Walk";', 'mc.textContent = player.mode === "slide" ? "Slide" : player.mode === "sneak" ? "Sneak" : player.mode === "sprint" ? "Sprint" : (isStreak() ? "Run" : "Walk");')
    s = rep(s, '  else if (atKickSpot()) msg = `${key2}: line up the kick`;\n  else if (sectionAt(player.x, player.y) === 4 && player.balls === 0',
        '''  else if (isStreak() && streak && !player.vault && vaultSpot()) msg = vaultSpot().onto ? `${isTouch ? "JUMP" : "SPACE"}: hop the wall onto the field` : `${isTouch ? "JUMP" : "SPACE"}: climb into the stands`;
  else if (isStreak() && streak && !streak.cleared && dist(player.x, player.y, 64 * T, ARCH.y) < 70) msg = "Walk through the metal detector";
  else if (isStreak()) msg = "";
  else if (atKickSpot()) msg = `${key2}: line up the kick`;
  else if (sectionAt(player.x, player.y) === 4 && player.balls === 0''')
    s = rep(s, '  $("touch").hidden = !(on && isTouch);\n', '''  $("touch").hidden = !(on && isTouch);
  const st = on && isStreak();
  $("streakHud").hidden = !st; $("stamWrap").hidden = !st; $("secChip").hidden = !st; $("bSpin").hidden = !st;
  $("cardChip").hidden = st; $("ballChip").hidden = st;
  $("bSneak").textContent = isStreak() ? "Slide" : "Sneak";
  if (!on) $("popTxt").hidden = true;
''')
    # ---------- flow ----------
    s = rep(s, 'function openBrief(seed) {\n', 'function openBrief(seed) {\n  GAME_MODE = "heist"; $("result").classList.remove("side");\n')
    s = rep(s, '  $("goodTxt").hidden = true; confetti.visible = false; drawScoreboardTex(0);', '  $("goodTxt").hidden = true; confetti.visible = false; drawScoreboardTex(0);\n  $("fade").style.opacity = 0; $("result").classList.remove("side");\n  if (isStreak()) { drawStreakBoard(); applyModeLook(); if (jailGroup) jailGroup.visible = false; }')
    s = rep(s, '  showToast("Find a way in. Walk into doors or press E to try them. C sneaks, Space jumps.", 5);', '  if (isStreak()) { $("secLabel").textContent = "Game day · South lot"; showToast("Head to the Main Gate and walk through the security checkpoint.", 5); }\n  else showToast("Find a way in. Walk into doors or press E to try them. C sneaks, Space jumps.", 5);')
    s = rep(s, 'function toMenu() {\n  setPlayUI(false); kick = null;\n  newNight(freshSeed(), true);', 'function toMenu() {\n  setPlayUI(false); kick = null;\n  GAME_MODE = "streak"; $("fade").style.opacity = 0; $("result").classList.remove("side");\n  newNight(freshSeed(), true);')
    s = rep(s, '  $("bestTxt").textContent = save.best ? `Best night: ${fmt(save.best.time)} · ${"★".repeat(save.best.stars)}` : "";',
        '  $("bestTxt").textContent = [save.best ? `Best heist: ${fmt(save.best.time)} · ${"★".repeat(save.best.stars)}` : "", save.streak && save.streak.best ? `Longest streak: ${fmt(save.streak.best)}` : ""].filter(Boolean).join("  ·  ");')
    s = rep(s, '$("startBtn").addEventListener("click", () => { audioInit(); openBrief(freshSeed()); });', '$("startBtn").addEventListener("click", () => { audioInit(); openBrief(freshSeed()); });\n$("streakBtn").addEventListener("click", () => { audioInit(); openStreakBrief(freshSeed()); });\n$("bSpin").addEventListener("pointerdown", (e) => { e.preventDefault(); if (mode === "play" && isStreak()) player.spinQueued = true; });')
    s = rep(s, '  if (mode === "play" || mode === "kickgood") { miniT -= dt;', '  if (mode === "play" || mode === "kickgood") { miniT -= dt;')
    # ---------- test hooks ----------
    s = rep(s, '  validate(seed) {', '''  streak: () => streak, fieldSec: () => fieldSec, athletes: () => athletes, energies: () => energies, arrestState: () => arrest, mode: () => mode,
  setMode(m) { GAME_MODE = m; }, streakBrief: (seed) => openStreakBrief(seed), vaultSpot: () => vaultSpot(), startArrest: (b) => startArrest(b), seats: () => seatSpots.length,
  validate(seed) {''')
    # ---------- HTML ----------
    s = re.sub(r'<ol class="steps">.*?<span class="best" id="bestTxt"></span></div>', '''<div class="modes">
        <button class="mode hot" id="streakBtn"><span class="mk">Game Day &middot; New</span><b>Streak the Field</b><span>Sold-out crowd, game in progress. Sneak past security, pick your aisle, jump the wall and see how long you last.</span></button>
        <button class="mode" id="startBtn"><span class="mk">After Dark</span><b>Night Heist</b><span>Break into the empty stadium, find the keycard and footballs, and kick a field goal under the lights.</span></button>
      </div>
      <span class="best" id="bestTxt"></span>''', s, count=1, flags=re.S)
    s = rep(s, '<p class="lede">The Wolves moved out years ago, but the stadium is still locked up and watched every night. Get inside, work your way through all three sections, get down to the field, and kick a field goal under the lights.</p>',
        '<p class="lede">Two ways onto the field at Northridge College Stadium. Streak it on game day in front of a sold-out crowd, or break in after dark and kick a field goal in the empty bowl.</p>')
    s = rep(s, '<div><kbd>C</kbd><span>sneak: quiet, hard to see</span></div>', '<div><kbd>C</kbd><span>sneak (heist) &middot; slide (game day)</span></div>\n        <div><kbd>Q</kbd><span>spin move (game day)</span></div>')
    s = rep(s, '<button id="bJump">Jump</button>', '<button id="bJump">Jump</button>\n      <button id="bSpin" hidden>Juke</button>')
    s = rep(s, '<span id="ballTxt">0</span></div>', '<span id="ballTxt">0</span></div>\n      <div class="chip" id="secChip" hidden title="Security on the field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg><span id="secTxt"></span></div>')
    s = rep(s, '  <div id="goodTxt" hidden>It\'s good!</div>', '''  <div id="goodTxt" hidden>It's good!</div>
  <div id="streakHud" hidden>
    <div id="fieldClock"><b id="fieldTime">00:00</b><span>ON THE FIELD &middot; GOAL 1:00</span></div>
    <div id="hypeWrap"><span>CROWD</span><div class="track"><i id="hypeFill"></i></div></div>
  </div>
  <div id="stamWrap" hidden><span>STAMINA</span><div class="track"><i id="stamFill"></i></div></div>
  <div id="popTxt" hidden></div>
  <div id="fade"></div>''')
    s = rep(s, '#lookHint { position', '''.modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.mode { text-align: left; display: grid; gap: 6px; padding: 16px 18px; border-radius: 8px; cursor: pointer; background: rgba(13,18,34,.88); border: 1px solid var(--line); color: var(--ink); transition: transform .15s, border-color .15s; }
.mode:hover { transform: translateY(-2px); border-color: var(--gold); }
.mode:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.mode .mk { font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--mute); }
.mode b { font-family: var(--varsity); font-weight: 400; font-size: 26px; line-height: 1; text-transform: uppercase; }
.mode span:last-child { color: #c6cde0; font-size: 14px; line-height: 1.45; }
.mode.hot { border-color: #574a1d; background: linear-gradient(160deg, rgba(230,195,74,.18), rgba(13,18,34,.9) 60%); }
.mode.hot .mk { color: var(--gold); }
#streakHud { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 56px); transform: translateX(-50%); display: grid; gap: 6px; justify-items: center; pointer-events: none; }
#fieldClock { display: flex; align-items: baseline; gap: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 14px; }
#fieldClock b { font-family: var(--mono); font-size: 32px; color: #fff; font-weight: 400; font-variant-numeric: tabular-nums; }
#fieldClock span { font-family: var(--mono); font-size: 11px; letter-spacing: .14em; color: var(--mute); }
#fieldClock.done b { color: var(--go); }
#hypeWrap, #stamWrap { display: grid; grid-template-columns: auto 200px; gap: 8px; align-items: center; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; }
#hypeWrap { color: var(--gold); }
#hypeWrap .track, #stamWrap .track { height: 10px; }
#hypeFill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #e6c34a, #ff7a2a, #ff3b4e); }
#stamWrap { position: absolute; left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(env(safe-area-inset-bottom, 0px) + 54px); color: var(--mute); pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; grid-template-columns: auto 170px; }
#stamFill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--go); }
#stamWrap.boost { border-color: #7fe0ff; box-shadow: 0 0 18px rgba(127,224,255,.5); }
#popTxt { position: absolute; left: 50%; top: 31%; transform: translate(-50%, -50%); font-family: var(--varsity); font-size: clamp(28px, 6vw, 62px); color: #fff; text-shadow: 0 4px 0 var(--navy), 0 0 30px rgba(44,68,134,.8); pointer-events: none; white-space: nowrap; animation: pop .45s ease-out; }
#popTxt.gold { color: var(--gold); } #popTxt.warn { color: var(--cctv); } #popTxt.boost { color: #7fe0ff; }
#fade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
#result.side { justify-content: flex-end; background: linear-gradient(90deg, rgba(4,6,12,0) 25%, rgba(4,6,12,.85) 65%); }
@media (max-width: 760px) { #streakHud { top: calc(env(safe-area-inset-top, 0px) + 126px); } #hypeWrap { grid-template-columns: auto 130px; } #stamWrap { grid-template-columns: auto 110px; bottom: calc(env(safe-area-inset-bottom, 0px) + 96px); } #result.side { justify-content: center; background: rgba(4,6,12,.7); } }
#lookHint { position''')
    s = rep(s, '#tbtns #bUse { grid-column: span 1;', '#tbtns #bSpin { border-color: rgba(127,224,255,.5); color: #7fe0ff; }\n#tbtns #bUse { grid-column: span 1;')
    s = rep(s, 'Home of the Wolves &middot; <b>Closed to the public</b>', 'Home of the Wolves &middot; <b>Two ways onto the field</b>')
    return s
