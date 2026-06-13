// p2p.mjs — host side of the direct P2P link.
//
// Watches the backend for friends trying to connect to this room, and for each one
// spins up a WebRTC answerer that bridges the friend's DataChannels straight to the
// local Minecraft server. No relay — game packets go friend PC <-> host PC.

import dc from 'node-datachannel';
import { hostSide } from '../../shared/webrtcBridge.mjs';
import { backendSignaling, pollPendingSessions } from '../../shared/signalingClient.mjs';

export function startHostP2P({ room, targetPort, apiBase }) {
  const conns = [];

  const watcher = pollPendingSessions({
    apiBase,
    room,
    onSession(session) {
      const signaling = backendSignaling({ apiBase, room, session, role: 'host' });
      const pc = hostSide(dc, { targetPort, signaling }); // wires signaling internally
      conns.push({ session, pc, signaling });
    },
  });

  return {
    stop() {
      watcher.stop();
      for (const c of conns) {
        c.signaling.stop();
        try { c.pc.close(); } catch { /* already closed */ }
      }
    },
  };
}
