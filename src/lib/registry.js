// registry.js — the website's read-only view of the live "phone book".
//
// This is the ONLY file that knows where room data comes from. Today it reads the
// existing zenithurl API (and supports a local mock for dev). Swapping to Firebase
// Realtime DB later means editing only `fetchRoom` / `fetchAllRooms` here — no page
// component changes. The website NEVER touches game traffic; it reads tiny text.

const API = 'https://api.zenithurl.com';

/**
 * Work out which room this page is for, from the subdomain.
 *   barneysworld.mc.zenithurl.com  -> "barneysworld"
 *   mc.zenithurl.com / zenithurl.com / localhost -> null  (show landing page)
 * Dev override: append ?room=barneysworld to any URL.
 */
export function roomKeyFromHost(loc = window.location) {
  const fromQuery = new URLSearchParams(loc.search).get('room');
  if (fromQuery) return fromQuery;

  const host = loc.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host === '127.0.0.1') return null;

  const parts = host.split('.');
  // <room>.mc.zenithurl.com  => 4 parts, second label is "mc"
  if (parts.length >= 4 && parts[1] === 'mc') return parts[0];
  return null;
}

function normalize(s) {
  return {
    room: s.name ?? s.room,
    online: s.online ?? true,
    // What the friend ultimately pastes is shown by their connector; the registry
    // record carries the P2P endpoint id the connector dials.
    address: s.address ?? null,
    motd: s.motd ?? null,
    version: s.version ?? null,
    playerCount: s.playerCount ?? s.players?.length ?? 0,
    players: s.players ?? [],
  };
}

/** Look up a single room. Returns `{ online:false }` if not found/unreachable. */
export async function fetchRoom(room) {
  try {
    const res = await fetch(`${API}/room/${encodeURIComponent(room)}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return data.online ? normalize(data) : { room, online: false };
  } catch {
    return { room, online: false, error: true };
  }
}

/** List every live room (used by the landing page's network panel). */
export async function fetchAllRooms() {
  try {
    const res = await fetch(`${API}/live-servers`);
    if (!res.ok) throw new Error(String(res.status));
    const list = await res.json();
    return (list || []).map(normalize);
  } catch {
    return null; // null = network error (distinct from empty list)
  }
}
