// ---------------------------------------------------------------------------
// MUSIC — two shuffled playlists: menu tracks for the title / level-select
// screens, game tracks while you're riding. Browsers block autoplay until a
// user gesture, so playback is kicked off from the first click (DROP IN).
// Files live in music/menu and music/game (copied from the user's soundtrack).
// ---------------------------------------------------------------------------

const enc = (folder, file) => `music/${folder}/${encodeURIComponent(file)}`;

const MENU = [
  'BIOS - Zorrovian [Official Visualiser].mp3',
  'Lunch Break by Sol IX - GT NH Official Soundtrack Vol. 1.5.mp3',
].map((f) => enc('menu', f));

const GAME = [
  'Fresh air.mp3',
  "Intro - Arby's (PS1).mp3",
  'Level Select.mp3',
  'PS1 Breakcore Sunset Street Racer - Sol IX.mp3',
].map((f) => enc('game', f));

const audio = new Audio();
audio.preload = 'auto';
audio.volume = 0.55;
audio.addEventListener('ended', next);

let list = [], idx = 0, which = null, muted = false;

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function load() {
  if (!list.length) return;
  audio.src = list[idx];
  if (!muted) audio.play().catch(() => {});
}
function next() {
  if (!list.length) return;
  if (list.length > 1) {                 // jump to a different random track
    let n; do { n = (Math.random() * list.length) | 0; } while (n === idx);
    idx = n;
  }
  load();
}

function play(tracks, tag) {
  if (which === tag) { if (!muted && audio.paused) audio.play().catch(() => {}); return; }
  which = tag; list = shuffle(tracks); idx = 0; load();
}

export function playMenu() { play(MENU, 'menu'); }
export function playGame() { play(GAME, 'game'); }
export function setMuted(m) {
  muted = m; audio.muted = m;
  if (m) audio.pause(); else audio.play().catch(() => {});
}
export function toggleMute() { setMuted(!muted); return muted; }
export function isMuted() { return muted; }
