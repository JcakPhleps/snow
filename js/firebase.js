import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInAnonymously, deleteUser, signOut,
} from 'firebase/auth';
import { firebaseConfig } from './firebase-config.js';

// ---------------------------------------------------------------------------
// FIREBASE — SNOW is zero-friction: everyone rides as an anonymous user so you
// can drop into the shared mountain instantly. The uid is the rider id used by
// the realtime layer (net.js). No email/password, no Firestore — just Auth +
// Realtime Database presence under the `snow/` subtree.
// ---------------------------------------------------------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export { app, auth };

let currentUser = null;
const listeners = [];
onAuthStateChanged(auth, (u) => { currentUser = u; listeners.forEach((cb) => cb(u)); });

export function onUser(cb) { listeners.push(cb); cb(currentUser); }
export function getUid() { return currentUser ? currentUser.uid : null; }
export function signInGuest() { return signInAnonymously(auth); }
export function deleteMe() { return currentUser ? deleteUser(currentUser).catch(() => {}) : Promise.resolve(); }
export function logOut() { return signOut(auth); }
