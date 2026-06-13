// webrtcBridge.mjs — carries Minecraft's TCP stream over a WebRTC DataChannel.
//
// This is the REAL P2P transport. Game packets travel host PC <-> friend PC
// directly (after NAT hole-punching via STUN); nothing relays them.
//
// `dc` (the node-datachannel module) is INJECTED so this file works from either
// the host or connector package without bare-specifier resolution issues.
//
// `signaling` is a pluggable pair { send(msg), onRecv(cb) } that ferries the tiny
// SDP/ICE handshake between the two peers. In production that's the backend
// (Firestore mailbox); in tests it's an in-process channel. Either way it only
// carries setup text — never game data.

import net from 'node:net';

export const DEFAULT_ICE = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

function wireSignaling(pc, signaling) {
  pc.onLocalDescription((sdp, type) => signaling.send({ sdp, type }));
  pc.onLocalCandidate((cand, mid) => signaling.send({ cand, mid }));
  signaling.onRecv((m) => {
    if (m.sdp != null) pc.setRemoteDescription(m.sdp, m.type);
    else if (m.cand != null) pc.addRemoteCandidate(m.cand, m.mid);
  });
}

function sendBinary(channel, buf) {
  if (typeof channel.sendMessageBinary === 'function') channel.sendMessageBinary(buf);
  else channel.sendMessage(buf);
}

// Pipe one DataChannel <-> one TCP socket, buffering until the channel is open.
function bridge(channel, socket) {
  const pending = [];
  let open = channel.isOpen?.() ?? false;

  socket.on('data', (buf) => {
    if (open) sendBinary(channel, buf);
    else pending.push(buf);
  });
  channel.onOpen?.(() => {
    open = true;
    for (const buf of pending.splice(0)) sendBinary(channel, buf);
  });
  channel.onMessage((msg) => {
    socket.write(typeof msg === 'string' ? Buffer.from(msg) : Buffer.from(msg));
  });

  const close = () => {
    try { channel.close(); } catch { /* already closed */ }
    socket.destroy();
  };
  channel.onClosed?.(close);
  socket.on('close', close);
  socket.on('error', close);
}

/**
 * HOST side (answerer). Each DataChannel the friend opens becomes a fresh TCP
 * connection to the local Minecraft server.
 */
export function hostSide(dc, { iceServers = DEFAULT_ICE, targetPort, targetHost = '127.0.0.1', signaling }) {
  const pc = new dc.PeerConnection('zmc-host', { iceServers });
  wireSignaling(pc, signaling);
  pc.onDataChannel((channel) => bridge(channel, net.connect(targetPort, targetHost)));
  return pc;
}

/**
 * FRIEND side (offerer). Returns the peer connection plus `attach(socket)`, which
 * opens a new DataChannel for one Minecraft TCP connection and bridges it.
 */
export function friendSide(dc, { iceServers = DEFAULT_ICE, signaling }) {
  const pc = new dc.PeerConnection('zmc-friend', { iceServers });
  wireSignaling(pc, signaling);
  // An initial channel forces the offer/answer negotiation to start.
  pc.createDataChannel('control');
  return {
    pc,
    attach(socket) {
      bridge(pc.createDataChannel('mc'), socket);
    },
  };
}
