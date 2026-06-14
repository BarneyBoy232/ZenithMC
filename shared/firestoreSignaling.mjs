// firestoreSignaling.mjs — rooms + WebRTC signaling over Firestore (push-based).
//
// Replaces the polling backend: host, connector and website all talk to Firestore
// directly. Realtime listeners (onSnapshot) push the handshake, so there's no
// always-on server to host. Firestore only carries tiny text — never game data.

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, initializeFirestore, doc, setDoc, onSnapshot, collection, query, where,
  addDoc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { firebaseConfig, SUBPROJECT } from './firebaseConfig.mjs';

let _db;
export function getDb() {
  if (!_db) {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    // In Node (host/connector) the default WebChannel transport is flaky; long
    // polling is reliable. The browser uses the default transport.
    _db = typeof window === 'undefined'
      ? initializeFirestore(app, { experimentalForceLongPolling: true })
      : getFirestore(app);
  }
  return _db;
}

const sigId = (room, session) => `sig_${room}_${session}`;

// ---- rooms (the phone book) ----
export function publishRoom(db, room, data) {
  return setDoc(
    doc(db, SUBPROJECT, `room_${room}`),
    { kind: 'room', room, online: true, updatedAt: serverTimestamp(), ...data },
    { merge: true },
  );
}
export function takedownRoom(db, room) {
  return setDoc(
    doc(db, SUBPROJECT, `room_${room}`),
    { online: false, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
export function watchRoom(db, room, cb) {
  return onSnapshot(doc(db, SUBPROJECT, `room_${room}`), (snap) =>
    cb(snap.exists() ? snap.data() : { room, online: false }));
}
export function watchPublicRooms(db, cb) {
  const q = query(collection(db, SUBPROJECT), where('kind', '==', 'room'), where('online', '==', true));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}
export function writeSession(db, record) {
  return addDoc(collection(db, SUBPROJECT), { kind: 'session', ...record, at: serverTimestamp() });
}

// ---- WebRTC signaling (one doc per friend<->host connection) ----
// Provides the { send, onRecv, stop } shape webrtcBridge expects. Messages are
// stored as JSON strings in role arrays; readers apply new ones, SDP before ICE.
function makeSignaling(db, room, session, role) {
  const ref = doc(db, SUBPROJECT, sigId(room, session));
  const other = role === 'friend' ? 'host' : 'friend';
  let applied = 0;
  let cb = null;
  let unsub = null;
  return {
    send(msg) {
      return setDoc(ref, {
        kind: 'signal', room, session,
        [`has_${role}`]: true,
        [role]: arrayUnion(JSON.stringify(msg)),
      }, { merge: true });
    },
    onRecv(fn) {
      cb = fn;
      unsub = onSnapshot(ref, (snap) => {
        const data = snap.data() || {};
        const msgs = (data[other] || []).map((s) => JSON.parse(s));
        const fresh = msgs.slice(applied);
        applied = msgs.length;
        fresh.sort((a, b) => (b.sdp ? 1 : 0) - (a.sdp ? 1 : 0));
        for (const m of fresh) cb && cb(m);
      });
    },
    stop() { if (unsub) unsub(); },
  };
}

export function friendSignaling(db, room, session) {
  return makeSignaling(db, room, session, 'friend');
}

// Host watches for friends connecting to its room; calls onSession once per session.
export function hostWatch(db, room, onSession) {
  const seen = new Set();
  const q = query(collection(db, SUBPROJECT), where('kind', '==', 'signal'), where('room', '==', room));
  const unsub = onSnapshot(q, (snap) => {
    snap.docs.forEach((d) => {
      const s = d.data().session;
      if (s && !seen.has(s)) {
        seen.add(s);
        onSession(s, makeSignaling(db, room, s, 'host'));
      }
    });
  });
  return { stop: () => unsub() };
}
