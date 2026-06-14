#!/usr/bin/env node
// connector — the small helper a friend downloads ONCE.
//
// It dials the host directly over WebRTC (NAT hole-punched via STUN), then exposes a
// local address Minecraft connects to. Game packets go straight friend PC <-> host PC.
// localhost is only the on-machine handoff — never the network path. If 25565 is busy
// we grab the next free port and tell the friend what to paste.

import net from 'node:net';
import crypto from 'node:crypto';
import dc from 'node-datachannel';
import { friendSide } from '../../shared/webrtcBridge.mjs';
import { getDb, friendSignaling } from '../../shared/firestoreSignaling.mjs';

const ROOM = process.env.ZMC_ROOM;
const PREFERRED_LOCAL = Number(process.env.ZMC_LOCAL_PORT ?? 25565);

function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred) {
  for (let p = preferred; p < preferred + 50; p++) {
    if (await isFree(p)) return p;
  }
  throw new Error('No free local port found');
}

export async function startConnector({ room = ROOM, preferredLocal = PREFERRED_LOCAL } = {}) {
  if (!room) throw new Error('No room specified (set ZMC_ROOM or pass { room }).');

  const session = crypto.randomUUID();
  const signaling = friendSignaling(getDb(), room, session);
  const friend = friendSide(dc, { signaling }); // creates the offer + wires signaling

  await new Promise((resolve, reject) => {
    friend.pc.onStateChange((st) => {
      if (st === 'connected') resolve();
      if (st === 'failed' || st === 'closed') reject(new Error(`P2P ${st}`));
    });
    setTimeout(() => reject(new Error('P2P connect timeout')), 20000);
  });

  const localPort = await findFreePort(preferredLocal);
  const server = net.createServer((sock) => friend.attach(sock));
  await new Promise((r) => server.listen(localPort, '127.0.0.1', r));

  return { localPort, session, server, signaling, friend };
}

// Run directly (not when imported by a test)
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { localPort } = await startConnector();
    console.log('ZenithMC connector connected (direct P2P).');
    console.log(`👉 Paste this into Minecraft:  localhost:${localPort}`);
  } catch (e) {
    console.error('Could not establish a direct connection:', e.message);
    process.exit(1);
  }
}
