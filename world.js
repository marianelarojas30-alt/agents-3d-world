/* Agents World — a live, cute 3D visualization of a whole "company" of
   robot-workers (Ruflo agents/tasks), each at their own desk, doing visibly
   different, literal work. Vanilla three.js, no build step. */

const POLL_MS = 2500;

const STATUS_COLOR = {
  pending: 0xd9a441,
  queued: 0xd9a441,
  running: 0xc96b4f,
  in_progress: 0xc96b4f,
  active: 0xc96b4f,
  completed: 0x7a9b5e,
  done: 0x7a9b5e,
  failed: 0xa8445a,
  error: 0xa8445a,
  idle: 0x5b7a8c,
};
const STATUS_ICON = {
  pending: "⏳", queued: "⏳", running: "⌨️", in_progress: "⌨️", active: "⌨️",
  completed: "✅", done: "✅", failed: "❌", error: "❌", idle: "💤",
};
function statusColor(s) { return STATUS_COLOR[s] || 0x845ef7; }
function statusIcon(s) { return STATUS_ICON[s] || "🐣"; }

const WORKER_ICON = {
  map: "🗺️", audit: "🛡️", optimize: "⚡", consolidate: "🧩", testgaps: "🧪",
};
const AGENT_BADGE = {
  coder: "🔧", "backend-dev": "🔧", "frontend-dev": "🎨", coordinator: "🧭",
  researcher: "🔍", reviewer: "🧐", tester: "🧪", architect: "📐",
  analyst: "📊", planner: "🗺️", security: "🛡️", documenter: "📝",
  optimizer: "⚡", default: "💻",
};

// the exact characters from the reference art — body color + cropped real face
const ROBOT_VARIANTS = [
  { color: 0x8f8397, face: "/assets/faces/purple_editor.png" },
  { color: 0x6f8a52, face: "/assets/faces/moss_laptop.png" },
  { color: 0xc08a4e, face: "/assets/faces/copper_writer.png" },
  { color: 0xd4c9ad, face: "/assets/faces/cream_box.png" },
  { color: 0x3a565c, face: "/assets/faces/blue_small.png" },
  { color: 0xa89a6e, face: "/assets/faces/moss_small.png" },
  { color: 0xc2ac86, face: "/assets/faces/cream_small.png" },
];
const _faceTextureCache = new Map();
const _textureLoader = new THREE.TextureLoader();
function getFaceTexture(url) {
  if (!_faceTextureCache.has(url)) _faceTextureCache.set(url, _textureLoader.load(url));
  return _faceTextureCache.get(url);
}
function variantIndexFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % ROBOT_VARIANTS.length;
}

// ---------- scene setup: a cozy warm-wood workshop, golden lamp light ----------
const SKY_TOP = 0x3a2c22;
const SKY_HORIZON = 0xd98f4e;
const FOG_COLOR = 0x8a6144;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 22, 50);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 9.5, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("canvas-holder").appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 36;
controls.maxPolarAngle = Math.PI * 0.465;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

// soft daylight sky dome (replaces flat color / night stars)
{
  const c = document.createElement("canvas");
  c.width = 4; c.height = 512;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#" + SKY_TOP.toString(16).padStart(6, "0"));
  grad.addColorStop(0.55, "#b5623a");
  grad.addColorStop(1, "#" + SKY_HORIZON.toString(16).padStart(6, "0"));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 512);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
    ctx.fillRect(Math.random() * 4, Math.random() * 512, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 32),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
}

scene.add(new THREE.HemisphereLight(0xffdca8, 0x4a3420, 0.9));
const sun = new THREE.DirectionalLight(0xffcf8f, 1.15);
sun.position.set(9, 14, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0015;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xff9d5c, 0.3);
fill.position.set(-10, 6, -8);
scene.add(fill);

// warm wood-plank workshop floor — no grid lines, no islands
{
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a6238";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const shade = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade < 128 ? 40 : 200},${shade < 128 ? 20 : 140},${Math.random() * 0.07})`;
    const s = 2 + Math.random() * 3;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.75 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // soft warm vignette ring toward the edges, like a lamp-lit room fading to shadow
  const under = new THREE.Mesh(
    new THREE.RingGeometry(9.5, 15.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9, transparent: true, opacity: 0.35 })
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.005;
  scene.add(under);
}

// warm floating dust-mote sparkle, lit like it's drifting through lamp light
{
  const N = 90;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = Math.random() * 6 + 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
  }
  const motesGeo = new THREE.BufferGeometry();
  motesGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(
    motesGeo,
    new THREE.PointsMaterial({ color: 0xffcf8a, size: 0.06, transparent: true, opacity: 0.6 })
  );
  scene.add(motes);
}

// warm string-lights arc — the cozy overhead touch from the reference photo
function makeStringLights(radius, count) {
  const g = new THREE.Group();
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2018 });
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 1.4 + Math.sin(a) * 1.1, 0));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
  for (const p of pts) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe2a0 })
    );
    bulb.position.copy(p);
    bulb.position.y -= 0.03;
    g.add(bulb);
  }
  return g;
}

// a modern pendant lamp — used above the hub and every department
function makePendantLamp() {
  const g = new THREE.Group();
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a })
  );
  cord.position.y = 1.1;
  g.add(cord);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.32, 0.22, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.5, side: THREE.DoubleSide })
  );
  shade.position.y = 0;
  g.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf })
  );
  bulb.position.y = -0.05;
  g.add(bulb);
  const glow = new THREE.PointLight(0xffe9b8, 0.5, 4, 2);
  glow.position.y = -0.05;
  g.add(glow);
  return g;
}

// a simple potted plant — office greenery
function makePlant(scale = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xb5754a, roughness: 0.8 })
  );
  pot.position.y = 0.11;
  pot.castShadow = true;
  g.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4d9a5b, roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), leafMat);
    const ang = (i / 5) * Math.PI * 2;
    leaf.position.set(Math.cos(ang) * 0.08, 0.34 + Math.random() * 0.12, Math.sin(ang) * 0.08);
    leaf.scale.set(0.7, 1.3, 0.7);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

const worldRoot = new THREE.Group();
scene.add(worldRoot);

// ---------- text sprite helper ----------
function makeLabel(text, { size = 32, color = "#ffffff", weight = "600", pad = 10, bg = true } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + pad * 2;
  canvas.height = size + pad * 2;
  ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  if (bg) {
    ctx.fillStyle = "rgba(10,14,35,0.62)";
    roundRect(ctx, 0, 0, canvas.width, canvas.height, 14);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.fillText(text, pad, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.014;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- department rug (flat, no platform — kills the "city" look) ----------
function makeRug(radius, colorHex) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, colorHex);
  grad.addColorStop(0.72, colorHex);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 40),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  return mesh;
}
function toHex(n) { return "#" + n.toString(16).padStart(6, "0"); }

// ---------- robot-worker factory (hands, feet, all a little different) ----------
function makeLimb(length, thickness, endRadius, color, endColor) {
  const pivot = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(thickness, thickness * 0.85, length, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
  );
  cyl.position.y = -length / 2;
  cyl.castShadow = true;
  pivot.add(cyl);
  const end = new THREE.Mesh(
    new THREE.SphereGeometry(endRadius, 10, 10),
    new THREE.MeshStandardMaterial({ color: endColor, roughness: 0.5 })
  );
  end.position.y = -length;
  pivot.add(end);
  return pivot;
}

// a subtle painted/worn-metal grain, so bodies don't read as flat plastic
function makeGrainTexture(hex) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#" + hex.toString(16).padStart(6, "0");
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 500; i++) {
    const shade = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 1.4, 1.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeWorker(statusColor, { scale = 1, badge = "💻", variantIndex = 0 } = {}) {
  const g = new THREE.Group();
  const variant = ROBOT_VARIANTS[variantIndex % ROBOT_VARIANTS.length];
  const color = variant.color;
  // every worker gets a slightly different finish — matte, satin, or metallic —
  // so a room full of them still reads as "all different", like a real workshop
  const metalness = 0.05 + Math.random() * 0.45;
  const roughness = 0.75 - metalness * 0.5 + Math.random() * 0.1;
  const mainMat = new THREE.MeshStandardMaterial({
    color, roughness, metalness, map: makeGrainTexture(color),
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.28), mainMat);
  torso.position.y = -0.04;
  torso.castShadow = true;
  g.add(torso);

  // big bobble-head — the round glowing-eye face is the focal point
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 22, 18), mainMat);
  head.position.y = 0.38;
  head.castShadow = true;
  g.add(head);

  // the exact face from the reference art, on a round visor
  const visor = new THREE.Mesh(
    new THREE.CircleGeometry(0.19, 28),
    new THREE.MeshBasicMaterial({ map: getFaceTexture(variant.face), transparent: true })
  );
  visor.position.set(0, 0.4, 0.29);
  g.add(visor);
  const eyeLight = new THREE.PointLight(0xd8f6ff, 0.3, 1.2, 2);
  eyeLight.position.set(0, 0.4, 0.4);
  g.add(eyeLight);

  // little antenna — tip glows the worker's live status color
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6),
    new THREE.MeshStandardMaterial({ color: 0x9aa0c0 })
  );
  antenna.position.set(0, 0.68, 0);
  g.add(antenna);
  const antennaMat = new THREE.MeshStandardMaterial({ color: statusColor, emissive: statusColor, emissiveIntensity: 0.6 });
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), antennaMat);
  antennaTip.position.set(0, 0.76, 0);
  g.add(antennaTip);

  // arms (hands at the end)
  const armL = makeLimb(0.28, 0.055, 0.08, color, 0xf1f3f8);
  armL.position.set(-0.25, 0.09, 0);
  g.add(armL);
  const armR = makeLimb(0.28, 0.055, 0.08, color, 0xf1f3f8);
  armR.position.set(0.25, 0.09, 0);
  g.add(armR);

  // legs (feet at the end)
  const legL = makeLimb(0.28, 0.07, 0.095, 0x333a5c, 0x2a3050);
  legL.position.set(-0.12, -0.22, 0);
  g.add(legL);
  const legR = makeLimb(0.28, 0.07, 0.095, 0x333a5c, 0x2a3050);
  legR.position.set(0.12, -0.22, 0);
  g.add(legR);

  // role badge, floating above the antenna
  const badgeSprite = makeLabel(badge, { size: 30, pad: 6, bg: true });
  badgeSprite.position.set(0, 1.02, 0);
  g.add(badgeSprite);

  g.userData.mainMat = mainMat;
  g.userData.antennaMat = antennaMat;
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.scale.setScalar(scale);
  return g;
}

// ---------- desk + laptop + papers: the literal work being done ----------
function makeDesk(color) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.05, 0.36),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.7 })
  );
  top.position.y = 0.3;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x8a7a5c })
      );
      leg.position.set(sx * 0.24, 0.15, sz * 0.14);
      g.add(leg);
    }
  }
  const laptopBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.02, 0.17),
    new THREE.MeshStandardMaterial({ color: 0x3a3f55 })
  );
  laptopBase.position.set(-0.06, 0.335, 0.02);
  g.add(laptopBase);
  const screenMat = new THREE.MeshBasicMaterial({ color });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.015), screenMat);
  screen.position.set(-0.06, 0.42, -0.065);
  screen.rotation.x = -0.4;
  g.add(screen);
  // paper stack — "con papeles"
  for (let i = 0; i < 3; i++) {
    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.006, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    paper.position.set(0.17, 0.328 + i * 0.008, 0.05);
    paper.rotation.y = (Math.random() - 0.5) * 0.35;
    g.add(paper);
  }
  g.userData.screenMat = screenMat;
  return g;
}

// ---------- confetti ----------
const confettiPool = [];
function burstConfetti(pos, color) {
  const group = new THREE.Group();
  group.position.copy(pos);
  const N = 14;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.08),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    );
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.6 + Math.random() * 1.2;
    p.userData.vel = new THREE.Vector3(Math.cos(ang) * spd, 1.6 + Math.random() * 1.2, Math.sin(ang) * spd);
    p.userData.spin = (Math.random() - 0.5) * 8;
    group.add(p);
    parts.push(p);
  }
  group.userData.parts = parts;
  group.userData.age = 0;
  worldRoot.add(group);
  confettiPool.push(group);
}
function updateConfetti(dt) {
  for (let i = confettiPool.length - 1; i >= 0; i--) {
    const g = confettiPool[i];
    g.userData.age += dt;
    for (const p of g.userData.parts) {
      p.userData.vel.y -= 3.2 * dt;
      p.position.addScaledVector(p.userData.vel, dt);
      p.rotation.z += p.userData.spin * dt;
      p.material.opacity = Math.max(0, 1 - g.userData.age / 1.1);
      p.material.transparent = true;
    }
    if (g.userData.age > 1.1) {
      worldRoot.remove(g);
      confettiPool.splice(i, 1);
    }
  }
}

// ---------- layout persistence ----------
const savedOffsets = JSON.parse(localStorage.getItem("agentWorldOffsets") || "{}");
function saveOffsets() {
  localStorage.setItem("agentWorldOffsets", JSON.stringify(savedOffsets));
}

// ---------- moods: how each status literally behaves ----------
const MOODS = {
  pending: { typing: false, radius: 1.1, speed: 0.75, legSwing: 0.55, bodyBob: 0.06, tilt: 0 },
  queued: { typing: false, radius: 1.1, speed: 0.75, legSwing: 0.55, bodyBob: 0.06, tilt: 0 },
  idle: { typing: false, radius: 1.1, speed: 0.75, legSwing: 0.55, bodyBob: 0.06, tilt: 0 },
  running: { typing: true },
  in_progress: { typing: true },
  active: { typing: true },
  completed: { typing: false, radius: 1.5, speed: 0.95, legSwing: 0.6, bodyBob: 0.07, tilt: 0 },
  done: { typing: false, radius: 1.5, speed: 0.95, legSwing: 0.6, bodyBob: 0.07, tilt: 0 },
  failed: { typing: false, radius: 0.4, speed: 0.3, legSwing: 0.25, bodyBob: 0.02, tilt: -0.35 },
  error: { typing: false, radius: 0.4, speed: 0.3, legSwing: 0.25, bodyBob: 0.02, tilt: -0.35 },
};

// ---------- entity registries ----------
const zones = new Map(); // team name -> {group, rug, radius}
const creatures = new Map(); // id -> {group, mood, ...}
const desks = new Map(); // id -> {group}
const draggable = []; // {id, group}

let hubGroup = null;
let hubMascot = null;
const workerNodes = new Map();

function ensureHub() {
  if (hubGroup) return hubGroup;
  hubGroup = new THREE.Group();
  hubGroup.add(makeRug(2.4, "#d9a441"));

  hubMascot = makeWorker(0xd9a441, { scale: 1.5, badge: "👑", variantIndex: variantIndexFor("hub") });
  hubMascot.position.set(0, 0.72, 0);
  hubGroup.userData.baseY = 0.72;
  hubGroup.add(hubMascot);

  const crown = makeLabel("🏢 Ruflo HQ", { size: 28 });
  crown.position.set(0, 1.7, 0);
  hubGroup.add(crown);

  const lamp = makePendantLamp();
  lamp.position.set(0, 3.2, 0);
  hubGroup.add(lamp);

  const lights = makeStringLights(2.6, 10);
  lights.rotation.y = Math.PI / 4;
  hubGroup.add(lights);

  for (const p of [[-1.7, -0.6], [1.7, -0.7], [-1.2, 1.6], [1.4, 1.4]]) {
    const plant = makePlant(0.9 + Math.random() * 0.3);
    plant.position.set(p[0], 0, p[1]);
    hubGroup.add(plant);
  }

  worldRoot.add(hubGroup);
  spawnPop(hubGroup);
  return hubGroup;
}

function positionOnCircle(index, count, radius) {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function spawnPop(obj) {
  obj.scale.setScalar(0.001);
  obj.userData.spawnT = 0;
}

function upsertWorker(id, { color, scale, labelText, status, badge, parentGroup, deskPos, labelLift = 0, data }) {
  let entry = creatures.get(id);
  const home = deskPos.clone().add(new THREE.Vector3(0, 0, 0.46));

  if (!entry) {
    const group = makeWorker(color, { scale, badge, variantIndex: variantIndexFor(id) });
    const label = makeLabel(labelText, { size: 24 });
    label.position.set(0, 1.15 * scale + labelLift, 0);
    group.add(label);
    parentGroup.add(group);
    spawnPop(group);
    entry = { group, label, labelText, mood: null, lastStatus: null, id };
    creatures.set(id, entry);
    draggable.push(entry);

    const start = savedOffsets[id] ? new THREE.Vector3(savedOffsets[id].x, 0, savedOffsets[id].z) : home;
    group.position.set(start.x, group.position.y, start.z);
    if (savedOffsets[id]) group.userData.savedWorld = savedOffsets[id];
  } else if (entry.group.parent !== parentGroup) {
    parentGroup.add(entry.group);
  }

  entry.data = data;
  entry.group.userData.antennaMat.color.set(color);
  entry.group.userData.antennaMat.emissive.set(color);
  entry.group.userData.home = entry.group.userData.savedWorld
    ? new THREE.Vector3(entry.group.userData.savedWorld.x, 0, entry.group.userData.savedWorld.z)
    : home;
  entry.group.userData.baseY = 0.5 * scale;

  if (entry.lastStatus !== status) {
    entry.mood = MOODS[status] || MOODS.pending;
    if ((status === "completed" || status === "done") && entry.lastStatus && entry.lastStatus !== status) {
      const wp = new THREE.Vector3();
      entry.group.getWorldPosition(wp);
      wp.y += 0.6;
      burstConfetti(wp, color);
    }
    entry.lastStatus = status;
  }

  if (entry.labelText !== labelText) {
    entry.group.remove(entry.label);
    const label = makeLabel(labelText, { size: 24 });
    label.position.set(0, 1.15 * scale + labelLift, 0);
    entry.group.add(label);
    entry.label = label;
    entry.labelText = labelText;
  }

  entry.alive = true;
  return entry;
}

function upsertDesk(id, { color, parentGroup, pos }) {
  let desk = desks.get(id);
  if (!desk) {
    const group = makeDesk(color);
    group.position.set(pos.x, 0, pos.z);
    parentGroup.add(group);
    spawnPop(group);
    desk = { group };
    desks.set(id, desk);
  } else if (desk.group.parent !== parentGroup) {
    parentGroup.add(desk.group);
  }
  desk.group.userData.screenMat.color.set(color);
  desk.alive = true;
  return desk;
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---------- main sync ----------
async function syncState() {
  let state;
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    state = await res.json();
    document.getElementById("status-dot").style.background = "#38d9a9";
    document.getElementById("status-text").textContent = "live";
  } catch (e) {
    document.getElementById("status-dot").style.background = "#e64980";
    document.getElementById("status-text").textContent = "disconnected";
    return;
  }

  for (const e of creatures.values()) e.alive = false;
  for (const d of desks.values()) d.alive = false;

  ensureHub();
  const homeTeam = state.teams.find((t) => t.name === "home");
  if (homeTeam?.daemon) {
    hubMascot.userData.dormant = !homeTeam.daemon.running;
    let i = 0;
    for (const w of homeTeam.daemon.workers) {
      const id = "worker:" + w.name;
      let node = workerNodes.get(id);
      if (!node) {
        const wg = makeWorker(0x5b7a8c, { scale: 0.6, badge: WORKER_ICON[w.name] || "🐣", variantIndex: variantIndexFor(id) });
        const lbl = makeLabel(w.name, { size: 18 });
        lbl.position.set(0, 0.9, 0);
        wg.add(lbl);
        hubGroup.add(wg);
        spawnPop(wg);
        node = { group: wg };
        workerNodes.set(id, node);
        draggable.push({ id, group: wg });
      }
      const pos = positionOnCircle(i, homeTeam.daemon.workers.length, 1.9);
      if (!node.group.userData.dragging) {
        node.group.userData.home = pos;
        if (!node.group.userData.placed) {
          node.group.position.set(pos.x, node.group.position.y, pos.z);
          node.group.userData.placed = true;
        }
      }
      node.group.userData.baseY = 0.29;
      node.group.userData.mood = w.isRunning ? MOODS.running : MOODS.idle;
      const wColor = w.isRunning ? 0x7a9b5e : 0x5b7a8c;
      node.group.userData.antennaMat.color.set(wColor);
      node.group.userData.antennaMat.emissive.set(wColor);
      i++;
    }
  }

  const otherTeams = state.teams.filter((t) => t.name !== "home");
  otherTeams.forEach((team, ti) => {
    let zone = zones.get(team.name);
    const itemCount = team.agents.length + team.tasks.length;
    const radius = Math.min(4.2, Math.max(1.5, 1.0 + itemCount * 0.42));
    if (!zone) {
      const group = new THREE.Group();
      const rug = makeRug(radius * 1.2, team.color);
      group.add(rug);
      const label = makeLabel(`🏢 ${team.name}`, { size: 26, color: "#fff" });
      label.position.set(0, radius * 0.35 + 1.2, 0);
      group.add(label);

      const lamp = makePendantLamp();
      lamp.position.set(0, 3, 0);
      group.add(lamp);
      const lights = makeStringLights(radius * 1.1, 8);
      lights.rotation.y = Math.random() * Math.PI * 2;
      group.add(lights);
      for (let pi = 0; pi < 3; pi++) {
        const ang = (pi / 3) * Math.PI * 2 + 0.6;
        const plant = makePlant(0.8 + Math.random() * 0.3);
        plant.position.set(Math.cos(ang) * radius * 1.05, 0, Math.sin(ang) * radius * 1.05);
        group.add(plant);
      }

      worldRoot.add(group);
      spawnPop(group);
      zone = { group, rug, radius };
      zones.set(team.name, zone);
      draggable.push({ id: "zone:" + team.name, group });
    }
    const pos = positionOnCircle(ti, otherTeams.length, 8.5);
    if (!zone.group.userData.dragging && !zone.group.userData.placed) {
      zone.group.position.set(pos.x, 0, pos.z);
      zone.group.userData.placed = true;
    }
    zone.group.userData.baseY = 0;

    const items = [
      ...team.agents.map((a) => ({
        id: "agent:" + a.id,
        kind: "agent",
        status: a.status,
        badge: AGENT_BADGE[a.type] || AGENT_BADGE.default,
        label: `${a.icon || "🐣"} ${truncate(a.task || a.type || a.id, 20)}`,
        role: a.type || "agent",
        task: a.task || "",
        scale: 0.95,
      })),
      ...team.tasks.map((t) => ({
        id: "task:" + t.id,
        kind: "task",
        status: t.status,
        badge: AGENT_BADGE.default,
        label: `${statusIcon(t.status)} ${truncate(t.description, 22)}`,
        role: "task worker",
        task: t.description || "",
        priority: t.priority,
        progress: t.progress,
        tags: t.tags,
        scale: 0.8,
      })),
    ];

    items.forEach((it, ii) => {
      const local = positionOnCircle(ii, items.length, radius * 0.68);
      upsertDesk(it.id, { color: statusColor(it.status), parentGroup: zone.group, pos: local });
      const entry = upsertWorker(it.id, {
        color: statusColor(it.status),
        scale: it.scale,
        labelText: it.label,
        status: it.status,
        badge: it.badge,
        parentGroup: zone.group,
        deskPos: local,
        labelLift: (ii % 3) * 0.28,
        data: { ...it, team: team.name },
      });
      entry.group.userData.tooltip = it.label;
    });
  });

  for (const [name, zone] of zones) {
    if (!otherTeams.find((t) => t.name === name)) {
      worldRoot.remove(zone.group);
      zones.delete(name);
    }
  }
  for (const [id, entry] of creatures) {
    if (!entry.alive) {
      entry.group.parent?.remove(entry.group);
      creatures.delete(id);
    }
  }
  for (const [id, desk] of desks) {
    if (!desk.alive) {
      desk.group.parent?.remove(desk.group);
      desks.delete(id);
    }
  }

  document.getElementById("hud-sub").textContent =
    otherTeams.length === 0
      ? "all quiet — launch a swarm and it'll show up here"
      : `${otherTeams.length} team(s) · ${otherTeams.reduce((n, t) => n + t.agents.length + t.tasks.length, 0)} in progress`;

  renderLegend(otherTeams);
}

function renderLegend(teams) {
  const el = document.getElementById("legend");
  el.innerHTML = "";
  const add = (color, text) => {
    const span = document.createElement("span");
    span.innerHTML = `<span class="dot" style="background:${color}"></span>${text}`;
    el.appendChild(span);
  };
  add("#ffd43b", "pending");
  add("#ff6b6b", "working");
  add("#51cf66", "done");
  add("#e64980", "failed");
  for (const t of teams) add(t.color, t.name);
}

// ---------- drag interaction ----------
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let dragging = null;
const tooltipEl = document.getElementById("tooltip");

function setPointer(ev) {
  pointerNDC.x = (ev.clientX / innerWidth) * 2 - 1;
  pointerNDC.y = -(ev.clientY / innerHeight) * 2 + 1;
}

function topDraggableGroups() {
  const list = [];
  for (const e of creatures.values()) list.push(e.group);
  for (const [, n] of workerNodes) list.push(n.group);
  if (hubGroup) list.push(hubGroup);
  for (const [, z] of zones) list.push(z.group);
  return list;
}

let pointerDownAt = null;

renderer.domElement.addEventListener("pointerdown", (ev) => {
  setPointer(ev);
  pointerDownAt = { x: ev.clientX, y: ev.clientY };
  raycaster.setFromCamera(pointerNDC, camera);
  const groups = topDraggableGroups();
  const hits = raycaster.intersectObjects(groups, true);
  if (hits.length) {
    let target = hits[0].object;
    while (target && !groups.includes(target)) target = target.parent;
    if (target) {
      dragging = target;
      target.userData.dragging = true;
      controls.enabled = false;
      const worldY = new THREE.Vector3();
      target.getWorldPosition(worldY);
      dragPlane.constant = -worldY.y;
    }
  }
});

renderer.domElement.addEventListener("pointermove", (ev) => {
  setPointer(ev);
  if (dragging) {
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, hit)) {
      const parent = dragging.parent;
      const local = parent ? parent.worldToLocal(hit.clone()) : hit;
      dragging.position.x = local.x;
      dragging.position.z = local.z;
    }
    return;
  }
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects([...creatures.values()].map((e) => e.group), true);
  if (hits.length) {
    let target = hits[0].object;
    while (target && !target.userData.tooltip) target = target.parent;
    if (target?.userData.tooltip) {
      tooltipEl.style.display = "block";
      tooltipEl.style.left = ev.clientX + 14 + "px";
      tooltipEl.style.top = ev.clientY + 14 + "px";
      tooltipEl.innerHTML = `<b>${target.userData.tooltip}</b>`;
      renderer.domElement.style.cursor = "grab";
    }
  } else {
    tooltipEl.style.display = "none";
    renderer.domElement.style.cursor = "default";
  }
});

window.addEventListener("pointerup", (ev) => {
  if (dragging) {
    const moved = pointerDownAt ? Math.hypot(ev.clientX - pointerDownAt.x, ev.clientY - pointerDownAt.y) : 999;
    const id = draggable.find((d) => d.group === dragging)?.id;
    if (id) {
      savedOffsets[id] = { x: dragging.position.x, z: dragging.position.z };
      saveOffsets();
      dragging.userData.savedWorld = savedOffsets[id];
      dragging.userData.home = new THREE.Vector3(savedOffsets[id].x, 0, savedOffsets[id].z);
    }
    dragging.userData.dragging = false;
    if (moved < 6) {
      const entry = id ? creatures.get(id) : null;
      if (entry) openAgentPanel(entry);
    }
  }
  dragging = null;
  pointerDownAt = null;
  controls.enabled = true;
});

// ---------- talk to a worker ----------
const panelEl = document.getElementById("agent-panel");
const apLog = document.getElementById("ap-log");
const apBackendSelect = document.getElementById("ap-backend");
let activeEntry = null;

// discover what "brains" are actually available on this machine, once
fetch("/api/backends").then((r) => r.json()).then((info) => {
  for (const model of info.ollama?.models || []) {
    const opt = document.createElement("option");
    opt.value = "ollama:" + model;
    opt.textContent = "🦙 " + model + " (local, free)";
    apBackendSelect.appendChild(opt);
  }
  if (info.codex?.available) {
    const opt = document.createElement("option");
    opt.value = "codex";
    opt.textContent = "🤖 Codex (your ChatGPT login)";
    apBackendSelect.appendChild(opt);
  }
  const saved = localStorage.getItem("agentWorldBackend");
  if (saved && [...apBackendSelect.options].some((o) => o.value === saved)) {
    apBackendSelect.value = saved;
  }
}).catch(() => {});
apBackendSelect.addEventListener("change", () => {
  localStorage.setItem("agentWorldBackend", apBackendSelect.value);
});

function addMsg(text, who) {
  const div = document.createElement("div");
  div.className = "ap-msg " + who;
  div.textContent = text;
  apLog.appendChild(div);
  apLog.scrollTop = apLog.scrollHeight;
}

function openAgentPanel(entry) {
  activeEntry = entry;
  const d = entry.data || {};
  document.getElementById("ap-avatar").textContent = d.badge || "💻";
  document.getElementById("ap-title").textContent = d.task ? truncate(d.task, 34) : d.id || "worker";
  document.getElementById("ap-sub").textContent = `${d.team || ""} · ${d.role || "worker"}`;
  apLog.innerHTML = "";
  addMsg(greetingFor(d), "them");
  panelEl.classList.add("open");
  document.getElementById("ap-input").focus();
}
document.getElementById("ap-close").addEventListener("click", () => panelEl.classList.remove("open"));

function greetingFor(d) {
  if (!d.task) return "Hi! I don't have an assigned task right now — just idling.";
  const statusPhrase = {
    pending: "it's queued, I haven't started yet",
    queued: "it's queued, I haven't started yet",
    running: "I'm actively working on it right now",
    in_progress: "I'm actively working on it right now",
    active: "I'm actively working on it right now",
    completed: "I finished it ✅",
    done: "I finished it ✅",
    failed: "it failed ❌ — might need a human to look at it",
    error: "it failed ❌ — might need a human to look at it",
  }[d.status] || "here's where it stands";
  let msg = `Hi! I'm on "${d.task}" — ${statusPhrase}.`;
  if (typeof d.progress === "number" && d.progress > 0) msg += ` Progress: ${d.progress}%.`;
  return msg;
}

function answerFor(d, qRaw) {
  const q = qRaw.toLowerCase();
  if (!d.task) return "I don't have a task assigned yet, so there's nothing to report.";
  if (/order|start|pause|stop|cancel|priorit|reassign|do this|please/.test(q)) {
    return "I can't actually execute commands yet — this panel only shows what's really happening in Ruflo. Wiring up real orders would need this page talking to a live LLM (an API key) or to the ruflo CLI directly.";
  }
  if (/progress|how.?s it going|status|done|far/.test(q)) {
    return typeof d.progress === "number"
      ? `I'm at ${d.progress}% — status is "${d.status}".`
      : `Status: "${d.status}".`;
  }
  if (/priorit/.test(q)) {
    return d.priority ? `Priority: ${d.priority}.` : "No priority set on this one.";
  }
  if (/team|project|department/.test(q)) {
    return `I'm on the "${d.team}" team.`;
  }
  if (/tag/.test(q)) {
    return d.tags?.length ? `Tags: ${d.tags.join(", ")}.` : "No tags on this task.";
  }
  if (/who|role|what are you/.test(q)) {
    return `I'm a ${d.role || "worker"}${d.kind === "agent" ? "" : " handling a task from the queue"}.`;
  }
  return `Working on: "${d.task}" (${d.status}). Ask me about progress, priority, team, or tags!`;
}

document.getElementById("ap-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = document.getElementById("ap-input");
  const text = input.value.trim();
  if (!text || !activeEntry) return;
  addMsg(text, "me");
  input.value = "";

  const backend = apBackendSelect.value;
  const data = activeEntry.data || {};

  if (backend === "facts" || !backend) {
    setTimeout(() => addMsg(answerFor(data, text), "them"), 220);
    return;
  }

  const thinking = document.createElement("div");
  thinking.className = "ap-msg them thinking";
  thinking.textContent = "…";
  apLog.appendChild(thinking);
  apLog.scrollTop = apLog.scrollHeight;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backend, worker: data, message: text }),
    });
    const out = await res.json();
    thinking.remove();
    if (out.reply) addMsg(out.reply, "them");
    else addMsg(`(${out.error || "no reply"}) — ` + answerFor(data, text), "them");
  } catch (e) {
    thinking.remove();
    addMsg("(couldn't reach the local AI) — " + answerFor(data, text), "them");
  }
});

// ---------- animation loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  animateWorker(hubMascot, MOODS[hubMascot?.userData.dormant ? "idle" : "running"] || MOODS.idle, t, dt, 0.72);

  for (const entry of creatures.values()) {
    const g = entry.group;
    if (g.userData.spawnT !== undefined && g.userData.spawnT < 1) {
      g.userData.spawnT = Math.min(1, g.userData.spawnT + dt * 2.4);
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)) * (g.userData.finalScale || 1));
    }
    if (!g.userData.dragging) {
      animateWorker(g, entry.mood || MOODS.pending, t, dt, g.userData.baseY || 0.4);
    }
  }
  for (const [, node] of workerNodes) {
    const g = node.group;
    if (g.userData.spawnT !== undefined && g.userData.spawnT < 1) {
      g.userData.spawnT = Math.min(1, g.userData.spawnT + dt * 2.4);
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)) * 0.6);
    }
    if (!g.userData.dragging) {
      animateWorker(g, g.userData.mood || MOODS.idle, t, dt, g.userData.baseY || 0.29);
    }
  }
  for (const [, desk] of desks) {
    const g = desk.group;
    if (g.userData.spawnT !== undefined && g.userData.spawnT < 1) {
      g.userData.spawnT = Math.min(1, g.userData.spawnT + dt * 2.4);
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)));
    }
  }
  for (const [, zone] of zones) {
    const g = zone.group;
    if (g.userData.spawnT !== undefined && g.userData.spawnT < 1) {
      g.userData.spawnT = Math.min(1, g.userData.spawnT + dt * 1.8);
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)));
    }
  }
  if (hubGroup && hubGroup.userData.spawnT !== undefined && hubGroup.userData.spawnT < 1) {
    hubGroup.userData.spawnT = Math.min(1, hubGroup.userData.spawnT + dt * 1.8);
    hubGroup.scale.setScalar(Math.max(0.001, easeOutBack(hubGroup.userData.spawnT)));
  }

  updateConfetti(dt);
  controls.update();
  renderer.render(scene, camera);
}

// drives one robot-worker: typing at the desk, or pacing/waiting nearby —
// this IS the "visualization of the work", not decoration.
function animateWorker(g, mood, t, dt, baseY) {
  if (!g || !mood) return;
  const phase = g.userData.phase ?? (g.userData.phase = Math.random() * 10);
  const home = g.userData.home || new THREE.Vector3(g.position.x, 0, g.position.z);
  let moving = false;

  if (mood.typing) {
    g.userData.atWork = false;
    if (g.position.distanceTo(home) > 0.06) {
      g.position.lerp(new THREE.Vector3(home.x, g.position.y, home.z), Math.min(1, dt * 5));
    } else {
      g.position.x = home.x;
      g.position.z = home.z;
    }
    const targetAngle = Math.PI; // face the desk
    let da = targetAngle - g.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    g.rotation.y += da * Math.min(1, dt * 6);
  } else {
    if (!g.userData.waypoint || g.position.distanceTo(g.userData.waypoint) < 0.05) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * mood.radius;
      g.userData.waypoint = new THREE.Vector3(home.x + Math.cos(ang) * r, 0, home.z + Math.sin(ang) * r);
    }
    const dir = new THREE.Vector3().subVectors(g.userData.waypoint, g.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.02) {
      moving = true;
      dir.normalize();
      g.position.x += dir.x * mood.speed * dt;
      g.position.z += dir.z * mood.speed * dt;
      const targetAngle = Math.atan2(dir.x, dir.z);
      let da = targetAngle - g.rotation.y;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      g.rotation.y += da * Math.min(1, dt * 6);
    }
  }

  g.userData.walkBlend = THREE.MathUtils.lerp(g.userData.walkBlend || 0, moving ? 1 : 0, dt * 5);
  const armL = g.userData.armL, armR = g.userData.armR, legL = g.userData.legL, legR = g.userData.legR;

  if (mood.typing) {
    // a little burst of typing, then a pause to "think" — reads as human, not a metronome
    const cycle = (t * 0.6 + phase) % (Math.PI * 2);
    const typingNow = cycle < Math.PI * 1.3;
    const tf = typingNow ? Math.sin(t * 10 + phase) : 0;
    if (armL) armL.rotation.x = -0.4 + tf * 0.3;
    if (armR) armR.rotation.x = -0.4 - tf * 0.3;
    if (legL) legL.rotation.x = 0;
    if (legR) legR.rotation.x = 0;
    g.position.y = baseY + Math.abs(Math.sin(t * 4 + phase)) * (typingNow ? 0.008 : 0.02);
    g.rotation.z = Math.sin(t * 0.4 + phase) * 0.03;
    g.rotation.x = typingNow ? 0.03 : -0.02;
  } else {
    const wb = g.userData.walkBlend;
    const swing = Math.sin(t * 7 + phase) * mood.legSwing * wb;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing * 0.8;
    if (armR) armR.rotation.x = swing * 0.8;
    g.position.y = baseY + Math.abs(Math.sin(t * 7 + phase)) * mood.bodyBob * wb + Math.sin(t * 1.5 + phase) * 0.01;
    g.rotation.z = mood.tilt;
    g.rotation.x = 0;
  }
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- ambient decor: fill the empty floor so the office feels lived-in ----------
function makeBookshelf() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9c7b52, roughness: 0.7 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.28), wood);
  frame.position.y = 0.55;
  frame.castShadow = true;
  g.add(frame);
  const folderColors = [0xa8445a, 0xd9a441, 0x7a9b5e, 0x5b7a8c, 0x8f8397];
  for (let shelf = 0; shelf < 3; shelf++) {
    for (let i = 0; i < 4; i++) {
      const folder = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.28, 0.2),
        new THREE.MeshStandardMaterial({ color: folderColors[(shelf * 4 + i) % folderColors.length], roughness: 0.6 })
      );
      folder.position.set(-0.26 + i * 0.13, 0.28 + shelf * 0.34, 0);
      g.add(folder);
    }
  }
  return g;
}

function makeSofa(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.42), mat);
  seat.position.y = 0.2;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.12), mat);
  back.position.set(0, 0.44, -0.16);
  g.add(back);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.42), mat);
    arm.position.set(side * 0.42, 0.3, 0);
    g.add(arm);
  }
  return g;
}

function scatterAmbientDecor() {
  const ringMin = 6.6, ringMax = 8.6;
  const decorMakers = [
    () => makePlant(1 + Math.random() * 0.4),
    () => makePlant(0.7 + Math.random() * 0.3),
    () => makeBookshelf(),
    () => makeSofa([0x5b7a8c, 0xa8445a, 0x7a9b5e, 0xc08a4e][Math.floor(Math.random() * 4)]),
  ];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const r = ringMin + Math.random() * (ringMax - ringMin);
    const item = decorMakers[i % decorMakers.length]();
    item.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    item.rotation.y = Math.random() * Math.PI * 2;
    worldRoot.add(item);
  }
}
scatterAmbientDecor();

// ---------- the forest — the office sits in a clearing inside it ----------
function makeTree(scale = 1, pine = false) {
  const g = new THREE.Group();
  const trunkH = pine ? 1.6 : 1.1;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.14, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const greens = [0x5a6b3f, 0x6b7a4a, 0x4f5c38, 0x7a8a52];
  const leafMat = () => new THREE.MeshStandardMaterial({
    color: greens[Math.floor(Math.random() * greens.length)], roughness: 0.85,
  });

  if (pine) {
    let y = trunkH * 0.55;
    for (let i = 0; i < 4; i++) {
      const r = 0.75 - i * 0.15;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.85, 10), leafMat());
      cone.position.y = y;
      cone.castShadow = true;
      g.add(cone);
      y += 0.55;
    }
  } else {
    const clusters = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < clusters; i++) {
      const r = 0.5 + Math.random() * 0.35;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat());
      const ang = (i / clusters) * Math.PI * 2;
      blob.position.set(Math.cos(ang) * 0.25, trunkH + 0.25 + Math.random() * 0.3, Math.sin(ang) * 0.25);
      blob.castShadow = true;
      g.add(blob);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

function plantForest() {
  // wide forest floor so trees don't run out past the office clearing
  const forestFloor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x5c6b3f, roughness: 0.95 })
  );
  forestFloor.rotation.x = -Math.PI / 2;
  forestFloor.position.y = -0.02;
  forestFloor.receiveShadow = true;
  worldRoot.add(forestFloor);

  const N = 90;
  for (let i = 0; i < N; i++) {
    const ang = Math.random() * Math.PI * 2;
    // denser the further out, but a few brave trees lean into the clearing edge too
    const r = 8.2 + Math.pow(Math.random(), 0.6) * 20;
    const scale = 0.8 + Math.random() * 1.1;
    const tree = makeTree(scale, Math.random() < 0.35);
    tree.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    tree.rotation.y = Math.random() * Math.PI * 2;
    worldRoot.add(tree);
  }
}
plantForest();

syncState();
setInterval(syncState, POLL_MS);
animate();
