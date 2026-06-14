// registry.js — the website's live view of the phone book, read straight from
// Firestore (push, no backend). Game traffic never touches any of this.

import { getDb, watchRoom, watchPublicRooms } from '../../shared/firestoreSignaling.mjs';

// Which room is this page for, from the subdomain?
//   barneysworld.mc.zenithurl.com -> "barneysworld"
//   mc.zenithurl.com / localhost   -> null (landing). Dev: append ?room=name
export function roomKeyFromHost(loc = window.location) {
  const fromQuery = new URLSearchParams(loc.search).get('room');
  if (fromQuery) return fromQuery;

  const host = loc.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1') return null;

  const parts = host.split('.');
  if (parts.length >= 4 && parts[1] === 'mc') return parts[0];
  return null;
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
