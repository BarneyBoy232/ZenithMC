// _host-harness.mjs — host side of the signaling integration test, run as its own
// process (so its native WebRTC instance is separate from the connector's).
// Stands up a fake Minecraft server and the real host P2P watcher.

import net from 'node:net';
import { startHostP2P } from '../src/p2p.mjs';

const API = process.env.ZMC_API;
const ROOM = process.env.ZMC_ROOM;
const MC_PORT = Number(process.env.ZMC_MC_PORT ?? 25565);
const EXPECTED = process.env.ZMC_EXPECTED ?? 'OK';

const mc = net.createServer((s) => s.on('data', () => s.write(EXPECTED)));
mc.listen(MC_PORT, '127.0.0.1', () => {
  startHostP2P({ room: ROOM, targetPort: MC_PORT, apiBase: API });
  console.log('HOST_HARNESS_READY');
});
