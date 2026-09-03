/* Agents World — a live, cute 3D visualization of a whole "company" of
   robot-workers (Ruflo agents/tasks), each at their own desk, doing visibly
   different, literal work. Vanilla three.js, no build step. */

const POLL_MS = 2500;

const STATUS_COLOR = {
  pending: 0xffd43b,
  queued: 0xffd43b,
  running: 0xff6b6b,
  in_progress: 0xff6b6b,
  active: 0xff6b6b,
  completed: 0x51cf66,
  done: 0x51cf66,
  failed: 0xe64980,
  error: 0xe64980,
  idle: 0x4dabf7,
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

// ---------- scene setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1533);
scene.fog = new THREE.Fog(0x0e1533, 16, 34);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 9.5, 13);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.getElementById("canvas-holder").appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 36;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

scene.add(new THREE.HemisphereLight(0xffe9c7, 0x1a1450, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.95);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// starry backdrop
{
  const starGeo = new THREE.BufferGeometry();
  const N = 400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 30 + Math.random() * 22;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.6 + 4;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7 });
  scene.add(new THREE.Points(starGeo, starMat));
}

// one continuous office floor — no islands, no towers, just a company floor
{
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(15, 48),
    new THREE.MeshStandardMaterial({ color: 0x1c2447, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(30, 30, 0x2c3566, 0x232b52);
  grid.position.y = 0.001;
  scene.add(grid);
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

function makeWorker(color, { scale = 1, badge = "💻" } = {}) {
  const g = new THREE.Group();
  const mainMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.3), mainMat);
  torso.position.y = 0;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), mainMat);
  head.position.y = 0.37;
  head.castShadow = true;
  g.add(head);

  // face
  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    eyeWhite.position.set(side * 0.1, 0.4, 0.23);
    g.add(eyeWhite);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1b1b2b })
    );
    pupil.position.set(side * 0.1, 0.4, 0.28);
    g.add(pupil);
    const cheek = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 14),
      new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.55 })
    );
    cheek.position.set(side * 0.16, 0.32, 0.22);
    cheek.lookAt(cheek.position.clone().add(new THREE.Vector3(0, 0, 1)));
    g.add(cheek);
  }
  // little antenna — reads "robot"
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6),
    new THREE.MeshStandardMaterial({ color: 0x9aa0c0 })
  );
  antenna.position.set(0, 0.6, 0);
  g.add(antenna);
  const antennaTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0x775500 })
  );
  antennaTip.position.set(0, 0.67, 0);
  g.add(antennaTip);

  // arms (hands at the end)
  const armL = makeLimb(0.3, 0.055, 0.08, color, 0xf1f3f8);
  armL.position.set(-0.27, 0.13, 0);
  g.add(armL);
  const armR = makeLimb(0.3, 0.055, 0.08, color, 0xf1f3f8);
  armR.position.set(0.27, 0.13, 0);
  g.add(armR);

  // legs (feet at the end)
  const legL = makeLimb(0.3, 0.07, 0.095, 0x333a5c, 0x2a3050);
  legL.position.set(-0.13, -0.18, 0);
  g.add(legL);
  const legR = makeLimb(0.3, 0.07, 0.095, 0x333a5c, 0x2a3050);
  legR.position.set(0.13, -0.18, 0);
  g.add(legR);

  // role badge, floating above the antenna
  const badgeSprite = makeLabel(badge, { size: 30, pad: 6, bg: true });
  badgeSprite.position.set(0, 1.02, 0);
  g.add(badgeSprite);

  g.userData.mainMat = mainMat;
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
  pending: { typing: false, radius: 0.3, speed: 0.35, legSwing: 0.35, bodyBob: 0.03, tilt: 0 },
  queued: { typing: false, radius: 0.3, speed: 0.35, legSwing: 0.35, bodyBob: 0.03, tilt: 0 },
  idle: { typing: false, radius: 0.3, speed: 0.35, legSwing: 0.35, bodyBob: 0.03, tilt: 0 },
  running: { typing: true },
  in_progress: { typing: true },
  active: { typing: true },
  completed: { typing: false, radius: 0.45, speed: 0.6, legSwing: 0.45, bodyBob: 0.05, tilt: 0 },
  done: { typing: false, radius: 0.45, speed: 0.6, legSwing: 0.45, bodyBob: 0.05, tilt: 0 },
  failed: { typing: false, radius: 0.06, speed: 0.1, legSwing: 0.08, bodyBob: 0.004, tilt: -0.35 },
  error: { typing: false, radius: 0.06, speed: 0.1, legSwing: 0.08, bodyBob: 0.004, tilt: -0.35 },
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
  hubGroup.add(makeRug(2.4, "#ffd43b"));

  hubMascot = makeWorker(0xffd43b, { scale: 1.5, badge: "👑" });
  hubMascot.position.set(0, 0.72, 0);
  hubGroup.userData.baseY = 0.72;
  hubGroup.add(hubMascot);

  const crown = makeLabel("🏢 Ruflo HQ", { size: 28 });
  crown.position.set(0, 1.7, 0);
  hubGroup.add(crown);

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
    const group = makeWorker(color, { scale, badge });
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
  entry.group.userData.mainMat.color.set(color);
  entry.group.userData.home = entry.group.userData.savedWorld
    ? new THREE.Vector3(entry.group.userData.savedWorld.x, 0, entry.group.userData.savedWorld.z)
    : home;
  entry.group.userData.baseY = 0.48 * scale;

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
        const wg = makeWorker(0x4dabf7, { scale: 0.6, badge: WORKER_ICON[w.name] || "🐣" });
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
      node.group.userData.mainMat.color.set(w.isRunning ? 0x51cf66 : 0x4dabf7);
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
    const tf = Math.sin(t * 9 + phase);
    if (armL) armL.rotation.x = -0.4 + tf * 0.3;
    if (armR) armR.rotation.x = -0.4 - tf * 0.3;
    if (legL) legL.rotation.x = 0;
    if (legR) legR.rotation.x = 0;
    g.position.y = baseY + Math.abs(Math.sin(t * 4 + phase)) * 0.008;
    g.rotation.z = 0;
  } else {
    const wb = g.userData.walkBlend;
    const swing = Math.sin(t * 7 + phase) * mood.legSwing * wb;
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    if (armL) armL.rotation.x = -swing * 0.8;
    if (armR) armR.rotation.x = swing * 0.8;
    g.position.y = baseY + Math.abs(Math.sin(t * 7 + phase)) * mood.bodyBob * wb + Math.sin(t * 1.5 + phase) * 0.01;
    g.rotation.z = mood.tilt;
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

syncState();
setInterval(syncState, POLL_MS);
animate();
