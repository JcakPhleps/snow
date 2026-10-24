import * as THREE from 'three';
import { LEVELS, buildMountain } from './mountain.js';
import { createRider } from './rider.js';
import { createRemotes } from './remotes.js';
import { onUser, signInGuest, getUid, deleteMe } from './firebase.js';
import { joinMountain, listenRiders, sendChat, listenChat } from './net.js';
import { playMenu, playGame, toggleMute, isMuted } from './music.js';

// ---------------------------------------------------------------------------
// MAIN — renderer/scene, menu flow (title → level select → run), level
// switching, per-level sky, music, and the game loop + netcode glue.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
const ps2Ratio = () => Math.min(window.devicePixelRatio, 1) * 0.65;
renderer.setPixelRatio(ps2Ratio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe8ff);
scene.fog = new THREE.Fog(0xbfe8ff, 60, 240);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 10, -10);

const ambient = new THREE.AmbientLight(0xcfe4ff, 1.1); scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x6a7a8a, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
sun.position.set(-40, 80, -20); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.far = 300;
scene.add(sun); scene.add(sun.target);

// ---- ambient snowfall ----
const SNOW_N = 500;
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(SNOW_N * 3);
for (let i = 0; i < SNOW_N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 120;
  snowPos[i * 3 + 1] = Math.random() * 60;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowfall = new THREE.Points(snowGeo, new THREE.PointsMaterial({
  color: 0xffffff, size: 0.35, transparent: true, opacity: 0.8, depthWrite: false,
}));
snowfall.frustumCulled = false; scene.add(snowfall);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(ps2Ratio());
  renderer.setSize(innerWidth, innerHeight);
});

const $ = (id) => document.getElementById(id);

// ---- title: name + board color ----
const PALETTE = ['#ff5c8a', '#4fd6e6', '#7cf0b4', '#ffd166', '#b084ff', '#ff8c42', '#ffffff', '#1a1a2e'];
let boardColor = PALETTE[0];
const swatches = $('color-swatches');
PALETTE.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'color-dot' + (i === 0 ? ' sel' : '');
  b.style.background = c;
  b.onclick = () => {
    boardColor = c;
    swatches.querySelectorAll('.color-dot').forEach((d) => d.classList.remove('sel'));
    b.classList.add('sel');
  };
  swatches.appendChild(b);
});

let riderName = '';
async function dropIn() {
  playMenu();   // kick off audio within the click gesture (autoplay policies)
  riderName = ($('name-input').value || '').trim().replace(/[^\w ]/g, '').slice(0, 16)
    || 'rider' + Math.floor(Math.random() * 999);
  $('play-btn').disabled = true;
  $('title-error').textContent = 'connecting…';
  try { await signInGuest(); } catch (e) { $('title-error').textContent = 'offline — riding solo'; }
  if (getUid()) {
    netHandle = joinMountain(riderName, boardColor);
    listenChat(renderChat);
    listenRiders(onRiders);
  }
  $('title').classList.add('hidden');
  showLevelSelect();
}
$('play-btn').onclick = dropIn;
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') dropIn(); });

// ---- level select ----
const grid = $('level-grid');
LEVELS.forEach((lv) => {
  const card = document.createElement('button');
  card.className = 'level-card';
  card.innerHTML = `<span class="num">${lv.id}</span>
    <div class="lv-name">${lv.name}</div><div class="lv-blurb">${lv.blurb}</div>`;
  card.onclick = () => startLevel(lv.id);
  grid.appendChild(card);
});
function showLevelSelect() {
  $('hud').classList.add('hidden');
  $('finish').classList.add('hidden');
  $('level-select').classList.remove('hidden');
  playMenu();
}

// ---- level / game state ----
let rider = null, mountainRoot = null, currentLevelId = null, levelMeta = null;
let netHandle = null, lastSent = 0, lastCombo = 0;

function applyLook(level) {
  const sky = new THREE.Color(level.sky);
  renderer.setClearColor(sky);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky.clone(), level.fog[0], level.fog[1]);
  const night = level.id === 5;
  ambient.intensity = night ? 0.55 : 1.1; ambient.color.set(night ? 0x3a4668 : 0xcfe4ff);
  hemi.intensity = night ? 0.3 : 0.7;
  sun.intensity = night ? 0.45 : 1.5; sun.color.set(night ? 0x8fa0d0 : 0xfff4e0);
  snowfall.material.color.set(night ? 0xcfe0ff : 0xffffff);
}

function startLevel(id) {
  currentLevelId = id;
  if (mountainRoot) {
    scene.remove(mountainRoot);
    mountainRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const built = buildMountain(scene, id);
  mountainRoot = built.root;
  levelMeta = built;
  applyLook(built.level);

  if (!rider) rider = createRider(scene, camera, boardColor);
  rider.reset();   // spawn using the new level's terrain (buildMountain set it)

  $('level-select').classList.add('hidden');
  $('finish').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('level-pill').textContent = built.level.name;
  playGame(true);   // fresh random track for each run
}

$('restart-btn').onclick = () => rider && rider.reset();
$('levels-btn').onclick = showLevelSelect;
$('finish-again').onclick = () => { $('finish').classList.add('hidden'); rider && rider.reset(); playGame(); };
$('finish-levels').onclick = showLevelSelect;

// mute toggles
const syncMute = () => { const m = isMuted(); $('mute-btn').style.opacity = m ? 0.4 : 1; $('mute-ls').style.opacity = m ? 0.4 : 1; };
$('mute-btn').onclick = () => { toggleMute(); syncMute(); };
$('mute-ls').onclick = () => { toggleMute(); syncMute(); };

// ---- multiplayer ----
function onRiders(riders) {
  if (rider) remotes.sync(riders, getUid(), currentLevelId);
  const n = Object.keys(riders).filter((u) =>
    Date.now() - (riders[u].ts || 0) < 15000 && riders[u].level === currentLevelId).length;
  $('riders-pill').textContent = `${Math.max(1, n)} on this run`;
}
const remotes = createRemotes(scene);

// ---- chat ----
const chatInput = $('chat-input'), chatLog = $('chat-log');
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && chatInput.value.trim()) {
    sendChat(riderName || 'rider', chatInput.value.trim());
    chatInput.value = ''; chatInput.blur();
  }
});
function renderChat(msgs) {
  chatLog.innerHTML = msgs.map((m) => `<div class="msg"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
  chatLog.scrollTop = chatLog.scrollHeight;
}
function esc(s) { return (s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

// ---- HUD ----
function updateHud(h) {
  window.__hud = h;   // read by tests; harmless
  $('score-big').textContent = h.score.toLocaleString();
  $('speed').innerHTML = `<b>${h.speed}</b><span>MPH</span>`;
  const comboEl = $('combo');
  if (h.combo > 1) { comboEl.textContent = 'COMBO x' + h.combo; comboEl.classList.remove('hidden'); }
  else comboEl.classList.add('hidden');
  if (h.combo !== lastCombo && h.combo > 1) { comboEl.style.animation = 'none'; void comboEl.offsetWidth; comboEl.style.animation = ''; }
  lastCombo = h.combo;

  const trickEl = $('trick');
  if (h.airborne && h.trick) { trickEl.textContent = h.trick; trickEl.classList.remove('hidden'); }
  else trickEl.classList.add('hidden');

  const toastEl = $('toast');
  if (h.toast) { toastEl.textContent = h.toast; toastEl.classList.toggle('bail', h.toast === 'BAIL!'); toastEl.classList.remove('hidden'); }
  else toastEl.classList.add('hidden');

  const chargeEl = $('charge');
  if (h.charge > 0) { chargeEl.classList.remove('hidden'); $('charge-fill').style.width = (h.charge * 100) + '%'; }
  else chargeEl.classList.add('hidden');

  if (h.finished && $('finish').classList.contains('hidden')) {
    $('finish-score').textContent = h.score.toLocaleString();
    $('finish').classList.remove('hidden');
    playMenu();
  }
}

// ---- loop ----
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();

  if (rider && levelMeta) {
    rider.update(dt, levelMeta.obstacles, levelMeta.finishZ);
    updateHud(rider.getHud());
    sun.position.set(rider.group.position.x - 40, 80, rider.group.position.z - 20);
    sun.target.position.copy(rider.group.position);
    const now = performance.now();
    if (netHandle && now - lastSent > 90) {
      netHandle.send({ ...rider.getNetState(), level: currentLevelId });
      lastSent = now;
    }
  }
  remotes.update(dt);

  const cp = camera.position;
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3 + 1] -= (8 + (i % 5)) * dt;
    if (snowPos[i * 3 + 1] < cp.y - 20) {
      snowPos[i * 3] = cp.x + (Math.random() - 0.5) * 120;
      snowPos[i * 3 + 1] = cp.y + 40;
      snowPos[i * 3 + 2] = cp.z + (Math.random() - 0.5) * 120;
    }
  }
  snowGeo.attributes.position.needsUpdate = true;

  renderer.render(scene, camera);
}
tick();

addEventListener('beforeunload', () => { if (netHandle) netHandle.leave(); deleteMe(); });
onUser(() => {});
