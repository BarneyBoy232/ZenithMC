#!/usr/bin/env node
// connector — the small helper a friend downloads ONCE.
//
// It exposes a local address (localhost:25565) that Minecraft connects to, and
// forwards every connection over the direct P2P link to the host. Minecraft thinks
// it's talking to a local server; it's really talking straight to the host's PC.
//
// PORTS: localhost is only the on-machine handoff, never the network path. If 25565
// is busy (friend runs their own server) we grab the next free port and tell them
// exactly what to paste.
//
// TRANSPORT: `openP2P` is the single seam. Today (loopback) it dials the host's
// endpoint over TCP so the whole chain is testable on one machine. The real build
// swaps ONLY this function for a WebRTC/UDP hole-punched stream — nothing else moves.

import net from 'node:net';

// In production these come from the registry lookup: room name -> host P2P endpoint.
const HOST = process.env.ZMC_HOST ?? '127.0.0.1';
const HOST_PORT = Number(process.env.ZMC_HOST_PORT ?? 26565);
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

/** THE SEAM: open a stream to the host. Loopback today, WebRTC hole-punch tomorrow. */
function openP2P(host, port) {
  return net.connect(port, host);
}

export async function startConnector({ host = HOST, hostPort = HOST_PORT, preferredLocal = PREFERRED_LOCAL } = {}) {
  const localPort = await findFreePort(preferredLocal);

  const server = net.createServer((client) => {
    const upstream = openP2P(host, hostPort);
    client.pipe(upstream);
    upstream.pipe(client);
    const teardown = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', teardown);
    upstream.on('error', teardown);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });

  await new Promise((resolve) => server.listen(localPort, '127.0.0.1', resolve));
  return { localPort, server };
}

// Run directly (not when imported by a test)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { localPort } = await startConnector();
  console.log('ZenithMC connector running.');
  console.log(`👉 Paste this into Minecraft:  localhost:${localPort}`);
}
