import * as THREE from 'three';
import { attachBubble } from './bubble.js';

// ---------------------------------------------------------------------------
// PLAYER
// A low-poly avatar with third-person orbit camera. WASD moves relative to the
// camera facing; dragging the pointer orbits. Movement is clamped to the room.
// This module intentionally knows nothing about build mode — main.js pauses
// player control while building.
// ---------------------------------------------------------------------------

export function createPlayer(scene, camera, canvas) {
  const avatar = buildAvatar();
  avatar.position.set(0, 0, 3);
  scene.add(avatar);
  const hand = avatar.getObjectByName('hand');

  const state = {
    keys: {},
    yaw: 0,          // camera orbit around avatar
    pitch: 0.35,
    dist: 6,
    dragId: null,   // pointerId currently orbiting the camera (multi-touch safe)
    lastX: 0,
    lastY: 0,
    enabled: true,        // movement (WASD)
    cameraControl: true,  // owns the camera (off when top-down mode drives it)
    sitting: false,       // seated on a couch/chair
    speed: 4,             // units / second
    mx: 0, my: 0,         // analog move axis from the mobile joystick (-1..1)
    bx: 5.5, bz: 5.5,     // half-extents of the current room (clamp)
  };

  function sit(worldPos, yaw) {
    state.sitting = true;
    // Sink the avatar so its lower body rests on the cushion.
    avatar.position.set(worldPos.x, Math.max(-0.1, worldPos.y - 0.55), worldPos.z);
    avatar.rotation.y = yaw;
  }
  function stand() {
    if (!state.sitting) return;
    state.sitting = false;
    avatar.position.y = 0;
  }

  function emote(name) { state.emote = name; state.emoteT = 0; }
  function setColor(hex) {
    if (!hex) return;
    avatar.traverse((o) => { if (o.isMesh && o.userData.body) o.material.color.set(hex); });
  }
  function updateEmote(dt) {
    if (!state.emote) return;
    state.emoteT += dt;
    const t = state.emoteT;
    if (state.emote === 'dance') {
      if (!state.sitting) avatar.position.y = Math.abs(Math.sin(t * 9)) * 0.18;
      avatar.rotation.y += dt * 6;
      if (t > 4) endEmote();
    } else if (state.emote === 'wave') {
      avatar.rotation.z = Math.sin(t * 11) * 0.2; // whole-body shake, like before
      if (hand) { hand.visible = true; hand.rotation.z = Math.sin(t * 13) * 0.7; }
      if (t > 1.8) endEmote();
    }
  }
  function endEmote() {
    avatar.rotation.z = 0;
    if (hand) { hand.visible = false; hand.rotation.z = 0; }
    if (!state.sitting) avatar.position.y = 0;
    state.emote = null;
  }

  // ---- Input ----
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
  });
  window.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!state.enabled || state.dragId !== null) return; // one finger owns the camera
    state.dragId = e.pointerId;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });
  const endDrag = (e) => { if (e.pointerId === state.dragId) state.dragId = null; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== state.dragId || !state.enabled) return; // ignore the joystick finger
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.yaw -= dx * 0.005;
    state.pitch = Math.max(0.05, Math.min(1.2, state.pitch + dy * 0.004));
  });

  function update(dt) {
    // Any movement input stands you up out of a seat first.
    const moving = state.keys['w'] || state.keys['a'] || state.keys['s'] || state.keys['d'] ||
      state.keys[' '] || Math.hypot(state.mx, state.my) > 0.2;
    if (state.sitting && moving) stand();

    if (state.enabled && !state.sitting) {
      // Movement basis from camera yaw
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
      const rightV = new THREE.Vector3(forward.z, 0, -forward.x);
      const move = new THREE.Vector3();
      if (state.keys['w']) move.sub(forward);
      if (state.keys['s']) move.add(forward);
      if (state.keys['a']) move.sub(rightV);
      if (state.keys['d']) move.add(rightV);
      // joystick (my: up = forward like W, mx: right = strafe like D)
      if (state.my) move.addScaledVector(forward, -state.my);
      if (state.mx) move.addScaledVector(rightV, state.mx);

      if (move.lengthSq() > 0) {
        if (move.length() > 1) move.normalize();   // clamp but keep analog magnitude
        avatar.position.addScaledVector(move, state.speed * dt);
        // face travel direction
        avatar.rotation.y = Math.atan2(move.x, move.z);
      }

      // clamp inside the current room (leave a small margin)
      avatar.position.x = Math.max(-state.bx, Math.min(state.bx, avatar.position.x));
      avatar.position.z = Math.max(-state.bz, Math.min(state.bz, avatar.position.z));
    }

    updateEmote(dt);

    // Camera follows avatar on an orbit — unless something else (top-down
    // build view) has taken control of the camera.
    if (!state.cameraControl) return;
    const target = avatar.position.clone().add(new THREE.Vector3(0, 1, 0));
    const cx = Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cz = Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist;
    const cy = Math.sin(state.pitch) * state.dist;
    camera.position.set(target.x + cx, target.y + cy, target.z + cz);
    camera.lookAt(target);
  }

  return {
    avatar,
    update,
    setEnabled: (v) => { state.enabled = v; if (!v) state.dragId = null; },
    setCameraControl: (v) => { state.cameraControl = v; },
    sit,
    stand,
    emote,
    setColor,
    setMoveAxis: (x, y) => { state.mx = x; state.my = y; },
    setPosition: (x, z) => { state.sitting = false; avatar.position.set(x, 0, z); },
    setBounds: (w, d) => { state.bx = w / 2 - 0.5; state.bz = d / 2 - 0.5; },
    isSitting: () => state.sitting,
    showBubble: (text) => attachBubble(avatar, text, (state.bubble ||= {})),
    getYaw: () => state.yaw,
  };
}

// Exported so remote players (net avatars) can be built the same way, tinted
// by a per-person body color.
export function buildAvatar(bodyColor = 0x7cf0c8) {
  const g = new THREE.Group();
  const mk = (geo, color) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    m.castShadow = true;
    return m;
  };
  const body = mk(new THREE.CapsuleGeometry(0.25, 0.5, 2, 6), bodyColor);
  body.position.y = 0.75;
  body.name = 'body';
  body.userData.body = true; // body-colored (recolored by setColor)
  g.add(body);
  const head = mk(new THREE.IcosahedronGeometry(0.22, 0), 0xffd8a8);
  head.position.y = 1.4;
  g.add(head);
  const nose = mk(new THREE.BoxGeometry(0.08, 0.08, 0.12), 0xff5c8a);
  nose.position.set(0, 1.4, 0.22);
  g.add(nose);

  // No permanent arms. A little hand (palm + fingers) appears only while waving.
  const hand = new THREE.Group();
  hand.name = 'hand';
  hand.position.set(0.42, 1.5, 0.14);
  hand.visible = false;
  const palm = mk(new THREE.BoxGeometry(0.17, 0.15, 0.08), 0xffd8a8);
  hand.add(palm);
  for (let i = 0; i < 4; i++) {              // four fingers
    const f = mk(new THREE.BoxGeometry(0.032, 0.13, 0.06), 0xffd8a8);
    f.position.set(-0.06 + i * 0.04, 0.13, 0);
    hand.add(f);
  }
  const thumb = mk(new THREE.BoxGeometry(0.05, 0.032, 0.06), 0xffd8a8); // thumb
  thumb.position.set(-0.1, 0.0, 0);
  hand.add(thumb);
  g.add(hand);
  return g;
}
