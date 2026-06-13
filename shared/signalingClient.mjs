// signalingClient.mjs — exchanges the WebRTC handshake through the backend /signal
// mailbox. Carries only setup text (SDP + ICE), never game data. Provides the
// { send, onRecv } interface that webrtcBridge expects, backed by HTTP polling.

const POLL_MS = 300;

/**
 * One signaling channel for a single friend<->host connection.
 * @param role  the CALLER's role ('host' | 'friend'); we deliver the other side's msgs.
 */
export function backendSignaling({ apiBase, room, session, role }) {
  let applied = 0; // how many of the other side's messages we've delivered
  let cb = null;
  let timer = null;
  let stopped = false;

  const url = `${apiBase}/signal?room=${encodeURIComponent(room)}&session=${encodeURIComponent(session)}&role=${role}`;

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const { messages } = await res.json();
        const fresh = messages.slice(applied);
        applied = messages.length;
        // Deliver any SDP before ICE candidates (setRemoteDescription must precede
        // addRemoteCandidate), regardless of arrival order.
        fresh.sort((a, b) => (b.sdp ? 1 : 0) - (a.sdp ? 1 : 0));
        for (const m of fresh) cb && cb(m);
      }
    } catch {
      /* transient — keep polling */
    }
    if (!stopped) timer = setTimeout(poll, POLL_MS);
  }

  return {
    send(msg) {
      return fetch(`${apiBase}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, session, role, msg }),
      }).catch(() => {});
    },
    onRecv(fn) { cb = fn; if (!timer) poll(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}

/** Host-side: watch for new sessions (friends trying to connect) on a room. */
export function pollPendingSessions({ apiBase, room, onSession }) {
  const seen = new Set();
  let stopped = false;
  let timer = null;

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(`${apiBase}/signal/pending?room=${encodeURIComponent(room)}`);
      if (res.ok) {
        const { sessions } = await res.json();
        for (const s of sessions) {
          if (!seen.has(s)) { seen.add(s); onSession(s); }
        }
      }
    } catch {
      /* transient */
    }
    if (!stopped) timer = setTimeout(poll, POLL_MS);
  }

  poll();
  return { stop() { stopped = true; clearTimeout(timer); } };
}
