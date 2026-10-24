import { app, getUid } from './firebase.js';
import {
  getDatabase, ref, set, update, remove, onValue, push, onDisconnect,
} from 'firebase/database';

// ---------------------------------------------------------------------------
// NET — the realtime layer for SNOW. Everyone shares ONE seeded mountain, so
// world coordinates line up across clients and you see other riders bombing
// the same run beside you.
//
//   snow/riders/{uid}  -> live rider state (pos, facing, trick, score)
//   snow/chat/{pushId} -> mountain-wide chat
//
// Lives under the `snow/` subtree of the shared CRIBS Realtime Database so it
// needs no new project. getDatabase() is lazy so the app boots even if the DB
// URL isn't set yet.
// ---------------------------------------------------------------------------

let _db = null;
function rtdb() { if (!_db) _db = getDatabase(app); return _db; }

// Join the mountain. Returns { send(state), leave() }.
export function joinMountain(name, color) {
  const uid = getUid();
  const meRef = ref(rtdb(), `snow/riders/${uid}`);
  set(meRef, { name, color, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, trick: '', score: 0, ts: Date.now() });
  onDisconnect(meRef).remove();
  return {
    send(state) { update(meRef, { ...state, ts: Date.now() }); },
    leave() { remove(meRef); },
  };
}

// Subscribe to all riders. cb gets a map { uid: {name,color,x,y,z,ry,rx,rz,trick,score,ts} }.
export function listenRiders(cb) {
  return onValue(ref(rtdb(), 'snow/riders'), (snap) => cb(snap.val() || {}));
}

export function sendChat(name, text) {
  const t = (text || '').slice(0, 200);
  if (!t.trim()) return;
  return push(ref(rtdb(), 'snow/chat'), { uid: getUid(), name, text: t, ts: Date.now() });
}

// cb gets an array of {uid,name,text,ts} in chronological order (last 40).
export function listenChat(cb) {
  return onValue(ref(rtdb(), 'snow/chat'), (snap) => {
    const val = snap.val() || {};
    cb(Object.values(val).sort((a, b) => a.ts - b.ts).slice(-40));
  });
}
