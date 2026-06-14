// registry.js — the website's live view of the phone book, read straight from
// Firestore (push, no backend). Game traffic never touches any of this.

import { getDb, watchRoom, watchPublicRooms } from '../../shared/firestoreSignaling.mjs';
import { normalizeRoom, isValidRoom } from '../../shared/validate.mjs';

// Which room is this page for?
//   mc.zenithurl.com/barneysworld        -> "barneysworld"  (path form, what we use)
//   barneysworld.mc.zenithurl.com        -> "barneysworld"  (subdomain, future)
//   mc.zenithurl.com / localhost         -> null (landing). Dev: append ?room=name
export function roomKeyFromHost(loc = window.location) {
  const fromQuery = new URLSearchParams(loc.search).get('room');

  // Subdomain form (only works with a wildcard cert): <room>.mc.zenithurl.com
  const parts = loc.hostname.split('.');
  const sub = parts.length >= 4 && parts[1] === 'mc' ? parts[0] : null;

  // Path form: mc.zenithurl.com/<room> — free, no wildcard needed.
  const seg = loc.pathname.split('/').filter(Boolean)[0];

  const candidate = normalizeRoom(fromQuery || sub || seg);
  return isValidRoom(candidate) ? candidate : null;
}

function normalize(s) {
  return {
    room: s.room,
    online: !!s.online,
    motd: s.motd ?? null,
    version: s.version ?? null,
    playerCount: s.playerCount ?? 0,
    players: s.players ?? [],
  };
}

// Live subscription to one room. Returns an unsubscribe function.
export function subscribeRoom(room, cb) {
  return watchRoom(getDb(), room, (data) => cb(normalize(data)));
}

// Live subscription to all online rooms (landing-page network panel).
export function subscribeRooms(cb) {
  return watchPublicRooms(getDb(), (list) => cb(list.map(normalize)));
}
