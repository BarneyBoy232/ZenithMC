// registry.js — the website's live view of the phone book, read straight from
// Firestore (push, no backend). Game traffic never touches any of this.

import { getDb, watchRoom, watchPublicRooms, watchAllRooms, watchSessions, deleteRoom } from '../../shared/firestoreSignaling.mjs';
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

// A host heartbeats every 60s; if we haven't heard from it in this window it has
// stopped/crashed/closed the app, so it's no longer really online.
const FRESH_MS = 150000;
// Offline servers stay on the public list this long after they were last seen,
// then drop off as stale (clears ghosts from servers that no longer exist).
const LISTING_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function normalize(s) {
  const lastSeen = s.updatedAt?.toMillis?.() ?? 0;
  return {
    room: s.room,
    online: !!s.online,
    lastSeen,
    live: !!s.online && Date.now() - lastSeen < FRESH_MS,
    motd: s.motd ?? null,
    version: s.version ?? null,
    playerCount: s.playerCount ?? 0,
    players: s.players ?? [],
  };
}

// Live subscription to one room. Returns an unsubscribe function.
export function subscribeRoom(room, cb) {
  return watchRoom(getDb(), room, (data) => {
    const r = normalize(data);
    cb({ ...r, online: r.live }); // a stale room reads as offline to visitors
  });
}

// Public bar: every public listing, live first. Offline servers stay visible
// (grayed on the site) — they only vanish when the host app delists them (folder
// deleted) or they're marked private. The timer re-checks freshness so a host
// that stops/crashes flips to offline even without a new snapshot.
export function subscribeRooms(cb) {
  let latest = [];
  const emit = () => cb(
    latest.map(normalize)
      .filter((r) => r.live || (Date.now() - r.lastSeen < LISTING_MAX_AGE))
      .sort((a, b) => (b.live - a.live) || (b.lastSeen - a.lastSeen)),
  );
  const unsub = watchPublicRooms(getDb(), (list) => { latest = list; emit(); });
  const timer = setInterval(emit, 15000);
  return () => { unsub(); clearInterval(timer); };
}

// Admin-only: permanently delete a room's listing (dead/ghost servers).
export function removeRoom(room) {
  return deleteRoom(getDb(), room);
}

// Admin-only: EVERY room ever created (active or not). `live` flags the active ones.
export function subscribeAllRooms(cb) {
  return watchAllRooms(getDb(), (list) => cb(list.map(normalize)));
}
export function subscribeSessions(cb) {
  return watchSessions(getDb(), (list) => cb(list));
}
