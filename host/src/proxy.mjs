// proxy.mjs — the SEAM where the P2P transport plugs in.
//
// Today this is a plain TCP forwarder: it listens on `listenPort` and pipes every
// byte to the local Minecraft server (`targetPort`). That already proves the
// "attach a server to an external endpoint" mechanic on one machine.
//
// TOMORROW: the host doesn't connect to a local target — instead each incoming
// stream is carried over the direct P2P link to the friend. The replacement is
// localised to ONE function (`openUpstream`), because everything else — Minecraft,
// the registry, the UI — only ever sees this seam, never the transport.

import net from 'node:net';

/**
 * @param {object} opts
 * @param {number} opts.listenPort  port this proxy accepts connections on
 * @param {number} opts.targetPort  the Minecraft server's local port
 * @param {string} [opts.targetHost]
 * @returns {import('node:net').Server}
 */
export function startProxy({ listenPort, targetPort, targetHost = '127.0.0.1' }) {
  const server = net.createServer((client) => {
    // === SEAM ===
    // Local mode: open a socket to the Minecraft server.
    // P2P mode (future): return a duplex stream backed by the WebRTC/UDP link.
    const upstream = openUpstream(targetHost, targetPort);

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

  server.listen(listenPort);
  return server;
}

/** The only thing that changes when we go from local proxy -> real P2P transport. */
function openUpstream(host, port) {
  return net.connect(port, host);
}
