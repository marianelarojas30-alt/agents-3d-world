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
// cream / copper / gray / muted-green only, per spec — no blue/purple
// cute, saturated colors — like the very first version, not worn metal
const ROBOT_VARIANTS = [
  { color: 0xc9a6e0, face: "/assets/faces/purple_editor.png" },
  { color: 0x7fd9a0, face: "/assets/faces/moss_laptop.png" },
  { color: 0xffb463, face: "/assets/faces/copper_writer.png" },
  { color: 0xfff1cf, face: "/assets/faces/cream_box.png" },
  { color: 0x7ec8f2, face: "/assets/faces/blue_small.png" },
  { color: 0xa8e07a, face: "/assets/faces/moss_small.png" },
  { color: 0xffcfa3, face: "/assets/faces/cream_small.png" },
];
// pick an icon that actually matches what the task is about — "visualize
// each task" instead of one generic laptop badge for every task worker
const TASK_KEYWORDS = [
  [/python|script|extract/i, "🐍"],
  [/godot|game|motif/i, "🎮"],
  [/ui|panel|scene|screen/i, "🖼️"],
  [/review|verify|audit/i, "🔍"],
  [/doc|spec|write/i, "📝"],
  [/test|qa/i, "🧪"],
  [/build|assemble|extend|resource/i, "🔨"],
  [/fix|bug|error/i, "🩹"],
  [/data|memory|store/i, "🗄️"],
  [/security|auth|policy/i, "🛡️"],
];
function taskBadge(description) {
  for (const [re, icon] of TASK_KEYWORDS) if (re.test(description || "")) return icon;
  return "⚙️";
}
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

// ---------- scene setup: a forest clearing at golden hour ----------
// blue cute world, like the very first version — bright sky, not workshop-brown
const SKY_TOP = 0x2f7fd9;
const SKY_HORIZON = 0xbfe3ff;
const FOG_COLOR = 0xcfe9ff;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_COLOR, 20, 46);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(3.2, 3.4, 7.6); // three-quarter workbench-level framing, like the reference

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById("canvas-holder").appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, -0.5);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 36;
controls.maxPolarAngle = Math.PI * 0.465;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

// walk-through: WASD/arrows move the camera through the agency (not just
// orbit around a fixed point) — target moves with it so look direction holds
const walkKeys = { w: false, a: false, s: false, d: false };
window.addEventListener("keydown", (ev) => {
  const k = ev.key.toLowerCase();
  if (k === "w" || k === "arrowup") walkKeys.w = true;
  if (k === "s" || k === "arrowdown") walkKeys.s = true;
  if (k === "a" || k === "arrowleft") walkKeys.a = true;
  if (k === "d" || k === "arrowright") walkKeys.d = true;
  if (walkKeys.w || walkKeys.a || walkKeys.s || walkKeys.d) controls.autoRotate = false;
});
window.addEventListener("keyup", (ev) => {
  const k = ev.key.toLowerCase();
  if (k === "w" || k === "arrowup") walkKeys.w = false;
  if (k === "s" || k === "arrowdown") walkKeys.s = false;
  if (k === "a" || k === "arrowleft") walkKeys.a = false;
  if (k === "d" || k === "arrowright") walkKeys.d = false;
});
const _walkForward = new THREE.Vector3();
const _walkRight = new THREE.Vector3();
function updateWalk(dt) {
  if (!walkKeys.w && !walkKeys.a && !walkKeys.s && !walkKeys.d) return;
  camera.getWorldDirection(_walkForward);
  _walkForward.y = 0;
  _walkForward.normalize();
  _walkRight.crossVectors(_walkForward, camera.up).normalize();
  const speed = 6 * dt;
  const delta = new THREE.Vector3();
  if (walkKeys.w) delta.addScaledVector(_walkForward, speed);
  if (walkKeys.s) delta.addScaledVector(_walkForward, -speed);
  if (walkKeys.d) delta.addScaledVector(_walkRight, speed);
  if (walkKeys.a) delta.addScaledVector(_walkRight, -speed);
  camera.position.add(delta);
  controls.target.add(delta);
}

// soft daylight sky dome (replaces flat color / night stars)
{
  const c = document.createElement("canvas");
  c.width = 4; c.height = 512;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#" + SKY_TOP.toString(16).padStart(6, "0"));
  grad.addColorStop(0.55, "#6fb3e8");
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

scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a8faa, 1.0));
const sun = new THREE.DirectionalLight(0xfff6e0, 1.3);
sun.position.set(-9, 11, 7); // warm sunlight from the left, matching the reference
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0015;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfe0ff, 0.4);
fill.position.set(-10, 6, -8);
scene.add(fill);

// neutral packed-earth/concrete factory floor — no grid lines, no orange
{
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#7c8a9c";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const shade = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${Math.random() * 0.06})`;
    const s = 2 + Math.random() * 3;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xdfe6ec, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // soft warm vignette ring toward the edges, like a lamp-lit room fading to shadow
  const under = new THREE.Mesh(
    new THREE.RingGeometry(9.5, 15.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x4a4a3a, roughness: 0.9, transparent: true, opacity: 0.35 })
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.005;
  scene.add(under);
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

// a background service (like ruflo's daemon workers) is infrastructure,
// not a person — render it as a small server unit with a status LED,
// never animated as if it were doing hands-on work
function makeMachine(scale = 1) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.28), bodyMat);
  body.position.y = 0.2;
  body.castShadow = true;
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.6 })
    );
    slot.position.set(0, 0.1 + i * 0.1, 0.145);
    g.add(slot);
  }
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x5b7a8c });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), ledMat);
  led.position.set(0.11, 0.33, 0.145);
  g.add(led);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a6d72 })
  );
  antenna.position.set(-0.08, 0.46, 0);
  g.add(antenna);
  g.userData.ledMat = ledMat;
  g.userData.ledMesh = led;
  g.scale.setScalar(scale);
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
// tropical rainforest foliage — Chocó/Darién humid-jungle green, not desert
const JUNGLE_GREENS = [0x1f5c33, 0x2a6b3a, 0x347a42, 0x1a4d2b, 0x3e8a4a];

function makeFern(scale = 1) {
  const g = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x2e4a1e, roughness: 0.7 });
  const fronds = 6 + Math.floor(Math.random() * 3);
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.Group();
    const ang = (i / fronds) * Math.PI * 2 + Math.random() * 0.3;
    const tilt = 0.5 + Math.random() * 0.5;
    const leafMat = new THREE.MeshStandardMaterial({
      color: JUNGLE_GREENS[Math.floor(Math.random() * JUNGLE_GREENS.length)], roughness: 0.5,
    });
    const leaflets = 5;
    for (let j = 0; j < leaflets; j++) {
      const t = j / leaflets;
      const leaflet = new THREE.Mesh(new THREE.SphereGeometry(0.05 * (1 - t * 0.6), 6, 5), leafMat);
      leaflet.scale.set(0.35, 1, 0.9);
      leaflet.position.set(0, 0.06 + t * 0.32, t * 0.06);
      frond.add(leaflet);
    }
    frond.rotation.set(tilt, ang, 0);
    frond.castShadow = true;
    g.add(frond);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 6), stemMat);
  stem.position.y = 0.03;
  g.add(stem);
  g.scale.setScalar(scale);
  return g;
}

function makeBroadLeafPlant(scale = 1) {
  const g = new THREE.Group();
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.17, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a1f14, roughness: 0.9 })
  );
  soil.position.y = 0.03;
  g.add(soil);
  const leaves = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < leaves; i++) {
    const leafMat = new THREE.MeshStandardMaterial({
      color: JUNGLE_GREENS[Math.floor(Math.random() * JUNGLE_GREENS.length)], roughness: 0.35, metalness: 0.05,
    });
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), leafMat);
    leaf.scale.set(0.32, 1.15, 0.62);
    const ang = (i / leaves) * Math.PI * 2 + Math.random() * 0.4;
    const lean = 0.35 + Math.random() * 0.35;
    leaf.position.set(Math.cos(ang) * 0.05, 0.24, Math.sin(ang) * 0.05);
    leaf.rotation.set(lean * Math.sin(ang), ang, lean * Math.cos(ang));
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

function makePlant(scale = 1) {
  return Math.random() < 0.55 ? makeFern(scale * 1.3) : makeBroadLeafPlant(scale);
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
  // stubby + visibly articulated: a ball joint at the shoulder/hip, a short
  // thick segment, a ball joint at the elbow/knee, then the hand/foot
  const pivot = new THREE.Group();
  const jointMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const segMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 });

  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(thickness * 1.35, 12, 10), jointMat);
  shoulder.castShadow = true;
  pivot.add(shoulder);

  const seg = new THREE.Mesh(
    new THREE.CylinderGeometry(thickness, thickness * 0.92, length * 0.62, 8),
    segMat
  );
  seg.position.y = -length * 0.34;
  seg.castShadow = true;
  pivot.add(seg);

  const elbow = new THREE.Mesh(new THREE.SphereGeometry(thickness * 1.1, 10, 8), jointMat);
  elbow.position.y = -length * 0.62;
  elbow.castShadow = true;
  pivot.add(elbow);

  const end = new THREE.Mesh(
    new THREE.SphereGeometry(endRadius, 12, 10),
    new THREE.MeshStandardMaterial({ color: endColor, roughness: 0.4, metalness: 0.15 })
  );
  end.position.y = -length * 0.62 - endRadius * 0.9;
  end.scale.set(1, 0.85, 1);
  end.castShadow = true;
  pivot.add(end);

  // a bolt on the shoulder cap — the "handmade" detail
  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(thickness * 0.28, thickness * 0.28, 0.012, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.4, metalness: 0.6 })
  );
  bolt.rotation.x = Math.PI / 2;
  bolt.position.z = thickness * 1.2;
  pivot.add(bolt);

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
  // cute glossy toy finish — clean and bright, not weathered metal
  const mainMat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.35, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.25,
  });

  // small compact body, rounded (not a hard box) — the head is the star
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), mainMat);
  torso.scale.set(1, 0.82, 0.86);
  torso.position.y = -0.12;
  torso.castShadow = true;
  g.add(torso);
  // chest seam + bolts — the handmade detail the reference is full of
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.006, 6, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.5 })
  );
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -0.02;
  seam.scale.set(1, 0.86, 1);
  g.add(seam);
  for (const side of [-1, 1]) {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.012, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.4, metalness: 0.6 })
    );
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(side * 0.14, -0.02, 0.19);
    g.add(bolt);
  }

  // oversized rounded head — the focal point, like the reference
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 26, 20), mainMat);
  head.position.y = 0.32;
  head.castShadow = true;
  g.add(head);
  // neck seam ring
  const neckSeam = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.008, 6, 20),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.5 })
  );
  neckSeam.rotation.x = Math.PI / 2;
  neckSeam.position.y = 0.02;
  g.add(neckSeam);

  // glossy black face screen with a raised metal bezel, flush with the
  // head surface (true geometric recession isn't possible without CSG,
  // so the bezel ring + dark screen + bright eyes sell the "inset" look)
  const bezel = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 28),
    new THREE.MeshStandardMaterial({ color: 0x9a9488, roughness: 0.45, metalness: 0.4 })
  );
  bezel.position.set(0, 0.33, 0.393);
  g.add(bezel);
  const screen = new THREE.Mesh(
    new THREE.CircleGeometry(0.225, 28),
    new THREE.MeshPhysicalMaterial({
      color: 0x07080d, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08,
    })
  );
  screen.position.set(0, 0.33, 0.399);
  g.add(screen);

  // two big glowing mint eyes set into the screen
  for (const side of [-1, 1]) {
    const eyeGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.078, 20),
      new THREE.MeshBasicMaterial({ color: 0x7dffb8 })
    );
    eyeGlow.position.set(side * 0.1, 0.34, 0.404);
    g.add(eyeGlow);
  }
  const eyeLight = new THREE.PointLight(0x7dffb8, 0.55, 1.3, 2);
  eyeLight.position.set(0, 0.34, 0.55);
  g.add(eyeLight);

  // side "ear" mechanisms — small disc vents, straight from the reference
  for (const side of [-1, 1]) {
    const earMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.4, metalness: 0.5 });
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.035, 16), earMat);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(side * 0.395, 0.33, 0.02);
    g.add(ear);
    const earCap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.045, 12), earMat);
    earCap.rotation.z = Math.PI / 2;
    earCap.position.set(side * 0.415, 0.33, 0.02);
    g.add(earCap);
  }

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

  // short stubby arms and legs (hands/feet at the end)
  const armL = makeLimb(0.19, 0.052, 0.06, color, 0xd8cfc0);
  armL.position.set(-0.23, -0.02, 0);
  g.add(armL);
  const armR = makeLimb(0.19, 0.052, 0.06, color, 0xd8cfc0);
  armR.position.set(0.23, -0.02, 0);
  g.add(armR);

  const legL = makeLimb(0.19, 0.062, 0.07, 0x3a3a38, 0x2a2a28);
  legL.position.set(-0.1, -0.3, 0);
  g.add(legL);
  const legR = makeLimb(0.19, 0.062, 0.07, 0x3a3a38, 0x2a2a28);
  legR.position.set(0.1, -0.3, 0);
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
// a little factory workstation: bench + spinning gear + andon stack light,
// instead of a laptop — this is a shop floor, not an office
function makeGear(radius, teeth, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.04, 16), mat);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.32, radius * 0.32, 0.04), mat);
    tooth.position.set(Math.cos(a) * radius * 0.75, Math.sin(a) * radius * 0.75, 0);
    tooth.rotation.z = a;
    g.add(tooth);
  }
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
  );
  bore.rotation.x = Math.PI / 2;
  g.add(bore);
  return g;
}

function makeDesk(color) {
  const g = new THREE.Group();
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x6b6459, roughness: 0.75, metalness: 0.15 })
  );
  bench.position.y = 0.32;
  bench.castShadow = true;
  bench.receiveShadow = true;
  g.add(bench);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.5, roughness: 0.5 })
      );
      leg.position.set(sx * 0.25, 0.16, sz * 0.16);
      g.add(leg);
    }
  }

  // the work itself: a big gear + a small one meshed together, spins while "running"
  const gearBig = makeGear(0.14, 8, 0xb5aa8a);
  gearBig.position.set(-0.08, 0.4, 0);
  g.add(gearBig);
  const gearSmall = makeGear(0.08, 6, 0x8f8578);
  gearSmall.position.set(0.07, 0.4, 0.03);
  g.add(gearSmall);

  // andon stack light — the real factory way to show status at a glance
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
  );
  pole.position.set(0.2, 0.5, -0.1);
  g.add(pole);
  const bulbMat = new THREE.MeshBasicMaterial({ color });
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10), bulbMat);
  bulb.position.set(0.2, 0.7, -0.1);
  g.add(bulb);
  const stackLight = new THREE.PointLight(color, 0.4, 1, 2);
  stackLight.position.copy(bulb.position);
  g.add(stackLight);

  // parts crate — "con papeles" becomes "con piezas"
  for (let i = 0; i < 3; i++) {
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xb5aa8a, metalness: 0.4, roughness: 0.5 })
    );
    part.position.set(-0.2 + i * 0.06, 0.365, 0.13);
    part.rotation.y = Math.random();
    g.add(part);
  }

  g.userData.screenMat = bulbMat;
  g.userData.stackLight = stackLight;
  g.userData.gearBig = gearBig;
  g.userData.gearSmall = gearSmall;
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
    const label = makeLabel(labelText, { size: 16 });
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
    const label = makeLabel(labelText, { size: 16 });
    label.position.set(0, 1.15 * scale + labelLift, 0);
    entry.group.add(label);
    entry.label = label;
    entry.labelText = labelText;
  }

  entry.alive = true;
  return entry;
}

function upsertDesk(id, { color, parentGroup, pos, spinning }) {
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
  desk.group.userData.stackLight.color.set(color);
  desk.group.userData.spinning = spinning;
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
        const wg = makeMachine(0.85);
        const lbl = makeLabel(`${WORKER_ICON[w.name] || "⚙️"} ${w.name}`, { size: 16 });
        lbl.position.set(0, 0.55, 0);
        wg.add(lbl);
        hubGroup.add(wg);
        spawnPop(wg);
        node = { group: wg, isMachine: true };
        workerNodes.set(id, node);
        draggable.push({ id, group: wg });
      }
      const pos = positionOnCircle(i, homeTeam.daemon.workers.length, 1.9);
      if (!node.group.userData.dragging && !node.group.userData.placed) {
        node.group.position.set(pos.x, 0, pos.z);
        node.group.userData.placed = true;
      }
      const wColor = w.isRunning ? 0x7a9b5e : 0x5b7a8c;
      node.group.userData.ledMat.color.set(wColor);
      node.group.userData.running = w.isRunning;
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
        label: `${a.icon || "🐣"} ${truncate(a.task || a.type || a.id, 14)}`,
        role: a.type || "agent",
        task: a.task || "",
        scale: 0.95,
      })),
      ...team.tasks.map((t) => ({
        id: "task:" + t.id,
        kind: "task",
        status: t.status,
        badge: taskBadge(t.description),
        label: `${statusIcon(t.status)} ${truncate(t.description, 16)}`,
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
      const spinning = ["running", "in_progress", "active"].includes(it.status);
      upsertDesk(it.id, { color: statusColor(it.status), parentGroup: zone.group, pos: local, spinning });
      const entry = upsertWorker(it.id, {
        color: statusColor(it.status),
        scale: it.scale,
        labelText: it.label,
        status: it.status,
        badge: it.badge,
        parentGroup: zone.group,
        deskPos: local,
        labelLift: (ii % 5) * 0.4,
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
let hoverId = null;
const tooltipEl = document.getElementById("tooltip");

// ---------- cute voice: workers speak, and you can ask them out loud ----------
function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.pitch = 1.3;
  u.rate = 1.0;
  u.volume = 0.9;
  const voices = window.speechSynthesis.getVoices();
  // prefer natural-sounding / kid-ish voices over the robotic default
  const priority = [/junior/i, /kid/i, /google us english/i, /samantha/i, /ava/i, /allison/i, /female/i];
  let nice = null;
  for (const re of priority) {
    nice = voices.find((v) => re.test(v.name));
    if (nice) break;
  }
  if (nice) u.voice = nice;
  window.speechSynthesis.speak(u);
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};

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
      if (hoverId !== target.uuid) {
        hoverId = target.uuid;
        const entry = [...creatures.values()].find((e) => e.group === target);
        if (entry) speakText(greetingFor(entry.data || {}));
      }
    }
  } else {
    hoverId = null;
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
  if (who === "them") speakText(text);
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

// voice input — ask them out loud instead of typing
const micBtn = document.getElementById("ap-mic");
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRec) {
  const rec = new SpeechRec();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (ev) => {
    const text = ev.results[0][0].transcript;
    document.getElementById("ap-input").value = text;
    document.getElementById("ap-form").requestSubmit();
  };
  rec.onend = () => micBtn.classList.remove("listening");
  rec.onerror = () => micBtn.classList.remove("listening");
  micBtn.addEventListener("click", () => {
    if (!activeEntry) return;
    window.speechSynthesis.cancel();
    micBtn.classList.add("listening");
    rec.start();
  });
} else {
  micBtn.disabled = true;
  micBtn.title = "Voice input not supported in this browser";
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
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)) * 0.85);
    }
    // infrastructure doesn't walk or type — just a status LED, pulsing while
    // the real background job is actually running
    if (g.userData.running) {
      const pulse = 0.5 + Math.abs(Math.sin(t * 4)) * 0.5;
      g.userData.ledMat.color.offsetHSL(0, 0, 0);
      g.userData.ledMat.opacity = 1;
      g.userData.ledMat.transparent = false;
      g.userData.ledMat.color.multiplyScalar(1);
      g.children.forEach((c) => {
        if (c.material === g.userData.ledMat) c.scale.setScalar(0.85 + pulse * 0.3);
      });
    }
  }
  for (const [, desk] of desks) {
    const g = desk.group;
    if (g.userData.spawnT !== undefined && g.userData.spawnT < 1) {
      g.userData.spawnT = Math.min(1, g.userData.spawnT + dt * 2.4);
      g.scale.setScalar(Math.max(0.001, easeOutBack(g.userData.spawnT)));
    }
    // the gears turn only while the real task is actually running —
    // this IS the process, visualized
    const spinSpeed = g.userData.spinning ? 3.2 : 0.15;
    if (g.userData.gearBig) g.userData.gearBig.rotation.z += dt * spinSpeed;
    if (g.userData.gearSmall) g.userData.gearSmall.rotation.z -= dt * spinSpeed * 1.6;
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
  updateWalk(dt);
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
    // idle/pending/completed/failed: no real "communication" data exists in
    // ruflo (assignedTo is empty on every task, no handoff log) — so this is
    // honestly just idle presence near the desk, not simulated coordination
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
  // kept clean and empty on purpose — no plants, no furniture clutter.
  // the robots and their work are the whole point, nothing competes with them.
}
scatterAmbientDecor();

// ---------- the workshop backdrop: the real reference boards + stations ----------
function makeSignboard(url, width, height, frameColor = 0x6b5233) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, height + 0.06, 0.03),
    new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.8 })
  );
  frame.castShadow = true;
  g.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: _textureLoader.load(url), roughness: 0.6 })
  );
  face.position.z = 0.017;
  g.add(face);
  return g;
}

function makeMonitorStation() {
  const g = new THREE.Group();
  const desk = makeDesk(0x5b7a8c);
  g.add(desk);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.5, metalness: 0.4 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), standMat);
  neck.position.set(-0.06, 0.5, -0.05);
  g.add(neck);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.43),
    new THREE.MeshStandardMaterial({ map: _textureLoader.load("/assets/props/monitor_screen.png"), roughness: 0.35 })
  );
  screen.position.set(-0.06, 0.72, -0.03);
  g.add(screen);
  const screenBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.47, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5 })
  );
  screenBack.position.set(-0.06, 0.72, -0.045);
  g.add(screenBack);
  return g;
}

// real wood-plank texture: horizontal boards + long grain streaks, not
// just noise — this is what the workshop wall/beams were missing
function makeWoodTexture(baseHex, plankCount = 6) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  const base = "#" + baseHex.toString(16).padStart(6, "0");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  const plankH = 512 / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const y = p * plankH;
    const shade = (Math.random() - 0.5) * 22;
    ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 255})`;
    ctx.fillRect(0, y, 512, plankH);
    // long grain streaks along each plank
    for (let i = 0; i < 14; i++) {
      const gy = y + Math.random() * plankH;
      ctx.strokeStyle = `rgba(20,12,4,${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, gy + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    // plank seam line
    ctx.strokeStyle = "rgba(15,9,3,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildWorkshopBackdrop() {
  // "AI Video Studio" workstation, camera-left, as in the reference
  const monitorStation = makeMonitorStation();
  monitorStation.position.set(-5.2, 0, -0.6);
  monitorStation.rotation.y = 0.5;
  worldRoot.add(monitorStation);

  // "Model Router" — foreground control panel, standing between camera and hub
  const router = makeSignboard("/assets/props/model_router.png", 0.9, 0.83, 0x2a2a28);
  router.position.set(-1.9, 0.85, 3.1);
  router.rotation.y = 0.35;
  worldRoot.add(router);

  // the central collaborative workbench — bigger and busier than a task desk
  const bench = makeCentralWorkbench();
  bench.position.set(1.6, 0, 1.4);
  bench.rotation.y = -0.5;
  worldRoot.add(bench);

}

function makeMug() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.055, 0.09, 16),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.5 })
  );
  body.position.y = 0.045;
  body.castShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.008, 8, 12, Math.PI * 1.3),
    new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.5 })
  );
  handle.position.set(0.06, 0.045, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

function makeNotebookProp() {
  const g = new THREE.Group();
  const book = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.02, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xc9c2a8, roughness: 0.7 })
  );
  book.position.y = 0.01;
  book.rotation.y = 0.15;
  book.castShadow = true;
  g.add(book);
  const pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.4 })
  );
  pen.rotation.z = Math.PI / 2.3;
  pen.position.set(0.02, 0.03, 0.03);
  g.add(pen);
  return g;
}

function makeToolProp() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 })
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.y = 0.02;
  handle.castShadow = true;
  g.add(handle);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.06, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.4, metalness: 0.5 })
  );
  head.position.set(-0.09, 0.02, 0);
  g.add(head);
  return g;
}

function makeCentralWorkbench() {
  const g = new THREE.Group();
  const woodTex = makeWoodTexture(0x7a5c3a, 4);
  const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: woodTex, roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.7), topMat);
  top.position.y = 0.42;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.42, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
      );
      leg.position.set(sx * 0.62, 0.21, sz * 0.28);
      g.add(leg);
    }
  }
  // a low shelf underneath, with folders — busy/lived-in
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.03, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
  );
  shelf.position.y = 0.16;
  g.add(shelf);

  // things on top: a small monitor, mugs, notebooks, a tool — busy, not empty
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x7a9b5e });
  const scr = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.02), screenMat);
  scr.position.set(-0.3, 0.62, -0.15);
  scr.rotation.x = -0.15;
  g.add(scr);
  const scrStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a28 })
  );
  scrStand.position.set(-0.3, 0.5, -0.15);
  g.add(scrStand);
  for (const p of [[0.15, 0.1], [0.35, -0.1], [-0.05, 0.2]]) {
    const m = makeMug();
    m.position.set(p[0], 0.46, p[1]);
    g.add(m);
  }
  const nb = makeNotebookProp();
  nb.position.set(0.02, 0.46, -0.05);
  g.add(nb);
  const tool = makeToolProp();
  tool.position.set(0.4, 0.46, 0.15);
  g.add(tool);

  return g;
}
buildWorkshopBackdrop();

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

  const N = 55;
  for (let i = 0; i < N; i++) {
    const ang = Math.random() * Math.PI * 2;
    // pushed well back from the clearing so nothing blocks the view of the office
    const r = 14 + Math.pow(Math.random(), 0.7) * 16;
    const scale = 0.8 + Math.random() * 1.1;
    const tree = makeTree(scale, Math.random() < 0.35);
    tree.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    tree.rotation.y = Math.random() * Math.PI * 2;
    worldRoot.add(tree);
  }
}
// (forest removed — was blocking the view and not what was asked for)

syncState();
setInterval(syncState, POLL_MS);
animate();
