import * as THREE from 'three';

// ---------------------------------------------------------------------------
// BUBBLE — a chunky, deliberately low-res speech bubble that floats above an
// avatar's head. Drawn to a small canvas with nearest-neighbour filtering so
// it reads as pixelated, matching the PS2 look. Used by both the local player
// and remote avatars.
// ---------------------------------------------------------------------------

export function makeBubble(text) {
  const t = (text || '').slice(0, 40);
  const W = 128, H = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // body
  const bw = 120, bh = 44, bx = 4, by = 6;
  ctx.fillStyle = '#e8e6dd';
  ctx.strokeStyle = '#0a0a12';
  ctx.lineWidth = 4;
  rect(ctx, bx, by, bw, bh, 8);
  ctx.fill(); ctx.stroke();

  // tail (little triangle pointing down)
  ctx.beginPath();
  ctx.moveTo(W / 2 - 8, by + bh - 2);
  ctx.lineTo(W / 2, by + bh + 14);
  ctx.lineTo(W / 2 + 8, by + bh - 2);
  ctx.closePath();
  ctx.fillStyle = '#e8e6dd'; ctx.fill();
  ctx.strokeStyle = '#0a0a12'; ctx.stroke();

  // text (shrink to fit one line)
  ctx.fillStyle = '#0a0a12';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 20;
  do { ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`; size--; }
  while (ctx.measureText(t).width > bw - 14 && size > 8);
  ctx.fillText(t, W / 2, by + bh / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.7, 0.96, 1);
  sprite.position.y = 2.55;
  return sprite;
}

function rect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Attach a bubble to a group, replacing any existing one, auto-removing after
// `ms`. Returns the state object so the caller can track/cancel it.
export function attachBubble(group, text, holder = {}, ms = 8000) {
  if (holder.sprite) { group.remove(holder.sprite); clearTimeout(holder.timer); }
  const sprite = makeBubble(text);
  group.add(sprite);
  holder.sprite = sprite;
  holder.timer = setTimeout(() => {
    group.remove(sprite);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.dispose();
    holder.sprite = null;
  }, ms);
  return holder;
}
