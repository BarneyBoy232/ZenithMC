// firestore-e2e.mjs — full integration test over REAL Firestore signaling.
//
//   host P2P watcher  +  connector, signaling via Firestore (no backend)
//   => Minecraft client -> connector -> WebRTC -> host -> MC server -> reply
//
// Spawns a host-harness child (its own native WebRTC instance), then drives the
// connector + a client from here. Hits the live ZenithURL Firestore.
// Run: npm run test:firestore (from host/). Needs network + open/permissive rules.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startConnector } from '../../connector/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOM = `itest-${Date.now()}`;
const EXPECTED = 'MC_REPLY_VIA_FIRESTORE';

const children = [];
const cleanup = () => children.forEach((c) => { try { c.kill(); } catch { /* gone */ } });
process.on('exit', cleanup);

async function main() {
  const host = spawn('node', ['test/_host-harness.mjs'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, ZMC_ROOM: ROOM, ZMC_MC_PORT: '25565', ZMC_EXPECTED: EXPECTED },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.push(host);
  await new Promise((res, rej) => {
    host.stdout.on('data', (d) => d.toString().includes('HOST_HARNESS_READY') && res());
    setTimeout(() => rej(new Error('host harness timeout')), 15000);
  });

  const { localPort } = await startConnector({ room: ROOM, preferredLocal: 25599 });

  const reply = await new Promise((res, rej) => {
    const c = net.connect(localPort, '127.0.0.1');
    let buf = '';
    c.on('connect', () => c.write('LOGIN'));
    c.on('data', (d) => { buf += d; res(buf); });
    c.on('error', rej);
    setTimeout(() => rej(new Error('no reply through chain')), 20000);
  });

  const ok = reply === EXPECTED;
  console.log(`room ${ROOM} | connector localhost:${localPort} | reply: ${reply} | pass: ${ok}`);
  cleanup();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FAIL:', e.message); cleanup(); process.exit(1); });
