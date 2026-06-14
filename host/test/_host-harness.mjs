// _host-harness.mjs — host side of the live Firestore integration test, run as its
// own process (separate native WebRTC instance from the connector).

import net from 'node:net';
import { startHostP2P } from '../src/p2p.mjs';

const ROOM = process.env.ZMC_ROOM;
const MC_PORT = Number(process.env.ZMC_MC_PORT ?? 25565);
const EXPECTED = process.env.ZMC_EXPECTED ?? 'OK';

const mc = net.createServer((s) => s.on('data', () => s.write(EXPECTED)));
mc.listen(MC_PORT, '127.0.0.1', () => {
  startHostP2P({ room: ROOM, targetPort: MC_PORT });
  console.log('HOST_HARNESS_READY');
});
