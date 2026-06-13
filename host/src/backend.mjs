// backend.mjs — the host app's thin client for the ZenithMC API (api.zenithurl.com).
//
// The host app NEVER holds Firebase credentials (it ships to strangers' PCs). It
// just POSTs tiny status updates to our backend, which is the only thing that
// writes Firestore. Endpoint is overridable for local dev via ZMC_API.

const BASE = process.env.ZMC_API ?? 'https://api.zenithurl.com';

async function post(path, body) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false; // backend down should never crash the host app
  }
}

export const backend = {
  /** Publish or refresh a live room. */
  publish(room, { endpoint, motd, version, playerCount = 0, owner = 'anonymous', isPrivate = false }) {
    return post('/sync', {
      subdomain: room,
      status: 'online',
      endpoint,
      motd,
      version,
      players: playerCount,
      user_id: owner,
      is_private: isPrivate,
    });
  },

  /** Update just the live player count. */
  players(room, count) {
    return post('/sync', { subdomain: room, status: 'online', players: count });
  },

  /** Take the room offline. */
  takedown(room) {
    return post('/sync', { subdomain: room, status: 'offline' });
  },

  /** Stream a completed player session for admin analytics. */
  session(record) {
    return post('/session', record);
  },
};
