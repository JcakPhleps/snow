import * as THREE from 'three';

// ---------------------------------------------------------------------------
// MOUNTAIN — five hand-tuned, seeded runs. Everything the physics touches comes
// from the analytic height() function (which reads the current level config),
// so the render mesh and the physics agree AND every client on the same level
// shares the exact same hill. Kickers are baked into the height field as a
// ramp-to-a-lip-then-drop, so hitting one at speed launches you naturally.
//
//   x = across        z = downhill distance (0 = top)
//   centerX(z)        the fall-line can snake left/right (cross-country runs)
//   height(x,z)       snow surface y (decreases downhill)
// ---------------------------------------------------------------------------

const SEG = 3;   // mesh resolution (world units per quad)

// Each level: grade (steepness), length, pisteHalf (half-width), roll shape,
// camber (how hard the valley floor centers you), wind (how much the run
// snakes), kickers, scenery density, and sky/fog colors.
export const LEVELS = [
  {
    id: 1, name: 'Bunny Hill', blurb: 'easy downhill · a few friendly jumps',
    grade: 0.15, length: 1000, pisteHalf: 28, ra1: 1.1, rf1: 0.02, ra2: 0.7, rf2: 0.06,
    mogul: 0.1, camber: 0.03, wind: 0, windFreq: 0, trees: 0.8,
    sky: 0xbfe8ff, fog: [60, 240],
    kickers: [{ z: 250, len: 10, h: 2.0, x: 0, w: 8 }, { z: 480, len: 11, h: 2.6, x: -5, w: 8 }, { z: 720, len: 12, h: 3.0, x: 5, w: 9 }],
  },
  {
    id: 2, name: 'Backcountry', blurb: 'cross-country adventure · wander & jump',
    grade: 0.11, length: 2200, pisteHalf: 34, ra1: 2.6, rf1: 0.016, ra2: 1.5, rf2: 0.045,
    mogul: 0.18, camber: 0.07, wind: 30, windFreq: 0.0055, trees: 1.5,
    sky: 0xcfe0f0, fog: [70, 280],
    kickers: [{ z: 400, len: 11, h: 2.4, x: 0, w: 8 }, { z: 900, len: 12, h: 2.8, x: 6, w: 9 }, { z: 1500, len: 12, h: 3.0, x: -6, w: 9 }, { z: 1950, len: 13, h: 3.2, x: 0, w: 10 }],
  },
  {
    id: 3, name: 'The Face', blurb: 'super steep · clear run · huge booter at the bottom',
    grade: 0.42, length: 1200, pisteHalf: 22, ra1: 0.8, rf1: 0.03, ra2: 0.5, rf2: 0.08,
    mogul: 0.08, camber: 0.04, wind: 0, windFreq: 0, trees: 0,
    sky: 0xffb27a, fog: [70, 300],
    kickers: [{ z: 400, len: 10, h: 2.6, x: 0, w: 8 }, { z: 720, len: 11, h: 3.0, x: 6, w: 8 }, { z: 1050, len: 20, h: 9.0, x: 0, w: 14 }],
  },
  {
    id: 4, name: 'The Long Haul', blurb: 'a marathon descent · jumps all the way down',
    grade: 0.2, length: 3400, pisteHalf: 30, ra1: 2.0, rf1: 0.02, ra2: 1.2, rf2: 0.055,
    mogul: 0.14, camber: 0.04, wind: 14, windFreq: 0.004, trees: 1.1,
    sky: 0xbfe8ff, fog: [60, 260],
    kickers: (() => { const a = []; for (let z = 300; z < 3200; z += 280) a.push({ z, len: 12, h: 2.6 + Math.sin(z) * 0.0 + (z / 3200) * 3, x: ((z / 280) % 2 ? 7 : -7), w: 9 }); return a; })(),
  },
  {
    id: 5, name: 'Midnight Mayhem', blurb: 'night · narrow · kickers back-to-back · send it',
    grade: 0.32, length: 1800, pisteHalf: 19, ra1: 1.6, rf1: 0.03, ra2: 1.0, rf2: 0.09,
    mogul: 0.16, camber: 0.05, wind: 16, windFreq: 0.008, trees: 0.9,
    sky: 0x0a1030, fog: [40, 150],
    kickers: (() => { const a = []; for (let z = 250; z < 1600; z += 180) a.push({ z, len: 9, h: 3.2 + (z / 1600) * 2.5, x: ((z / 180) % 2 ? 5 : -5), w: 7 }); a.push({ z: 1700, len: 18, h: 8, x: 0, w: 12 }); return a; })(),
  },
];

let cur = LEVELS[0];
export function setLevel(id) { cur = LEVELS.find((l) => l.id === id) || LEVELS[0]; }
export function levelLength() { return cur.length; }
export function pisteHalf() { return cur.pisteHalf; }
export function centerX(z) { return cur.wind ? Math.sin(z * cur.windFreq) * cur.wind : 0; }

function kickerAt(dx, z, kickers) {
  let add = 0;
  for (const k of kickers) {
    const d = z - k.z;
    if (d < -k.len || d > 0.0) continue;
    if (Math.abs(dx - k.x) > k.w) continue;
    const t = (d + k.len) / k.len;
    const across = 1 - Math.abs(dx - k.x) / k.w;
    add += Math.sin(t * Math.PI / 2) * k.h * (0.45 + 0.55 * across);
  }
  return add;
}

export function height(x, z) {
  const L = cur;
  const dx = x - centerX(z);
  let y = -z * L.grade;
  y += Math.sin(z * L.rf1 + 1.3) * L.ra1;
  y += Math.sin(z * L.rf2) * L.ra2;
  y += Math.sin(dx * 0.12 + z * 0.04) * 0.6;
  y += Math.sin(dx * 0.5) * Math.sin(z * 0.45) * L.mogul;
  y += Math.abs(dx) * L.camber;                         // valley floor centers you
  const over = Math.abs(dx) - L.pisteHalf;
  if (over > 0) y += over * 1.1 + over * over * 0.012;   // berm → mountainside
  y += kickerAt(dx, z, L.kickers);
  return y;
}

const _n = new THREE.Vector3();
export function normal(x, z) {
  const e = 0.7;
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  _n.set(-hx, 2 * e, -hz).normalize();
  return _n;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build (or rebuild) the terrain + scenery for a level. Returns a disposable
// root group plus the data main/rider need.
export function buildMountain(scene, id) {
  setLevel(id);
  const L = cur;
  const root = new THREE.Group();

  const WIDTH = L.pisteHalf * 2 + 120;
  const nx = Math.ceil(WIDTH / SEG);
  const nz = Math.ceil(L.length / SEG);
  const geo = new THREE.PlaneGeometry(WIDTH, L.length, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i) + L.length / 2;
    const x = pos.getX(i) + centerX(z);     // slide columns along the snaking path
    pos.setZ(i, z); pos.setX(i, x);
    pos.setY(i, height(x, z));
  }
  geo.computeVertexNormals();
  const night = L.id === 5;
  const snowMat = new THREE.MeshLambertMaterial({
    color: night ? 0x9fb0d8 : 0xeef3ff, flatShading: true,
    emissive: night ? 0x202c4a : 0x000000,
  });
  const terrain = new THREE.Mesh(geo, snowMat);
  terrain.receiveShadow = true;
  root.add(terrain);

  // start gate
  const gateMat = new THREE.MeshLambertMaterial({ color: 0x4fd6e6, flatShading: true });
  for (const gx of [-6, 6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), gateMat);
    p.position.set(gx, height(gx, 2) + 2.5, 2); p.castShadow = true; root.add(p);
  }
  // finish banner
  const finMat = new THREE.MeshLambertMaterial({ color: 0xff79b0, flatShading: true, emissive: 0x330014 });
  const fz = L.length - 20; const fcx = centerX(fz);
  for (const off of [-10, 10]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), finMat);
    p.position.set(fcx + off, height(fcx + off, fz) + 3.5, fz); root.add(p);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(22, 1.4, 0.4), finMat);
  bar.position.set(fcx, height(fcx, fz) + 7, fz); root.add(bar);

  // scenery + obstacles
  const rnd = mulberry32(1337 + L.id * 101);
  const obstacles = [];
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b3a22, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: night ? 0x13342a : 0x1f6b4a, flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8893a5, flatShading: true });
  const treeTrunk = new THREE.CylinderGeometry(0.22, 0.32, 1.4, 5);
  const treeLeaf = new THREE.ConeGeometry(1.5, 4, 6);
  const rockGeo = new THREE.IcosahedronGeometry(0.9, 0);
  const nearKicker = (dx, z) => L.kickers.some((k) => Math.abs(z - k.z) < 24 && Math.abs(dx - k.x) < k.w + 4);

  const step = L.trees > 0 ? 8 / L.trees : Infinity;
  for (let z = 30; L.trees > 0 && z < L.length - 30; z += step + rnd() * 10) {
    const count = 1 + Math.floor(rnd() * 3 * L.trees);
    for (let c = 0; c < count; c++) {
      const edge = rnd() < 0.7;
      const dxo = edge
        ? (rnd() < 0.5 ? -1 : 1) * (L.pisteHalf - 5 + rnd() * 18)
        : (rnd() - 0.5) * L.pisteHalf * 1.3;
      const zz = z + (rnd() - 0.5) * 6;
      if (nearKicker(dxo, zz)) continue;
      const x = centerX(zz) + dxo;
      const y = height(x, zz);
      if (rnd() < 0.82) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(treeTrunk, trunkMat); trunk.position.y = 0.7;
        const leaf = new THREE.Mesh(treeLeaf, leafMat); leaf.position.y = 3; leaf.castShadow = true;
        g.add(trunk); g.add(leaf);
        const sc = 0.7 + rnd() * 0.8; g.scale.setScalar(sc);
        g.position.set(x, y, zz); root.add(g);
        obstacles.push({ x, z: zz, r: 0.85 * sc });
      } else {
        const r = new THREE.Mesh(rockGeo, rockMat);
        const sc = 0.7 + rnd() * 1.1; r.scale.set(sc, sc * 0.7, sc);
        r.position.set(x, y + 0.2, zz); r.castShadow = true; r.rotation.y = rnd() * 6; root.add(r);
        obstacles.push({ x, z: zz, r: 0.85 * sc });
      }
    }
  }

  scene.add(root);
  return { root, obstacles, finishZ: L.length - 24, level: L };
}
