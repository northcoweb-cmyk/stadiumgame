/* ============================================================
   Heightfield (meters). Plaza/concourse = 0, field sunk to -8.
   ============================================================ */
const FIELD_Y = -8;
const toX = (px) => (px - CX) / 8, toZ = (py) => (py - CY) / 8;
const tierH = (o) => FIELD_Y + 1 + Math.floor(o / 12) * .41;
const lockerRamp = (py) => FIELD_Y + clamp((py / T - 64.5) / 10, 0, 1) * 8;
let hgrid = null, wolvesIdx = -1;
const HGW = PW / 4, HGH = PH / 4;
function groundCalc(px, py) {
  const tx = Math.floor(px / T), ty = Math.floor(py / T);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 0;
  const i = ty * W + tx, ch = G[i], di = doorAt[i];
  if (ch === "g" || ch === "=") return FIELD_Y;
  if (roomAt[i] === wolvesIdx || (di >= 0 && doors[di].tunnel)) return lockerRamp(py);
  if (ch === "F" || (di >= 0 && doors[di].fieldGate)) return FIELD_Y + .5;
  if (tx >= 24 && tx <= 103 && ty >= 21 && ty <= 74) {
    const o = bowlOff(px, py);
    if (o < 0) return FIELD_Y;
    if (o < BOWL.depth) return tierH(o);
  }
  return 0;
}
function computeHeights() {
  wolvesIdx = rooms.findIndex((r) => r.def.id === "wolves");
  hgrid = new Float32Array(HGW * HGH);
  for (let y = 0; y < HGH; y++) for (let x = 0; x < HGW; x++) hgrid[y * HGW + x] = groundCalc(x * 4 + 2, y * 4 + 2);
}
function groundAt(px, py) {
  const x = clamp(Math.floor(px / 4), 0, HGW - 1), y = clamp(Math.floor(py / 4), 0, HGH - 1);
  return hgrid[y * HGW + x];
}

/* ============================================================
   Three.js scene
   ============================================================ */
let renderer, scene, cam3, worldGroup = null, actorGroup = null, facadeGroup = null;
let hemi, moon, ptPool = [], towerSpots = [], flashPool = [], lightCands = [], lightPick = 0;
let rainGeo, rainPos, confetti = null, playerMesh, playerMarker, ballMesh, scoreCanvas, scoreTex, kickMarker;
let camYaw = 0, camPitch = .72, camDist = 11, menuT = 0, vw = 0, vh = 0;
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3();
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const markTex = {};
const MAT = {};
let nightDisposables = [];

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (opts.night) nightDisposables.push(t);
  return t;
}
function unitBox() { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, .5, 0); return g; }
function mergeGeos(list) {
  let pos = [], nor = [], uv = [], idx = [], off = 0;
  for (const g of list) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, ix = g.index.array;
    pos.push(...p); nor.push(...n); uv.push(...u);
    for (const v of ix) idx.push(v + off);
    off += p.length / 3;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  m.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  m.setIndex(idx);
  return m;
}
function boxAt(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function instanced(geom, mat, list, opts = {}) {
  const m = new THREE.InstancedMesh(geom, mat, Math.max(1, list.length));
  const o = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z); o.rotation.set(it.rx || 0, it.ry || 0, 0); o.scale.set(it.sx || 1, it.sy || 1, it.sz || 1); o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (it.color !== undefined) { col.set(it.color); m.setColorAt(i, col); }
  });
  m.count = list.length;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
  return m;
}
function textPlane(text, w, h, opts = {}) {
  const pxW = Math.round(256 * w / h);
  const tex = canvasTex(Math.min(2048, pxW), 256, (c, cw, ch) => {
    c.fillStyle = opts.bg || "#1c2c57"; c.fillRect(0, 0, cw, ch);
    if (opts.border !== false) { c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 8; c.strokeRect(10, 10, cw - 20, ch - 20); }
    c.fillStyle = opts.fg || "#eef1f7"; c.textAlign = "center"; c.textBaseline = "middle";
    let fs = opts.size || 150;
    c.font = `${fs}px ${opts.font || "Graduate, Georgia, serif"}`;
    while (c.measureText(text).width > cw - 60 && fs > 20) { fs -= 6; c.font = `${fs}px ${opts.font || "Graduate, Georgia, serif"}`; }
    c.fillText(text, cw / 2, ch / 2 + 6);
  }, { night: true });
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: opts.tint || 0xbdc3d0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide, fog: true });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas: cvEl, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a14);
  scene.fog = new THREE.FogExp2(0x080c18, .0065);
  cam3 = new THREE.PerspectiveCamera(55, 1, .1, 1200);

  hemi = new THREE.HemisphereLight(0x5068a8, 0x0c0e16, .62); scene.add(hemi);
  moon = new THREE.DirectionalLight(0xb4c4ff, .5);
  moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 });
  moon.shadow.bias = -.0008; moon.shadow.normalBias = .02;
  scene.add(moon, moon.target);
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc478, 0, 20, 2); scene.add(l); ptPool.push(l); }
  for (let i = 0; i < 4; i++) { const s = new THREE.SpotLight(0xdfe8ff, 0, 220, .55, .65, 1); scene.add(s, s.target); towerSpots.push(s); }
  for (let i = 0; i < 3; i++) { const s = new THREE.SpotLight(0xffe2a8, 0, 26, .42, .55, 1.2); scene.add(s, s.target); flashPool.push(s); }

  // shared materials
  const concrete = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#7a7f89"; c.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 2600; i++) { const v = 90 + R() * 70; c.fillStyle = `rgba(${v},${v + 2},${v + 8},.25)`; c.fillRect(R() * w, R() * h, 2, 2); }
    for (let i = 0; i < 12; i++) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(20,24,30,0)"); g.addColorStop(1, "rgba(20,24,30,.35)"); c.fillStyle = g; c.fillRect(R() * w, 0, 3 + R() * 10, h); }
    c.strokeStyle = "rgba(30,32,38,.6)"; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }, { repeat: true });
  MAT.wall = new THREE.MeshStandardMaterial({ map: concrete, color: 0x8a8f9a, roughness: .88 });
  MAT.facade = new THREE.MeshStandardMaterial({ map: concrete, color: 0x9aa0ab, roughness: .9 });
  MAT.tier = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: .05 });
  MAT.seat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .38, metalness: .08 });
  MAT.navy = new THREE.MeshStandardMaterial({ color: 0x1c2c57, roughness: .6 });
  MAT.metal = new THREE.MeshStandardMaterial({ color: 0xb8c0cf, roughness: .35, metalness: .7 });
  MAT.gold = new THREE.MeshStandardMaterial({ color: 0xe6c34a, roughness: .35, metalness: .55, emissive: 0x3a2c05 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 });
  MAT.glow = new THREE.MeshBasicMaterial({ color: 0xffe7c0 });
  MAT.glowOff = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: .5 });
  const ncTex = canvasTex(256, 512, (c, w, h) => {
    c.fillStyle = "#1c2c57"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28);
    c.font = "120px Graduate, Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#eef1f7"; c.fillText("NC", w / 2, h * .42);
    c.font = "40px Graduate, Georgia, serif"; c.fillText("GO", w / 2, h * .68); c.fillText("WOLVES", w / 2, h * .78);
  });
  MAT.banner = new THREE.MeshStandardMaterial({ map: ncTex, roughness: .7 });
  const grille = canvasTex(64, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = "#b9c0cc"; for (let x = 0; x < w; x += 10) c.fillRect(x, 0, 3, h); c.fillRect(0, 0, w, 4); c.fillRect(0, h / 2, w, 3); }, { repeat: true });
  MAT.grille = new THREE.MeshStandardMaterial({ map: grille, transparent: true, alphaTest: .4, side: THREE.DoubleSide, metalness: .6, roughness: .4 });
  MAT.door = new THREE.MeshStandardMaterial({ color: 0x6b7382, roughness: .45, metalness: .5 });
  MAT.cardDoor = new THREE.MeshStandardMaterial({ color: 0x40507a, roughness: .45, metalness: .5 });

  // marks
  for (const [k, ch, col] of [["!", "!", "#ff3b4e"], ["?", "?", "#e6c34a"], ["X", "✕", "#ff3b4e"]]) {
    markTex[k] = canvasTex(64, 64, (c) => { c.font = "900 54px 'Big Shoulders Display', Impact, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = 8; c.strokeStyle = "rgba(0,0,0,.7)"; c.strokeText(ch, 32, 34); c.fillStyle = col; c.fillText(ch, 32, 34); });
  }
  markTex.glow = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.3, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });

  // sky: gradient dome, moon, stars, clouds
  const skyTex = canvasTex(16, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#03050b"); g.addColorStop(.45, "#0a1124"); g.addColorStop(.52, "#1a2340"); g.addColorStop(1, "#080b14"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const moonSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "#f4f6ff"); g.addColorStop(.32, "#e6ebff"); g.addColorStop(.36, "rgba(170,190,255,.35)"); g.addColorStop(1, "rgba(120,140,220,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }), fog: false, depthWrite: false }));
  moonSpr.position.set(-320, 420, -520); moonSpr.scale.set(110, 110, 1); scene.add(moonSpr);
  const starGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 700; i++) { const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.2; sp.push(Math.cos(th) * Math.sin(ph) * 850, Math.cos(ph) * 850 * .9 + 60, Math.sin(th) * Math.sin(ph) * 850); }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fb0d8, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: .7 })));
  const cloudTex = canvasTex(512, 256, (c, w, h) => { const R = rng(9); for (let i = 0; i < 40; i++) { const x = R() * w, y = h * .3 + R() * h * .4, r = 30 + R() * 70; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, "rgba(40,50,80,.35)"); g.addColorStop(1, "rgba(40,50,80,0)"); c.fillStyle = g; c.fillRect(0, 0, w, h); } });
  for (let i = 0; i < 6; i++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(700, 260), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false })); const a = i / 6 * Math.PI * 2; cl.position.set(Math.cos(a) * 650, 240 + (i % 3) * 40, Math.sin(a) * 650); cl.lookAt(0, 200, 0); scene.add(cl); }

  // rain
  rainGeo = new THREE.BufferGeometry(); rainPos = new Float32Array(1800 * 6);
  for (let i = 0; i < 1800; i++) { const x = (Math.random() - .5) * 70, y = Math.random() * 30, z = (Math.random() - .5) * 70; rainPos.set([x, y, z, x + .08, y - .7, z], i * 6); }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9fb2dd, transparent: true, opacity: .28, depthWrite: false }));
  rain.frustumCulled = false; rain.name = "rain"; scene.add(rain);

  // confetti
  const cg = new THREE.BufferGeometry(), N = 400;
  cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const cc = new Float32Array(N * 3); const pal = [[.9, .76, .29], [.93, .95, .97], [.17, .27, .53]];
  for (let i = 0; i < N; i++) cc.set(pal[i % 3], i * 3);
  cg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
  confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: .13, vertexColors: true }));
  confetti.frustumCulled = false; confetti.visible = false; confetti.userData = { v: new Float32Array(N * 3), life: 0 };
  scene.add(confetti);

  playerMesh = makeHuman({ body: 0xd5dae6, legs: 0x1a1f2b, head: 0x8f97ab, pack: 0xe6c34a });
  scene.add(playerMesh);
  playerMarker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.glow, color: 0xe6c34a, depthTest: false, transparent: true, opacity: .55 }));
  playerMarker.scale.set(1.4, 1.4, 1); playerMarker.renderOrder = 10; scene.add(playerMarker);
  ballMesh = makeFootball(); ballMesh.visible = false; scene.add(ballMesh);
}

function makeFootball() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(.14, 18, 12), new THREE.MeshStandardMaterial({ color: 0x7a3f1c, roughness: .55 }));
  body.scale.set(1.6, 1, 1); body.castShadow = true; g.add(body);
  const lace = new THREE.Mesh(new THREE.BoxGeometry(.12, .01, .025), MAT.white); lace.position.y = .14; g.add(lace);
  return g;
}
function makeHuman(c) {
  const g = new THREE.Group();
  const m = (col, rough = .7) => new THREE.MeshStandardMaterial({ color: col, roughness: rough });
  const legM = m(c.legs), bodyM = m(c.body), headM = m(c.head);
  const hipL = new THREE.Group(), hipR = new THREE.Group(); hipL.position.set(-.13, .86, 0); hipR.position.set(.13, .86, 0);
  const leg = new THREE.BoxGeometry(.17, .84, .2); leg.translate(0, -.42, 0);
  hipL.add(new THREE.Mesh(leg, legM)); hipR.add(new THREE.Mesh(leg, legM));
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.5, .64, .3), bodyM); torso.position.y = 1.2;
  const shL = new THREE.Group(), shR = new THREE.Group(); shL.position.set(-.31, 1.48, 0); shR.position.set(.31, 1.48, 0);
  const arm = new THREE.BoxGeometry(.13, .6, .15); arm.translate(0, -.3, 0);
  shL.add(new THREE.Mesh(arm, bodyM)); shR.add(new THREE.Mesh(arm, bodyM));
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 16, 12), headM); head.position.y = 1.72;
  g.add(hipL, hipR, torso, shL, shR, head);
  if (c.pack) { const p = new THREE.Mesh(new THREE.BoxGeometry(.4, .46, .18), m(c.pack, .5)); p.position.set(0, 1.22, -.24); g.add(p); }
  if (c.cap) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.18, .19, .1, 14), m(c.cap)); cap.position.y = 1.84; g.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(.3, .03, .16), m(c.cap)); brim.position.set(0, 1.8, .18); g.add(brim);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .02), MAT.gold); badge.position.set(-.12, 1.32, .16); g.add(badge);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.userData = { hipL, hipR, shL, shR };
  return g;
}
function animHuman(g, phase, amp, kick) {
  const u = g.userData, s = Math.sin(phase) * amp;
  u.hipL.rotation.x = s; u.hipR.rotation.x = -s; u.shL.rotation.x = -s * .8; u.shR.rotation.x = s * .8;
  if (kick) { u.hipR.rotation.x = -Math.sin(kick * Math.PI) * 1.6; u.shL.rotation.x = -kick; }
}

function disposeGroup(grp) {
  if (!grp) return;
  scene.remove(grp);
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const mm of ms) { if (!Object.values(MAT).includes(mm)) mm.dispose(); } }
  });
}

/* ---------- per-night static world ---------- */
const SEGN = [44, 8, 24, 8, 44, 8, 24, 8];
function contourPt(o, seg, u) {
  const hx = BOWL.hx + o, hy = BOWL.hy + o, r = BOWL.k * o, P = Math.PI;
  let a;
  switch (seg) {
    case 0: return [CX + lerp(-hx + r, hx - r, u), CY - hy, 0, -1];
    case 1: a = -P / 2 + u * P / 2; return [CX + hx - r + Math.cos(a) * r, CY - hy + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
    case 2: return [CX + hx, CY + lerp(-hy + r, hy - r, u), 1, 0];
    case 3: a = u * P / 2; return [CX + hx - r + Math.cos(a) * r, CY + hy - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
    case 4: return [CX + lerp(hx - r, -hx + r, u), CY + hy, 0, 1];
    case 5: a = P / 2 + u * P / 2; return [CX - hx + r + Math.cos(a) * r, CY + hy - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
    case 6: return [CX - hx, CY + lerp(hy - r, -hy + r, u), -1, 0];
    default: a = P + u * P / 2; return [CX - hx + r + Math.cos(a) * r, CY - hy + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)];
  }
}
function buildTiers() {
  const pos = [], nor = [], col = [];
  const top = [.32, .33, .38], riser = [.18, .19, .23], aisle = [.46, .48, .54], nose = [.75, .62, .26];
  const quad = (a, b, c, d, n, cl) => {
    // keep the winding consistent with the intended normal so lighting is never flipped
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = d; d = t; }
    for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); col.push(...cl); }
  };
  for (let k = 0; k < 18; k++) {
    const o0 = k * 12, o1 = Math.min(o0 + 12, BOWL.depth), h = tierH(o0 + .5), hp = k === 0 ? FIELD_Y : tierH(o0 - 6);
    for (let s = 0; s < 8; s++) {
      const n = SEGN[s];
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const mid = contourPt(o0 + 6, s, (u0 + u1) / 2), ch = chAt(mid[0], mid[1]);
        if (ch !== "s" && ch !== "a") continue;
        const A0 = contourPt(o0, s, u0), A1 = contourPt(o0, s, u1), B0 = contourPt(o1, s, u0), B1 = contourPt(o1, s, u1);
        const P = (p, y) => [toX(p[0]), y, toZ(p[1])];
        const cl = ch === "a" ? aisle : top;
        quad(P(A0, h), P(B0, h), P(B1, h), P(A1, h), [0, 1, 0], cl);
        quad(P(A0, hp), P(A0, h), P(A1, h), P(A1, hp), [-A0[2], 0, -A0[3]], ch === "a" ? nose : riser);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, MAT.tier); m.receiveShadow = true;
  return m;
}
function buildSeats() {
  const geo = mergeGeos([boxAt(.44, .08, .42, 0, .42, -.02), boxAt(.44, .5, .06, 0, .62, .2), boxAt(.06, .4, .06, 0, .2, .08)]);
  const list = [], R = rng(world.seed + 31);
  for (let k = 0; k <= 16; k++) {
    const o = k * 12 + 7, hx = BOWL.hx + o, hy = BOWL.hy + o;
    rrWalk(hx, hy, BOWL.k * o, 4.2, (x, y, nx, ny) => {
      if (chAt(x, y) !== "s" || chAt(x + ny * 2.5, y - nx * 2.5) !== "s" || chAt(x - ny * 2.5, y + nx * 2.5) !== "s") return;
      const v = R();
      if (v < .025) return;
      const color = v < .1 ? 0x46506c : v < .13 ? 0x5b6274 : new THREE.Color(0x22356b).multiplyScalar(.85 + R() * .3).getHex();
      list.push({ x: toX(x), y: tierH(o - 6), z: toZ(y), ry: Math.atan2(nx, ny) + (v < .1 ? (R() - .5) * .3 : 0), color });
    });
  }
  return instanced(geo, MAT.seat, list, { cast: false });
}

const FURN3 = {
  1: [1.9, 0x434852], 2: [.5, 0x22315e], 3: [1.05, 0x23272f], 4: [.78, 0x56442f], 5: [1.05, 0x7a818d], 6: [.95, 0x636a76],
  7: [2.0, 0x535a66], 8: [.9, 0xcfd4dc], 9: [.7, 0xd9dde5], 10: [.76, 0x3e2e22], 11: [2.2, 0x5a4630], 12: [1.2, 0x3b3f48],
  13: [1.1, 0x2f5a34], 14: [2.2, 0x1f3266], 15: [.46, 0x7a5636], 16: [1.0, 0xd9dde5], 20: [.95, 0x1c2c57],
};

function buildWorld3D() {
  disposeGroup(worldGroup); disposeGroup(facadeGroup);
  for (const t of nightDisposables) t.dispose();
  nightDisposables = [];
  worldGroup = new THREE.Group(); facadeGroup = new THREE.Group();
  scene.add(worldGroup, facadeGroup);
  const add = (o) => { worldGroup.add(o); return o; };

  // ground plane (plaza, concourse, rooms) with the bowl cut out
  const shape = new THREE.Shape();
  shape.moveTo(toX(0), toZ(0)); shape.lineTo(toX(PW), toZ(0)); shape.lineTo(toX(PW), toZ(PH)); shape.lineTo(toX(0), toZ(PH)); shape.lineTo(toX(0), toZ(0));
  const ohx = (BOWL.hx + BOWL.depth) / 8, ohy = (BOWL.hy + BOWL.depth) / 8, orr = BOWL.k * BOWL.depth / 8;
  const hole = new THREE.Path();
  hole.moveTo(-ohx + orr, -ohy); hole.lineTo(ohx - orr, -ohy); hole.absarc(ohx - orr, -ohy + orr, orr, -Math.PI / 2, 0, false);
  hole.lineTo(ohx, ohy - orr); hole.absarc(ohx - orr, ohy - orr, orr, 0, Math.PI / 2, false);
  hole.lineTo(-ohx + orr, ohy); hole.absarc(-ohx + orr, ohy - orr, orr, Math.PI / 2, Math.PI, false);
  hole.lineTo(-ohx, -ohy + orr); hole.absarc(-ohx + orr, -ohy + orr, orr, Math.PI, Math.PI * 1.5, false);
  shape.holes.push(hole);
  const gg = new THREE.ShapeGeometry(shape, 16);
  gg.rotateX(Math.PI / 2);
  const gp = gg.attributes.position, uvs = new Float32Array(gp.count * 2);
  for (let i = 0; i < gp.count; i++) { uvs[i * 2] = (gp.getX(i) * 8 + CX) / PW; uvs[i * 2 + 1] = 1 - (gp.getZ(i) * 8 + CY) / PH; }
  gg.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  gg.computeVertexNormals();
  const mapTex = new THREE.CanvasTexture(mapCanvas); mapTex.encoding = THREE.sRGBEncoding; mapTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); nightDisposables.push(mapTex);
  // dark lots beyond the map edge (four strips, so the sunken bowl stays open)
  const outerMat = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: .6 });
  for (const [w, h, x, z] of [[2400, 1100, 0, -96 - 550], [2400, 1100, 0, 96 + 550], [1100, 192, -128 - 550, 0], [1100, 192, 128 + 550, 0]]) {
    const o = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), outerMat)); o.rotation.x = -Math.PI / 2; o.position.set(x, -.05, z); o.receiveShadow = true;
  }
  const ground = add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: mapTex, roughness: .5, metalness: .08, side: THREE.DoubleSide })));
  ground.receiveShadow = true;

  // field turf
  const k = 4, fc = document.createElement("canvas");
  fc.width = (TURF.x1 - TURF.x0) * k; fc.height = (TURF.y1 - TURF.y0) * k;
  const fx = fc.getContext("2d"); fx.setTransform(k, 0, 0, k, -TURF.x0 * k, -TURF.y0 * k); drawField(fx, { posts: false });
  const fTex = new THREE.CanvasTexture(fc); fTex.encoding = THREE.sRGBEncoding; fTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); nightDisposables.push(fTex);
  const turf = add(new THREE.Mesh(new THREE.PlaneGeometry((TURF.x1 - TURF.x0) / 8, (TURF.y1 - TURF.y0) / 8), new THREE.MeshStandardMaterial({ map: fTex, roughness: .82 })));
  turf.rotation.x = -Math.PI / 2; turf.position.y = FIELD_Y; turf.receiveShadow = true;

  add(buildTiers());
  add(buildSeats());

  // walls, facade, structures, rails, field wall, pillars, furniture
  const walls = [], facade = [], struct = [], rails = [], curbs = [], fwall = [], pillars = [], furn3 = {}, glowFurn = [];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = ty * W + tx, ch = G[i], x = toX(tx * T + 8), z = toZ(ty * T + 8);
    const inBowl = tx >= 24 && tx <= 103 && ty >= 21 && ty <= 74;
    if (ch === "#") {
      const outer = tx === 10 || tx === 117 || ty === 8 || ty === 87;
      const y0 = inBowl ? FIELD_Y : -.05;
      walls.push({ x, y: y0, z, sx: 2, sy: 3.2 - y0, sz: 2 });
      if (outer) facade.push({ x, y: 3.15, z, sx: 2.02, sy: 5.6, sz: 2.02 });
    } else if (ch === "x") struct.push({ x, y: FIELD_Y, z, sx: 2, sy: -FIELD_Y + .6, sz: 2 });
    else if (ch === "R") {
      const horiz = ty === 20 || ty === 75;
      curbs.push({ x, y: -.05, z, sx: 2, sy: .4, sz: 2 });
      rails.push({ x, y: 1.0, z, sx: horiz ? 2 : .07, sy: .07, sz: horiz ? .07 : 2 });
      rails.push({ x, y: .35, z, sx: .07, sy: .7, sz: .07 });
    } else if (ch === "F") fwall.push({ x, y: FIELD_Y, z, sx: 2, sy: 1.25, sz: 2 });
    else if (ch === "p") pillars.push({ x, y: 0, z, sx: 1.3, sy: 4.2, sz: 1.3 });
    else if ((ch === "c" || ch === "k") && furn[i]) {
      const f = FURN3[furn[i]] || [1, 0x555555], base = groundAt(tx * T + 8, ty * T + 8);
      const it = { x, y: base, z, sx: 1.85, sy: f[0], sz: 1.85, color: f[1] };
      if (furn[i] === 3) glowFurn.push({ x, y: base + f[0], z, sx: 1.4, sy: .7, sz: .08 });
      if (furn[i] === 20) { it.sx = it.sz = .9; }
      (furn3[furn[i]] = furn3[furn[i]] || []).push(it);
    }
  }
  add(instanced(unitBox(), MAT.wall, walls, { cast: true }));
  facadeGroup.add(instanced(unitBox(), MAT.facade, facade, { cast: false }));
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: .8 }), struct, { cast: false }));
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: .7 }), curbs));
  add(instanced(unitBox(), MAT.metal, rails, { cast: true }));
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0x1a2a57, roughness: .55 }), fwall));
  add(instanced(unitBox(), MAT.banner, pillars, { cast: true }));
  const furnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6, metalness: .1 });
  for (const code in furn3) add(instanced(unitBox(), furnMat, furn3[code], { cast: true }));
  if (glowFurn.length) add(instanced(unitBox(), new THREE.MeshBasicMaterial({ color: 0x6f9cff }), glowFurn));

  // field-wall lettering
  for (const [x, z, ry, w] of [[0, toZ(35 * T) - .01, 0, 104], [0, toZ(61 * T) + .01, Math.PI, 104], [toX(38 * T) - .01, 0, Math.PI / 2, 52], [toX(90 * T) + .01, 0, -Math.PI / 2, 52]]) {
    const p = textPlane(w > 60 ? "NORTHRIDGE  ·  GO WOLVES  ·  NORTHRIDGE  ·  GO WOLVES  ·  NORTHRIDGE" : "NORTHRIDGE  ·  GO WOLVES", w, 1.1, { size: 120, border: false, tint: 0xd0d6e2 });
    p.position.set(x, FIELD_Y + .62, z); p.rotation.y = ry; add(p);
  }
  // tunnel floor + side walls + locker ramp
  const tf = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: .4 }));
  tf.rotation.x = -Math.PI / 2; tf.position.set(toX(64 * T), FIELD_Y + .01, toZ(62 * T)); add(tf);
  add(instanced(unitBox(), MAT.wall, [{ x: toX(63 * T) - .1, y: FIELD_Y, z: toZ(62 * T), sx: .2, sy: 2.2, sz: 4 }, { x: toX(65 * T) + .1, y: FIELD_Y, z: toZ(62 * T), sx: .2, sy: 2.2, sz: 4 }], { cast: true }));
  const wr = rooms[wolvesIdx], rx0 = toX(wr.x0 * T), rx1 = toX((wr.x1 + 1) * T), rz0 = toZ(wr.y0 * T), rz1 = toZ((wr.y1 + 1) * T);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.Float32BufferAttribute([rx0, lockerRamp(wr.y0 * T), rz0, rx1, lockerRamp(wr.y0 * T), rz0, rx1, lockerRamp((wr.y1 + 1) * T), rz1, rx0, lockerRamp((wr.y1 + 1) * T), rz1], 3));
  rg.setIndex([0, 2, 1, 0, 3, 2]); rg.computeVertexNormals();
  if (rg.attributes.normal.getY(0) < 0) { rg.setIndex([0, 1, 2, 0, 2, 3]); rg.computeVertexNormals(); }
  const ramp = add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x1c2a52, roughness: .8, side: THREE.DoubleSide }))); ramp.receiveShadow = true;
  const lockLogo = textPlane("NC", 6, 6, { bg: "rgba(0,0,0,0)", border: false, size: 180, tint: 0x8090c0, double: true });
  lockLogo.material.transparent = true; lockLogo.rotation.x = -Math.PI / 2 + Math.atan2(8, (wr.y1 - wr.y0 + 1) * 2); lockLogo.position.set(0, lockerRamp(69.5 * T) + .05, toZ(69.5 * T)); add(lockLogo);

  // facade signage and gate lintels
  for (const [tx, ty, side] of [[35, 87, "S"], [92, 87, "S"], [35, 8, "N"], [92, 8, "N"]]) {
    const p = textPlane("NORTHRIDGE COLLEGE", 22, 2.4, { size: 170 });
    p.position.set(toX(tx * T), 6.2, side === "S" ? toZ(88 * T) + .05 : toZ(8 * T) - .05); p.rotation.y = side === "S" ? 0 : Math.PI; facadeGroup.add(p);
    const nc = textPlane("NC", 3.2, 3.2, { size: 170 }); nc.position.set(toX(tx * T) + (tx < 64 ? -15 : 15), 6.2, p.position.z); nc.rotation.y = p.rotation.y; facadeGroup.add(nc);
  }
  for (const gt of world.gates) {
    const xs = gt.tiles.map((t) => t[0]), ys = gt.tiles.map((t) => t[1]);
    const cx = toX((Math.min(...xs) + Math.max(...xs) + 1) / 2 * T), cz = toZ((Math.min(...ys) + Math.max(...ys) + 1) / 2 * T);
    const along = ys[0] === ys[ys.length - 1];
    facadeGroup.add(instanced(unitBox(), MAT.facade, [{ x: cx, y: 3.15, z: cz, sx: along ? gt.tiles.length * 2 : 2.02, sy: 5.6, sz: along ? 2.02 : gt.tiles.length * 2 }]));
    const out = gt.gateId === "S" ? [0, 1] : gt.gateId === "N" ? [0, -1] : gt.gateId === "W" ? [-1, 0] : [1, 0];
    const sgn = textPlane(gt.name.toUpperCase(), Math.max(7, gt.tiles.length * 1.8), 1.3, { size: 150 });
    sgn.position.set(cx + out[0] * 1.06, 4.1, cz + out[1] * 1.06); sgn.rotation.y = Math.atan2(out[0], out[1]); add(sgn);
  }
  for (const r of rooms) if (r.dock) {
    const [tx, ty] = r.dock.tiles[0];
    facadeGroup.add(instanced(unitBox(), MAT.facade, [{ x: toX(tx * T + 8), y: 3.15, z: toZ(ty * T + 8), sx: 2.02, sy: 5.6, sz: 2.02 }]));
  }

  // room signs above doors (concourse side)
  for (const r of rooms) {
    const d = r.door, f = r.side === "N" ? [0, -1] : r.side === "S" ? [0, 1] : r.side === "E" ? [1, 0] : [-1, 0];
    const s = textPlane(r.def.name.toUpperCase(), Math.max(3.4, r.def.name.length * .32), .7, { size: 130, font: "600 130px Barlow, sans-serif".replace(/^600 130px /, "") });
    s.position.set(toX(d.cx) + f[0] * 1.05, groundAt(d.cx, d.cy) + 2.85, toZ(d.cy) + f[1] * 1.05); s.rotation.y = Math.atan2(f[0], f[1]); add(s);
    const ex = new THREE.Mesh(new THREE.BoxGeometry(.5, .2, .05), new THREE.MeshBasicMaterial({ color: 0x3ad17a }));
    ex.position.set(toX(d.cx) + f[0] * 1.04, groundAt(d.cx, d.cy) + 2.42, toZ(d.cy) + f[1] * 1.04); ex.rotation.y = s.rotation.y; add(ex);
  }
  // section plates over aisle openings
  let n1 = 101, n2 = 201, n3 = 301;
  const plate = (px, py, f) => {
    const sct = sectionAt(px, py), n = sct === 1 ? n1++ : sct === 2 ? n2++ : n3++;
    const p = textPlane(String(n), 1.6, .8, { size: 170 }); p.position.set(toX(px), 2.2, toZ(py)); p.rotation.y = Math.atan2(f[0], f[1]); add(p);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, .08), MAT.metal); post.position.set(toX(px), 1.1, toZ(py)); add(post);
  };
  for (const x of BOT_AISLES) plate((x + 1) * T, 76 * T + 4, [0, 1]);
  for (const y of SIDE_AISLES) { plate(22 * T + 12, (y + 1) * T, [-1, 0]); plate(105 * T + 4, (y + 1) * T, [1, 0]); }
  for (const x of TOP_AISLES) plate((x + 1) * T, 19 * T + 12, [0, -1]);

  // goalposts
  for (const side of [-1, 1]) {
    const X = toX(side < 0 ? FIELD.x0 : FIELD.x1), bx = X + side * 1.75, cy = FIELD_Y + CROSS_H;
    const cyl = (r, len, x, y, z, rx, rz) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), MAT.gold); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); m.castShadow = true; add(m); };
    cyl(.11, CROSS_H, bx, FIELD_Y + CROSS_H / 2, 0);
    cyl(.09, Math.abs(bx - X), (bx + X) / 2, cy, 0, 0, Math.PI / 2);
    cyl(.08, POST_HALF * 2, X, cy, 0, Math.PI / 2);
    for (const zz of [-POST_HALF, POST_HALF]) {
      cyl(POST_R, UPRIGHT_H, X, cy + UPRIGHT_H / 2, zz);
      const rib = new THREE.Mesh(new THREE.PlaneGeometry(.12, .9), new THREE.MeshBasicMaterial({ color: 0xff7a2a, side: THREE.DoubleSide })); rib.position.set(X, cy + UPRIGHT_H - .4, zz); add(rib);
    }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, 1.8, 14), MAT.navy); pad.position.set(bx, FIELD_Y + .9, 0); pad.castShadow = true; add(pad);
  }
  // sideline benches
  const benches = [];
  for (let i = 0; i < 4; i++) benches.push({ x: toX(FIELD.gl0 + 30 * FIELD.yd + i * 60 + 23), y: FIELD_Y, z: toZ(FIELD.y1 + 16), sx: 5.6, sy: .48, sz: 1.0, color: 0x2c4486 });
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .6 }), benches, { cast: true }));

  // light towers
  const poolPts = [[820, 670], [1228, 670], [820, 866], [1228, 866]];
  TOWERS.forEach(([tx, ty], i) => {
    const on = world.towersOn.includes(i), x = toX(tx * T + 16), z = toZ(ty * T + 16);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.45, .7, 32, 10), MAT.metal); pole.position.set(x, 16.6, z); pole.castShadow = true; add(pole);
    const bank = new THREE.Group(); bank.position.set(x, 33, z); bank.lookAt(toX(poolPts[i][0]), FIELD_Y, toZ(poolPts[i][1]));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(7, 4, .5), new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: .5 })); bank.add(frame);
    for (let a = 0; a < 5; a++) for (let b = 0; b < 3; b++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, .2), on ? new THREE.MeshBasicMaterial({ color: 0xf4f7ff }) : MAT.glowOff); lamp.position.set(-2.6 + a * 1.3, -1.2 + b * 1.2, .3); bank.add(lamp); }
    add(bank);
    if (on) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.glow, color: 0xdfe8ff, transparent: true, opacity: .55, depthWrite: false })); gl.scale.set(22, 16, 1); gl.position.set(x, 33, z); add(gl); }
    const s = towerSpots[i]; s.position.set(x, 33, z); s.target.position.set(toX(poolPts[i][0]), FIELD_Y, toZ(poolPts[i][1])); s.intensity = on ? 2.6 : 0;
  });

  // scoreboard
  scoreCanvas = document.createElement("canvas"); scoreCanvas.width = 1024; scoreCanvas.height = 440;
  scoreTex = new THREE.CanvasTexture(scoreCanvas); scoreTex.encoding = THREE.sRGBEncoding; nightDisposables.push(scoreTex);
  drawScoreboardTex(0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(26, 11.2), new THREE.MeshBasicMaterial({ map: scoreTex, fog: false }));
  board.position.set(toX(120 * T) - .3, 14, 0); board.rotation.y = -Math.PI / 2; add(board);
  add(instanced(unitBox(), MAT.wall, [{ x: toX(122.5 * T), y: 0, z: -9, sx: 2.5, sy: 8.4, sz: 2.5 }, { x: toX(122.5 * T), y: 0, z: 9, sx: 2.5, sy: 8.4, sz: 2.5 }, { x: toX(121 * T), y: 8.3, z: 0, sx: 1.2, sy: 11.6, sz: 27.4 }], { cast: true }));

  // plaza props
  const carCols = [0x3b4250, 0x6a2b2b, 0x2b3c6a, 0x4a4a3a, 0x6b6f78];
  const bodies = [], cabins = [];
  for (const [tx, ty, kk] of world.cars) { const x = toX(tx * T + 8), z = toZ((ty + 1) * T); bodies.push({ x, y: .25, z, sx: 1.8, sy: .75, sz: 4.1, color: carCols[kk] }); cabins.push({ x, y: .95, z: z + .2, sx: 1.55, sy: .55, sz: 2.1, color: 0x0d1016 }); }
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .25, metalness: .55 }), bodies, { cast: true }));
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .1, metalness: .8 }), cabins, { cast: true }));
  const trunks = [], crowns = [];
  const TR = rng(world.seed + 3);
  for (const [tx, ty, s] of world.trees) {
    const x = toX(tx * T + 8), z = toZ(ty * T + 8);
    trunks.push({ x, y: 0, z, sx: .35, sy: 3 * s, sz: .35, color: 0x3a2d22 });
    for (let b = 0; b < 4; b++) { const r = (1.3 + TR() * .9) * s; crowns.push({ x: x + (TR() - .5) * 2 * s, y: (2.6 + TR() * 1.8) * s + .8, z: z + (TR() - .5) * 2 * s, sx: r, sy: r * .85, sz: r, ry: TR() * 6, color: b % 2 ? 0x1d3322 : 0x24402a }); }
  }
  add(instanced(unitBox(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 }), trunks, { cast: true }));
  add(instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, flatShading: true }), crowns, { cast: true }));
  const poles = [], heads = [], headsOff = [];
  for (const lp of world.lamps) { const x = toX(lp[0] * T + 8), z = toZ(lp[1] * T + 8); poles.push({ x, y: 0, z, sx: .16, sy: 5.4, sz: .16 }); (lp.on ? heads : headsOff).push({ x, y: 5.3, z, sx: 1.1, sy: .18, sz: .4 }); }
  add(instanced(unitBox(), MAT.metal, poles, { cast: true }));
  if (heads.length) add(instanced(unitBox(), MAT.glow, heads));
  if (headsOff.length) add(instanced(unitBox(), MAT.glowOff, headsOff));
  // wolf statue
  const st = new THREE.Group(); st.position.set(0, 0, toZ(4 * T));
  const ped = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 3.6), MAT.wall); ped.position.y = .7; st.add(ped);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6e7684, metalness: .8, roughness: .35 });
  const wb = new THREE.Mesh(new THREE.BoxGeometry(2.4, .9, .8), bronze); wb.position.set(0, 2.2, 0); st.add(wb);
  const wh = new THREE.Mesh(new THREE.BoxGeometry(.8, .7, .6), bronze); wh.position.set(1.3, 2.9, 0); wh.rotation.z = .5; st.add(wh);
  for (const zz of [-.18, .18]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(.12, .35, 4), bronze); ear.position.set(1.4, 3.4, zz); st.add(ear); }
  for (const [lx, lz] of [[-.9, -.25], [-.9, .25], [.9, -.25], [.9, .25]]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(.22, .8, .22), bronze); lg.position.set(lx, 1.75, lz); st.add(lg); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.9, .18, .18), bronze); tail.position.set(-1.5, 2.6, 0); tail.rotation.z = -.7; st.add(tail);
  st.traverse((o) => { if (o.isMesh) o.castShadow = true; }); add(st);

  // light fixtures
  lightCands = [];
  const fixtures = [];
  for (const l of world.lights) {
    if (l.kind === "exit" || l.kind === "tower" || l.r < 40) continue;
    const base = groundAt(l.x, l.y);
    const hgt = l.r === 120 ? 5.1 : l.r === 150 ? 12 : l.r === 70 ? 3.6 : 2.95;
    lightCands.push({ x: toX(l.x), y: base + hgt, z: toZ(l.y), col: new THREE.Color(`rgb(${l.col.join(",")})`), s: l.s, r: l.r });
    if (l.r === 96 || (l.r !== 120 && l.r !== 150 && l.r !== 70)) fixtures.push({ x: toX(l.x), y: base + 3.0, z: toZ(l.y), sx: .5, sy: .1, sz: 1.3 });
  }
  if (fixtures.length) add(instanced(unitBox(), MAT.glow, fixtures));

  // doors
  for (const d of doors) buildDoor(d);
}

function drawScoreboardTex(home) {
  const c = scoreCanvas.getContext("2d"), w = 1024, h = 440;
  c.fillStyle = "#04070f"; c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#0d1d4a"); g.addColorStop(1, "#060b1c"); c.fillStyle = g; c.fillRect(12, 12, w - 24, h - 24);
  c.strokeStyle = "#2c4486"; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
  c.textAlign = "center"; c.textBaseline = "middle";
  c.font = "54px Graduate, Georgia, serif"; c.fillStyle = "#eef1f7"; c.fillText("NORTHRIDGE COLLEGE", w / 2, 70);
  c.font = "150px Graduate, Georgia, serif"; c.lineWidth = 10; c.strokeStyle = "#eef1f7"; c.strokeText("NC", w / 2, 210); c.fillStyle = "#24397a"; c.fillText("NC", w / 2, 210);
  c.font = "40px 'Share Tech Mono', monospace";
  c.fillStyle = home ? "#e6c34a" : "#9fb0d8"; c.fillText(`WOLVES  ${home}`, w * .27, 360); c.fillStyle = "#9fb0d8"; c.fillText("GUESTS  0", w * .73, 360);
  if (home) { c.font = "46px Graduate, Georgia, serif"; c.fillStyle = "#e6c34a"; c.fillText("FIELD GOAL!", w / 2, 360); }
  if (scoreTex) scoreTex.needsUpdate = true;
}

function buildDoor(d) {
  const tiles = d.tiles, xs = tiles.map((t) => t[0]), ys = tiles.map((t) => t[1]);
  const cxp = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * T, cyp = (Math.min(...ys) + Math.max(...ys) + 1) / 2 * T;
  let alongX;
  if (tiles.length > 1) alongX = ys[0] === ys[ys.length - 1];
  else { const i = ys[0] * W + xs[0], wl = (c) => "#FDSR".includes(c); alongX = wl(G[i - 1]) || wl(G[i + 1]); }
  const len = tiles.length * 2, base = groundAt(cxp, cyp);
  const roll = d.kind === "gate" || d.kind === "shutter" || d.fieldGate || d.tunnel || tiles.length > 1;
  const hgt = d.fieldGate ? 1.25 : d.kind === "door" || d.kind === "card" ? (d.tunnel ? 3 : 2.5) : 3.2;
  const mat = d.kind === "shutter" || d.kind === "gate" || d.fieldGate ? MAT.grille.clone() : d.kind === "card" || d.tunnel ? MAT.cardDoor : MAT.door;
  if (mat.map) { mat.map = mat.map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(len / 1.2, hgt / 1.2); nightDisposables.push(mat.map); }
  const geo = new THREE.BoxGeometry(alongX ? len - .04 : .1, hgt, alongX ? .1 : len - .04);
  const grp = new THREE.Group(); grp.position.set(toX(cxp), base, toZ(cyp));
  const panel = new THREE.Mesh(geo, mat); panel.castShadow = true;
  if (roll) { panel.position.y = hgt / 2; grp.add(panel); }
  else {
    const hinge = new THREE.Group();
    if (alongX) { geo.translate(len / 2 - .02, 0, 0); hinge.position.set(-len / 2, hgt / 2, 0); }
    else { geo.translate(0, 0, len / 2 - .02); hinge.position.set(0, hgt / 2, -len / 2); }
    hinge.add(panel); grp.add(hinge); d.hinge = hinge;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(alongX ? .2 : .14, .05, alongX ? .14 : .2), MAT.metal); handle.position.set(alongX ? len - .4 : 0, -.15, alongX ? 0 : len - .4); hinge.add(handle);
  }
  if (d.kind === "card" || d.tunnel) {
    const off = alongX ? [len / 2 + .25, 0] : [0, len / 2 + .25];
    const reader = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .22), new THREE.MeshStandardMaterial({ color: 0x15181f })); reader.position.set(off[0], Math.min(1.2, hgt - .2), off[1]); grp.add(reader);
    d.led = new THREE.Mesh(new THREE.BoxGeometry(.24, .07, .24), new THREE.MeshBasicMaterial({ color: 0xff3b4e })); d.led.position.set(off[0], Math.min(1.2, hgt - .2) + .1, off[1]); grp.add(d.led);
  }
  const x = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.X, depthTest: true })); x.scale.set(.9, .9, 1); x.position.set(0, hgt + .5, 0); x.visible = false; grp.add(x); d.xMark = x;
  d.mesh = grp; d.panel = panel; d.roll = roll; d.hgt = hgt; d.anim = d.open ? 1 : 0;
  worldGroup.add(grp);
}

/* ---------- actors (guards, cameras, items) ---------- */
function makeFan(color, opacity) {
  const n = 16, rings = 3, verts = 1 + (n + 1) * rings;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + i + 1);
  for (let r = 1; r < rings; r++) for (let i = 0; i < n; i++) { const a = 1 + (r - 1) * (n + 1) + i, b = a + 1, c = 1 + r * (n + 1) + i, dd = c + 1; idx.push(a, c, b, b, c, dd); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.frustumCulled = false; m.renderOrder = 2;
  return m;
}
function updateFan(m, poly) {
  if (!poly) { m.visible = false; return; }
  m.visible = true;
  const p = m.geometry.attributes.position, n = 16, rings = 3, cx = poly[0], cy = poly[1];
  p.setXYZ(0, toX(cx), groundAt(cx, cy) + .07, toZ(cy));
  for (let i = 0; i <= n; i++) {
    const rx = poly[2 + i * 2], ry = poly[3 + i * 2];
    for (let r = 1; r <= rings; r++) { const t = r / rings, x = cx + (rx - cx) * t, y = cy + (ry - cy) * t; p.setXYZ(1 + (r - 1) * (n + 1) + i, toX(x), groundAt(x, y) + .07, toZ(y)); }
  }
  p.needsUpdate = true;
}
function buildActors() {
  disposeGroup(actorGroup);
  actorGroup = new THREE.Group(); scene.add(actorGroup);
  for (const g of guards) {
    g.mesh = makeHuman({ body: 0x2b3756, legs: 0x141a29, head: 0x8a7562, cap: 0x10162a });
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, .25, 8), MAT.metal); fl.rotation.x = Math.PI / 2; fl.position.set(.31, 1.0, .25); g.mesh.add(fl);
    const beam = new THREE.Mesh((() => { const c = new THREE.ConeGeometry(2.6, 9, 20, 1, true); c.translate(0, -4.5, 0); c.rotateX(-Math.PI / 2); return c; })(), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: .045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.set(.31, 1.0, .35); beam.rotation.x = .16; g.mesh.add(beam); g.beam = beam;
    g.markSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex["?"], depthTest: false })); g.markSpr.scale.set(.9, .9, 1); g.markSpr.position.y = 2.5; g.markSpr.renderOrder = 9; g.mesh.add(g.markSpr);
    g.fan = makeFan(0xffd890, .1);
    actorGroup.add(g.mesh, g.fan);
  }
  for (const c of cameras) {
    const grp = new THREE.Group(), base = groundAt(c.x, c.y);
    grp.position.set(toX(c.x), base, toZ(c.y));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 3.2, 8), MAT.metal); pole.position.y = 1.6; grp.add(pole);
    const head = new THREE.Group(); head.position.y = 3.2; grp.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.24, .22, .5), new THREE.MeshStandardMaterial({ color: 0xc8ced9, roughness: .4 })); body.position.z = .18; body.rotation.x = .35; head.add(body);
    c.led = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b4e })); c.led.position.set(0, .14, .25); head.add(c.led);
    c.head = head; c.mesh = grp; c.fan = makeFan(0xff2a3c, .2);
    actorGroup.add(grp, c.fan);
  }
  for (const it of items) makeItemMesh(it);
  for (const b of world.boxes) {
    const grp = new THREE.Group(); grp.position.set(toX(b.x), groundAt(b.x, b.y), toZ(b.y));
    const box = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.5, .35), new THREE.MeshStandardMaterial({ color: 0x5d6472, metalness: .5, roughness: .4 })); box.position.y = .75; box.castShadow = true; grp.add(box);
    b.strip = new THREE.Mesh(new THREE.BoxGeometry(.6, .12, .37), new THREE.MeshBasicMaterial({ color: 0xe6c34a })); b.strip.position.y = 1.25; grp.add(b.strip);
    actorGroup.add(grp);
  }
  const k = world.kick;
  kickMarker = new THREE.Group(); kickMarker.position.set(toX(k.x), FIELD_Y + .02, toZ(k.y));
  const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .9, 40), new THREE.MeshBasicMaterial({ color: 0xe6c34a, transparent: true, opacity: .85, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; kickMarker.add(ring);
  const tee = new THREE.Mesh(new THREE.ConeGeometry(.08, .12, 10), new THREE.MeshStandardMaterial({ color: 0xff7a2a })); tee.position.y = .06; kickMarker.add(tee);
  kickMarker.userData.ring = ring;
  actorGroup.add(kickMarker);
}
function makeItemMesh(it) {
  const grp = new THREE.Group();
  if (it.type === "card") {
    const card = new THREE.Mesh(new THREE.BoxGeometry(.42, .02, .27), new THREE.MeshStandardMaterial({ color: 0xeef1f7, emissive: 0x2c4486, emissiveIntensity: .8 }));
    grp.add(card);
  } else if (it.type === "bag") {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(.35, 14, 10), MAT.navy); bag.scale.set(1.3, .7, 1); grp.add(bag);
    for (let i = 0; i < 3; i++) { const f = makeFootball(); f.position.set(-.22 + i * .22, .25, 0); f.rotation.set(.4, i, .2); grp.add(f); }
  } else grp.add(makeFootball());
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex.glow, color: it.type === "card" ? 0x6ea0ff : 0xe6c34a, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(2.2, 2.2, 1); grp.add(glow);
  grp.position.set(toX(it.x), groundAt(it.x, it.y), toZ(it.y));
  it.mesh = grp; actorGroup.add(grp);
}
function spawnConfetti(x, y, z) {
  const p = confetti.geometry.attributes.position, v = confetti.userData.v;
  for (let i = 0; i < p.count; i++) { p.setXYZ(i, x + (Math.random() - .5) * 2, y + Math.random() * 2, z + (Math.random() - .5) * 5); v.set([(Math.random() - .5) * 8, 4 + Math.random() * 9, (Math.random() - .5) * 10], i * 3); }
  p.needsUpdate = true; confetti.visible = true; confetti.userData.life = 6;
}

/* ---------- camera, lights, per-frame sync ---------- */
function resize() {
  vw = innerWidth; vh = innerHeight;
  if (!renderer) return;
  renderer.setSize(vw, vh, false);
  cam3.aspect = vw / vh; cam3.fov = vw < vh ? 68 : 55; cam3.updateProjectionMatrix();
}
addEventListener("resize", resize);

function updateCam3(dt) {
  const k = 1 - Math.exp(-dt * 7);
  let tgt, pos;
  if (mode === "menu" || mode === "brief") {
    menuT += dt;
    const a = menuT * .045 + .6;
    tgt = new THREE.Vector3(0, FIELD_Y + 2, 0);
    pos = new THREE.Vector3(Math.cos(a) * 92, 34, Math.sin(a) * 70);
  } else if (kick && kick.phase !== "flight" && mode === "play") {
    const sx = toX(world.kick.x), sz = toZ(world.kick.y), dx = Math.cos(kick.base), dz = Math.sin(kick.base);
    tgt = new THREE.Vector3(sx + dx * 18, FIELD_Y + 3.2, sz + dz * 18);
    pos = new THREE.Vector3(sx - dx * 6 + dz * 1.6, FIELD_Y + 2.3, sz - dz * 6 - dx * 1.6);
  } else if ((kick && kick.ball) && (mode === "play" || mode === "kickgood")) {
    const b = kick.ball, g = goalInfo();
    if (mode === "kickgood" && celebrateT > 1.2) {
      const a = celebrateT * .35;
      tgt = new THREE.Vector3(g.X, FIELD_Y + 5, 0);
      pos = new THREE.Vector3(g.X - g.side * (14 + Math.cos(a) * 4), FIELD_Y + 6 + Math.sin(a) * 2, Math.sin(a) * 12);
    } else {
      tgt = new THREE.Vector3(b.x, b.y, b.z);
      pos = new THREE.Vector3(b.x - g.side * 7, Math.max(FIELD_Y + 2, b.y + 2.5), b.z + 3);
    }
  } else {
    tgt = new THREE.Vector3(toX(player.x), player.h + 1.5, toZ(player.y));
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    pos = new THREE.Vector3(tgt.x - Math.cos(camYaw) * camDist * cp, tgt.y + camDist * sp, tgt.z - Math.sin(camYaw) * camDist * cp);
  }
  if (camTarget.lengthSq() === 0 || mode === "menu") { camTarget.copy(tgt); camPos.copy(pos); }
  else { camTarget.lerp(tgt, k); camPos.lerp(pos, k); }
  cam3.position.copy(camPos); cam3.lookAt(camTarget);
}
function snapCam() { camTarget.set(0, 0, 0); updateCam3(1); }

function render3D(now, dt) {
  updateCam3(dt);
  // facade only when the player is outside (so it never blocks the view inside)
  const inside = player && sectionAt(player.x, player.y) !== 0;
  if (facadeGroup) facadeGroup.visible = mode === "menu" || mode === "brief" || !inside;
  // moon shadow follows the action
  moon.position.set(camTarget.x - 30, camTarget.y + 70, camTarget.z - 40); moon.target.position.copy(camTarget);
  // pick nearest practical lights
  lightPick -= dt;
  if (lightPick <= 0 && lightCands.length) {
    lightPick = .2;
    const sorted = lightCands.map((l) => [l, (l.x - camTarget.x) ** 2 + (l.z - camTarget.z) ** 2]).sort((a, b) => a[1] - b[1]);
    ptPool.forEach((pl, i) => { const e = sorted[i]; if (e && e[1] < 70 * 70) { const l = e[0]; pl.position.set(l.x, l.y, l.z); pl.color.copy(l.col); pl.intensity = 1.5 * l.s; pl.distance = l.r / 8 * 1.8; } else pl.intensity = 0; });
  }
  // player
  const show = player && !player.hidden;
  playerMesh.visible = show; playerMarker.visible = show && mode === "play" && !kick;
  if (show) {
    playerMesh.position.set(toX(player.x), player.h, toZ(player.y));
    playerMesh.rotation.y = Math.PI / 2 - player.dir;
    if (kick) { // kicker lines up a step behind and to the left of the ball
      const dx = Math.cos(kick.base), dz = Math.sin(kick.base), back = kick.phase === "flight" ? .2 : 1.3;
      playerMesh.position.set(toX(world.kick.x) - dx * back - dz * .7, FIELD_Y, toZ(world.kick.y) - dz * back + dx * .7);
    }
    const amp = player.moving ? (player.mode === "sprint" ? .75 : player.mode === "sneak" ? .3 : .5) : 0;
    animHuman(playerMesh, now * (player.mode === "sprint" ? 13 : 8.5), amp, player.kickAnim);
    playerMesh.scale.y = player.mode === "sneak" ? .82 : 1;
    playerMarker.position.set(toX(player.x), player.h + 2.4, toZ(player.y));
  }
  // guards + flashlights
  const gd = guards.map((g) => [g, dist(g.x, g.y, player.x, player.y)]).sort((a, b) => a[1] - b[1]);
  flashPool.forEach((s) => (s.intensity = 0));
  gd.forEach(([g], i) => {
    if (!g.mesh) return;
    const h = groundAt(g.x, g.y);
    g.mesh.position.set(toX(g.x), h, toZ(g.y)); g.mesh.rotation.y = Math.PI / 2 - g.dir;
    const moving = g.state !== "suspicious" && g.state !== "search" && g.wait <= 0;
    animHuman(g.mesh, g.bob * 1.4, moving ? .5 : 0, 0);
    const showMark = g.state === "chase" || g.state === "suspicious" || g.state === "investigate" || g.state === "search" || g.mark > 0;
    g.markSpr.visible = showMark;
    if (showMark) { const want = g.state === "chase" ? markTex["!"] : markTex["?"]; if (g.markSpr.material.map !== want) { g.markSpr.material.map = want; g.markSpr.material.needsUpdate = true; } }
    g.beam.material.color.setHex(g.state === "chase" || g.aware > .6 ? 0xff7050 : 0xffe2a8);
    updateFan(g.fan, g.poly); g.fan.material.color.setHex(g.state === "chase" || g.aware > .6 ? 0xff5a3c : 0xffd890);
    if (i < flashPool.length) {
      const s = flashPool[i], dx = Math.cos(g.dir), dz = Math.sin(g.dir);
      s.position.set(toX(g.x) + dx * .4, h + 1.15, toZ(g.y) + dz * .4);
      s.target.position.set(toX(g.x) + dx * 8, h - .5, toZ(g.y) + dz * 8);
      s.intensity = 2.4; s.color.setHex(g.state === "chase" ? 0xffb090 : 0xffe2a8);
    }
  });
  // cameras
  for (const c of cameras) {
    if (!c.head) continue;
    c.head.rotation.y = Math.PI / 2 - c.dir;
    updateFan(c.fan, camsOff > 0 ? null : c.poly);
    c.fan.material.opacity = .16 + c.aware * .3;
    c.led.material.color.setHex(camsOff > 0 ? 0x30333a : (Math.floor(now * 2 + c.x) % 2 === 0 || c.aware > .3) ? 0xff3b4e : 0x5a1a22);
  }
  // doors
  for (const d of doors) {
    if (!d.mesh) continue;
    const tgt = d.open ? 1 : 0;
    d.anim += clamp(tgt - d.anim, -dt * 2.5, dt * 2.5);
    if (d.roll) d.panel.position.y = d.hgt / 2 + d.anim * (d.hgt - .25);
    else d.hinge.rotation.y = -d.anim * 1.65;
    if (d.led) d.led.material.color.setHex(d.open || (player && player.card) ? 0x5fd38a : (Math.floor(now * 2) % 2 ? 0xff3b4e : 0x7a1c26));
    d.xMark.visible = d.known && !d.open && d.kind !== "card" && mode === "play";
  }
  // items
  for (const it of items) {
    if (!it.mesh && !it.got) makeItemMesh(it);
    if (!it.mesh) continue;
    it.mesh.visible = !it.got;
    const base = groundAt(it.x, it.y);
    it.mesh.position.y = base + (it.type === "card" ? .9 + Math.sin(now * 2) * .1 : it.type === "bag" ? .25 : .14);
    if (it.type === "card") it.mesh.rotation.y = now * 1.5;
  }
  for (const b of world.boxes) if (b.strip) b.strip.material.color.setHex(b.used ? 0x2a2e37 : 0xe6c34a);
  if (kickMarker) { kickMarker.userData.ring.material.opacity = .55 + Math.sin(now * 3) * .3; }
  // ball
  const showBall = kick && (kick.ball || kick.phase !== "flight");
  ballMesh.visible = !!showBall;
  if (kick && kick.ball) { const b = kick.ball; ballMesh.position.set(b.x, b.y, b.z); ballMesh.rotation.set(0, kick.base, b.spin); }
  else if (kick) { ballMesh.position.set(toX(world.kick.x), FIELD_Y + .26, toZ(world.kick.y)); ballMesh.rotation.set(0, kick.base, Math.PI / 2.6); }
  // confetti
  if (confetti.visible) {
    const p = confetti.geometry.attributes.position, v = confetti.userData.v;
    for (let i = 0; i < p.count; i++) { v[i * 3 + 1] -= 6 * dt; v[i * 3] *= .99; v[i * 3 + 2] *= .99; p.setXYZ(i, p.getX(i) + v[i * 3] * dt, Math.max(FIELD_Y + .05, p.getY(i) + v[i * 3 + 1] * dt), p.getZ(i) + v[i * 3 + 2] * dt); }
    p.needsUpdate = true; confetti.userData.life -= dt; if (confetti.userData.life <= 0) confetti.visible = false;
  }
  // rain around the camera target
  const rain = scene.getObjectByName("rain");
  rain.visible = !reduceMotion;
  if (rain.visible) {
    for (let i = 0; i < 1800; i++) {
      const o = i * 6; let y = rainPos[o + 1] - 24 * dt;
      if (y < -12) y += 30;
      rainPos[o + 1] = y; rainPos[o + 4] = y - .7;
    }
    rain.position.set(camTarget.x, camTarget.y - 2, camTarget.z);
    rainGeo.attributes.position.needsUpdate = true;
  }
  renderer.render(scene, cam3);
}
