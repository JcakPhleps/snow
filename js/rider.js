import * as THREE from 'three';
import { buildAvatar } from './player.js';
import { height, normal, pisteHalf, centerX } from './mountain.js';

// ---------------------------------------------------------------------------
// RIDER — the local snowboarder.
//
// Feel goals (the v1 was janky, this is the fix):
//  • You stay GLUED to small bumps/moguls — you only leave the ground off a real
//    kicker lip or when you JUMP. No more surprise micro-airs that hijacked your
//    steering into spins.
//  • You only BAIL if you actually tried to rotate and landed badly. Catch air
//    and keep it straight → you always stomp it.
//  • Carving steers smoothly and only scrubs a little speed; S is a real brake.
//  • JUMP is a charge: hold SPACE to load power, release to pop. Bigger charge =
//    bigger air. (In the air, SPACE grabs.)
// ---------------------------------------------------------------------------

const G = 24;               // gravity
const BASE_FRICTION = 1.3;  // base edge drag (kept low so it feels fast)
const CARVE_FRICTION = 3.5; // gentle scrub while carving
const BRAKE_FRICTION = 17;  // S = check speed hard
const TURN_RATE = 1.9;      // carve rate (rad/s)
const AIR_SPIN = 7.2;   // ~360° in 0.9s — snappy enough to land off a jump
const AIR_FLIP = 7.0;
const AIR_ROLL = 6.6;
const MAX_SPEED = 46;
const STICK = 1.3;          // gap (m) below which you stay glued to the snow
const CHARGE_TIME = 0.7;    // seconds to a full-power jump

const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function createRider(scene, camera, color = '#7cf0c8') {
  // ----- model -----
  const group = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.09, 1.7),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color).getHex(), flatShading: true }),
  );
  board.position.y = 0.06; board.castShadow = true;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x0a2230 }));
  deck.position.y = 0.11;
  const avatar = buildAvatar(new THREE.Color(color).getHex());
  avatar.position.y = -0.1; avatar.rotation.y = -0.5;
  group.add(board); group.add(deck); group.add(avatar);
  scene.add(group);

  // ----- snow spray -----
  const SPRAY_N = 140;
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new Float32Array(SPRAY_N * 3);
  const sprayVel = new Float32Array(SPRAY_N * 3);
  const sprayLife = new Float32Array(SPRAY_N);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.24, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  spray.frustumCulled = false; scene.add(spray);
  let sprayHead = 0;

  const s = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(0, 0, 8),
    heading: 0, camYaw: 0, grounded: true, keys: {},
    spin: 0, flip: 0, roll: 0, takeoffQuat: new THREE.Quaternion(),
    holding: false, grabbed: false,
    charging: false, charge: 0,
    score: 0, best: 0, combo: 0, trickText: '', toast: '', toastT: 0,
    bailing: 0, hurt: 0, maxAir: 0, finished: false, camFov: 62,
  };
  spawn();
  function spawn() {
    const cx = centerX(2);
    s.pos.set(cx, height(cx, 2), 2);
    s.vel.set(0, 0, 8); s.heading = 0; s.camYaw = 0;
    group.position.copy(s.pos);
  }

  // ----- input -----
  const down = (e) => { s.keys[e.key.toLowerCase()] = true; if (e.key === ' ') e.preventDefault(); };
  const up = (e) => { s.keys[e.key.toLowerCase()] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  const K = (names) => names.some((n) => s.keys[n]);

  function emitSpray(strength) {
    const n = Math.min(5, 1 + (strength | 0));
    for (let i = 0; i < n; i++) {
      const idx = sprayHead = (sprayHead + 1) % SPRAY_N;
      sprayPos[idx * 3] = s.pos.x + (Math.random() - 0.5) * 0.4;
      sprayPos[idx * 3 + 1] = s.pos.y + 0.1;
      sprayPos[idx * 3 + 2] = s.pos.z + (Math.random() - 0.5) * 0.4;
      sprayVel[idx * 3] = (Math.random() - 0.5) * 3 - s.vel.x * 0.18;
      sprayVel[idx * 3 + 1] = 1.5 + Math.random() * 2.5;
      sprayVel[idx * 3 + 2] = (Math.random() - 0.5) * 3 - s.vel.z * 0.18;
      sprayLife[idx] = 0.6;
    }
  }
  function updateSpray(dt) {
    for (let i = 0; i < SPRAY_N; i++) {
      if (sprayLife[i] <= 0) { sprayPos[i * 3 + 1] = -999; continue; }
      sprayLife[i] -= dt; sprayVel[i * 3 + 1] -= 9 * dt;
      sprayPos[i * 3] += sprayVel[i * 3] * dt;
      sprayPos[i * 3 + 1] += sprayVel[i * 3 + 1] * dt;
      sprayPos[i * 3 + 2] += sprayVel[i * 3 + 2] * dt;
    }
    sprayGeo.attributes.position.needsUpdate = true;
  }

  function groundQuat(target) {
    const n = normal(s.pos.x, s.pos.z);
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    _fwd.addScaledVector(n, -_fwd.dot(n)).normalize();
    _right.crossVectors(n, _fwd).normalize();
    _m.makeBasis(_right, n, _fwd);
    target.setFromRotationMatrix(_m);
  }

  const _qSpin = new THREE.Quaternion(), _qFlip = new THREE.Quaternion(), _qRoll = new THREE.Quaternion();
  function airQuat(target) {
    _qSpin.setFromAxisAngle(UP, s.spin);
    _qFlip.setFromAxisAngle(AX, s.flip);
    _qRoll.setFromAxisAngle(AZ, s.roll);
    target.copy(_qSpin).multiply(s.takeoffQuat).multiply(_qFlip).multiply(_qRoll);
  }

  function startAir() {
    s.grounded = false;
    s.spin = s.flip = s.roll = 0;
    s.grabbed = false; s.holding = false;
    s.charging = false; s.charge = 0;     // don't carry a half-charge into the air
    s.maxAir = 0;
    groundQuat(s.takeoffQuat);
  }

  function nameTrick() {
    const parts = [];
    const flips = Math.round(Math.abs(s.flip) / (Math.PI * 2));
    const rolls = Math.round(Math.abs(s.roll) / (Math.PI * 2));
    const spinDeg = Math.round(Math.abs(s.spin) / Math.PI) * 180;
    if (flips) parts.push((s.flip > 0 ? 'Front' : 'Back') + 'flip' + (flips > 1 ? ' x' + flips : ''));
    if (rolls) parts.push((rolls > 1 ? rolls + 'x ' : '') + 'Cork');
    if (spinDeg >= 180) parts.push(spinDeg + '');
    if (s.grabbed) parts.push('Grab');
    return parts.length ? parts.join(' ') : 'Straight Air';
  }

  function land() {
    const n = normal(s.pos.x, s.pos.z);
    const attempted = Math.abs(s.spin) > 0.4 || Math.abs(s.flip) > 0.4 || Math.abs(s.roll) > 0.4;
    let clean = true;
    // Any real air is safe — if you got off the ground to any decent height you
    // stomp it no matter how messy. Only tiny hops done sideways can still bail.
    if (attempted && s.maxAir < 3) {
      _fwd.set(0, 0, 1).applyQuaternion(group.quaternion).setY(0);
      const bup = _v.set(0, 1, 0).applyQuaternion(group.quaternion);
      const upDot = bup.dot(n);
      const travel = _right.set(s.vel.x, 0, s.vel.z);
      const fwdDot = travel.lengthSq() > 0.1 && _fwd.lengthSq() > 0.01
        ? Math.abs(_fwd.normalize().dot(travel.normalize())) : 1;
      clean = upDot > 0.4 && fwdDot > 0.38;
    }
    if (clean) {
      const flips = Math.round(Math.abs(s.flip) / (Math.PI * 2));
      const rolls = Math.round(Math.abs(s.roll) / (Math.PI * 2));
      const spinDeg = Math.round(Math.abs(s.spin) / Math.PI) * 180;
      let pts = spinDeg * 2 + flips * 500 + rolls * 450;
      if (s.grabbed) pts = Math.round(pts * 1.5) + 150;
      if (pts > 0) {
        s.combo++;
        const total = pts * s.combo;
        s.score += total;
        s.toast = `${nameTrick()}  +${total}${s.combo > 1 ? '  x' + s.combo : ''}`; s.toastT = 2.2;
      }
    } else {
      s.bailing = 1.5; s.hurt = 2.4; s.combo = 0; s.vel.multiplyScalar(0.2);
      s.toast = 'BAIL!'; s.toastT = 1.4;
    }
    s.grounded = true; s.trickText = '';
    s.vel.addScaledVector(n, -s.vel.dot(n));
  }

  function hitObstacle(obstacles) {
    for (const o of obstacles) {
      if (Math.abs(s.pos.z - o.z) > 2) continue;
      const dx = s.pos.x - o.x, dz = s.pos.z - o.z;
      if (dx * dx + dz * dz < (o.r + 0.4) * (o.r + 0.4)) return true;
    }
    return false;
  }

  function update(dt, obstacles, finishZ) {
    dt = Math.min(dt, 0.05);
    if (s.toastT > 0) s.toastT -= dt; else s.toast = '';
    if (s.hurt > 0) s.hurt -= dt;     // i-frames so you can't loop-bail on a tree
    if (s.finished) { updateSpray(dt); updateCamera(dt); return; }

    // ---------- BAIL (tumble, no control) ----------
    if (s.bailing > 0) {
      s.bailing -= dt;
      s.spin += dt * 7; s.flip += dt * 4;
      s.vel.y -= G * dt;
      s.pos.addScaledVector(s.vel, dt);
      const gy = height(s.pos.x, s.pos.z);
      if (s.pos.y < gy) { s.pos.y = gy; s.vel.y = 0; s.vel.multiplyScalar(0.88); }
      if (s.bailing <= 0) {
        s.spin = s.flip = s.roll = 0; groundQuat(group.quaternion);
        s.vel.z = Math.max(s.vel.z, 7);   // get going again so you slide clear
      }
      else {
        _qSpin.setFromAxisAngle(UP, s.spin); _qFlip.setFromAxisAngle(AX, s.flip);
        group.quaternion.copy(_qSpin).multiply(_qFlip);
      }
      group.position.copy(s.pos);
      updateSpray(dt); updateCamera(dt);
      return;
    }

    if (s.grounded) {
      // ---- charge jump: hold SPACE to load, release to pop ----
      if (s.keys[' ']) { s.charging = true; s.charge = Math.min(1, s.charge + dt / CHARGE_TIME); }
      else if (s.charging) {
        const p = s.charge; s.charging = false; s.charge = 0;
        s.vel.y += 6 + p * 15;      // more hangtime so rotations land
        startAir();
      }

      s.vel.y -= G * dt;

      if (s.grounded) {
        const boosting = K(['w', 'arrowup', 'shift']);
        const braking = K(['s', 'arrowdown']);
        let steer = 0;
        if (K(['a', 'arrowleft'])) steer -= 1;   // A/D were inverted — fixed
        if (K(['d', 'arrowright'])) steer += 1;

        const horiz = _v.set(s.vel.x, 0, s.vel.z);
        let speedH = horiz.length();
        if (steer && speedH > 0.4) {
          const ang = steer * TURN_RATE * dt;
          const c = Math.cos(ang), sn = Math.sin(ang);
          horiz.set(horiz.x * c - horiz.z * sn, 0, horiz.x * sn + horiz.z * c);
        }
        let fric = BASE_FRICTION + CARVE_FRICTION * Math.abs(steer);
        if (boosting) fric *= 0.35;
        if (s.charging) fric += 3;            // loading the pop scrubs a touch
        if (braking) fric += BRAKE_FRICTION;
        speedH = Math.min(MAX_SPEED, Math.max(0, horiz.length() - fric * dt));
        horiz.setLength(speedH);
        s.vel.x = horiz.x; s.vel.z = horiz.z;
        if (speedH > 0.3) s.heading = Math.atan2(s.vel.x, s.vel.z);

        // integrate + stick/launch
        s.pos.addScaledVector(s.vel, dt);
        const halfW = pisteHalf() + 8;
        const cx = centerX(s.pos.z);
        s.pos.x = Math.max(cx - halfW, Math.min(cx + halfW, s.pos.x));
        const gy = height(s.pos.x, s.pos.z);
        if (s.pos.y - gy > STICK) {
          startAir();                          // real lip → launch
        } else {
          s.pos.y = gy;                        // glue to the snow
          const nn = normal(s.pos.x, s.pos.z);
          const into = s.vel.dot(nn);
          if (into < 0) s.vel.addScaledVector(nn, -into);
          groundQuat(group.quaternion);
          if (speedH > 7 && (Math.abs(steer) > 0 || braking)) emitSpray(speedH / 11);
        }
      }
    } else {
      // ---------- airborne: tricks ----------
      s.vel.y -= G * dt;
      s.pos.addScaledVector(s.vel, dt);
      const gyAir = height(s.pos.x, s.pos.z);
      if (s.pos.y - gyAir > s.maxAir) s.maxAir = s.pos.y - gyAir;  // for big-air leniency
      if (K(['a', 'arrowleft'])) s.spin += AIR_SPIN * dt;
      if (K(['d', 'arrowright'])) s.spin -= AIR_SPIN * dt;
      if (K(['w', 'arrowup'])) s.flip += AIR_FLIP * dt;      // W = frontflip
      if (K(['s', 'arrowdown'])) s.flip -= AIR_FLIP * dt;    // S = backflip
      if (K(['q'])) s.roll -= AIR_ROLL * dt;
      if (K(['e'])) s.roll += AIR_ROLL * dt;
      s.holding = s.keys[' '] === true;
      if (s.holding) s.grabbed = true;
      airQuat(group.quaternion);
      s.trickText = nameTrick();

      if (s.pos.y <= gyAir) { s.pos.y = gyAir; land(); }
    }

    if (s.hurt <= 0 && hitObstacle(obstacles)) bailNow();
    if (s.pos.z >= finishZ) { s.finished = true; s.best = Math.max(s.best, s.score); s.toast = ''; }

    group.position.copy(s.pos);
    avatar.position.y = -0.1 - (s.holding ? 0.14 : 0) - (s.charging ? s.charge * 0.1 : 0);
    updateSpray(dt); updateCamera(dt);
  }

  function bailNow() {
    s.bailing = 1.5; s.hurt = 2.4; s.combo = 0; s.vel.multiplyScalar(0.2);
    s.toast = 'BAIL!'; s.toastT = 1.4; s.grounded = true; s.trickText = '';
  }

  const camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    const speed = Math.hypot(s.vel.x, s.vel.z);
    const targetYaw = speed > 2 ? Math.atan2(s.vel.x, s.vel.z) : s.heading;
    let d = targetYaw - s.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.camYaw += d * Math.min(1, dt * 3);
    const back = 8 + speed * 0.1, upH = 3.2 + speed * 0.03;
    camTarget.set(s.pos.x - Math.sin(s.camYaw) * back, s.pos.y + upH, s.pos.z - Math.cos(s.camYaw) * back);
    // On steep runs the slope behind you rises fast — keep the camera above the
    // snow at its own spot so it looks DOWN the hill instead of into it.
    camTarget.y = Math.max(camTarget.y, height(camTarget.x, camTarget.z) + 3);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    // Aim at the snow ahead so on steep runs the camera tilts down to follow the
    // hill (instead of staring out over the drop-off at the sky).
    const aX = s.pos.x + Math.sin(s.camYaw) * 7;
    const aZ = s.pos.z + Math.cos(s.camYaw) * 7;
    const aY = Math.min(s.pos.y + 1, height(aX, aZ) + 1.6);
    camera.lookAt(aX, aY, aZ);
    const targetFov = 60 + Math.min(24, speed * 0.65) + (K(['w', 'shift']) ? 6 : 0);
    s.camFov += (targetFov - s.camFov) * Math.min(1, dt * 3);
    if (Math.abs(camera.fov - s.camFov) > 0.1) { camera.fov = s.camFov; camera.updateProjectionMatrix(); }
  }

  function reset() {
    spawn();
    s.grounded = true; s.finished = false; s.bailing = 0;
    s.spin = s.flip = s.roll = 0; s.score = 0; s.combo = 0;
    s.charging = false; s.charge = 0; s.trickText = ''; s.toast = '';
  }

  return {
    group, update, reset,
    getHud: () => ({
      speed: Math.round(Math.hypot(s.vel.x, s.vel.z) * 2.2),
      score: s.score, best: s.best, combo: s.combo,
      trick: s.grounded ? '' : s.trickText, toast: s.toast,
      airborne: !s.grounded, bailing: s.bailing > 0, finished: s.finished,
      charge: s.charging ? s.charge : 0, maxAir: +s.maxAir.toFixed(1),
    }),
    getNetState: () => ({
      x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2),
      qx: +group.quaternion.x.toFixed(3), qy: +group.quaternion.y.toFixed(3),
      qz: +group.quaternion.z.toFixed(3), qw: +group.quaternion.w.toFixed(3),
      trick: s.finished ? '🏁 FINISHED' : (s.grounded ? '' : s.trickText),
      score: s.score,
    }),
    isFinished: () => s.finished,
  };
}
