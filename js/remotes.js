import * as THREE from 'three';
import { buildAvatar } from './player.js';

// ---------------------------------------------------------------------------
// REMOTES — other riders on the mountain. State arrives at a low tick rate, so
// each remote lerps its position and slerps its orientation toward the latest
// target every frame. Each gets a board, a name tag, and a live trick label.
// ---------------------------------------------------------------------------

function makeTag(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 80;
  const ctx = canvas.getContext('2d');
  draw(ctx, text, sub);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.9, 0.6, 1);
  sprite.userData.redraw = (t, s2) => { draw(ctx, t, s2); tex.needsUpdate = true; };
  return sprite;
}
function draw(ctx, text, sub) {
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = 'rgba(10,20,30,0.78)';
  round(ctx, 8, 6, 240, 36, 10); ctx.fill();
  ctx.fillStyle = '#eaf6f4';
  ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 16), 128, 25);
  if (sub) {
    ctx.fillStyle = '#4fd6e6';
    ctx.font = 'bold 20px "Trebuchet MS", sans-serif';
    ctx.fillText(sub.slice(0, 22), 128, 60);
  }
}
function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRemotes(scene) {
  const map = new Map(); // uid -> { group, tag, pos, quat, trick }

  function build(color) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.09, 1.7),
      new THREE.MeshLambertMaterial({ color: 0x334, flatShading: true }),
    );
    board.position.y = 0.06;
    const av = buildAvatar(new THREE.Color(color || '#7cf0c8').getHex());
    av.position.y = -0.1; av.rotation.y = -0.5;
    g.add(board); g.add(av);
    return g;
  }

  return {
    sync(riders, selfUid, myLevel) {
      const seen = new Set();
      for (const [uid, r] of Object.entries(riders || {})) {
        if (uid === selfUid || !r) continue;
        if (Date.now() - (r.ts || 0) > 15000) continue;   // drop stale/ghosts
        if (myLevel != null && r.level !== myLevel) continue;  // only this run
        seen.add(uid);
        let e = map.get(uid);
        if (!e) {
          const group = build(r.color);
          const tag = makeTag(r.name || 'rider', r.trick);
          tag.position.y = 2.1; group.add(tag);
          group.position.set(r.x || 0, r.y || 0, r.z || 0);
          scene.add(group);
          e = { group, tag, pos: new THREE.Vector3(r.x, r.y, r.z), quat: new THREE.Quaternion(), trick: '', name: r.name };
          map.set(uid, e);
        }
        e.pos.set(r.x || 0, r.y || 0, r.z || 0);
        if (r.qw !== undefined) e.quat.set(r.qx || 0, r.qy || 0, r.qz || 0, r.qw);
        const label = r.trick || '';
        if (label !== e.trick) { e.trick = label; e.tag.userData.redraw(r.name || 'rider', label); }
      }
      for (const [uid, e] of map) {
        if (!seen.has(uid)) { scene.remove(e.group); map.delete(uid); }
      }
    },
    update(dt) {
      const k = Math.min(1, dt * 9);
      for (const [, e] of map) {
        e.group.position.lerp(e.pos, k);
        e.group.quaternion.slerp(e.quat, k);
      }
    },
    count() { return map.size; },
    clear() { for (const [, e] of map) scene.remove(e.group); map.clear(); },
  };
}
