// p2p.mjs — host side of the direct P2P link.
//
// Watches Firestore for friends connecting to this room (push, no polling), and for
// each one spins up a WebRTC answerer that bridges the friend's DataChannels straight
// to the local Minecraft server. No relay — game packets go friend PC <-> host PC.

import dc from 'node-datachannel';
import { hostSide } from '../../shared/webrtcBridge.mjs';
import { getDb, hostWatch } from '../../shared/firestoreSignaling.mjs';

export function startHostP2P({ room, targetPort }) {
  const db = getDb();
  const conns = [];

  const watcher = hostWatch(db, room, (session, signaling) => {
    const pc = hostSide(dc, { targetPort, signaling }); // wires signaling internally
    conns.push({ session, pc, signaling });
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
