// signaling-e2e.mjs — full integration test of Steps 1-3.
//
//   real Flask backend (/signal mailbox)  +  real host P2P watcher  +  real connector
//   => Minecraft client -> connector -> WebRTC (signaled via backend) -> host -> MC server
//
// Spawns the backend and a host-harness child process, then drives the connector and a
// client from here. Self-contained: `npm run test:signaling` (from host/).
// Requires: Python + Flask installed, ports 5000/25565/25599 free.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { startConnector } from '../../connector/src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBSITE = join(__dirname, '..', '..');
const API = 'http://127.0.0.1:5000';
const ROOM = 'itest';
const EXPECTED = 'MC_REPLY_VIA_BACKEND';

const children = [];
const cleanup = () => children.forEach((c) => { try { c.kill(); } catch { /* gone */ } });
process.on('exit', cleanup);

async function waitForUrl(url, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`not up: ${url}`);
}

async function main() {
  // 1) backend
  children.push(spawn('python', ['api/api.py'], { cwd: WEBSITE, stdio: 'ignore' }));
  await waitForUrl(`${API}/health`);

  // 2) host harness (separate process => separate native WebRTC instance)
  const host = spawn('node', ['test/_host-harness.mjs'], {
    cwd: join(WEBSITE, 'host'),
    env: { ...process.env, ZMC_API: API, ZMC_ROOM: ROOM, ZMC_MC_PORT: '25565', ZMC_EXPECTED: EXPECTED },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  children.push(host);
  await new Promise((res, rej) => {
    host.stdout.on('data', (d) => d.toString().includes('HOST_HARNESS_READY') && res());
    setTimeout(() => rej(new Error('host harness timeout')), 10000);
  });

  // 3) connector dials via backend signaling + exposes a local port
  const { localPort } = await startConnector({ api: API, room: ROOM, preferredLocal: 25599 });

  // 4) Minecraft client through the whole chain
  const reply = await new Promise((res, rej) => {
    const c = net.connect(localPort, '127.0.0.1');
    let buf = '';
    c.on('connect', () => c.write('LOGIN'));
    c.on('data', (d) => { buf += d; res(buf); });
    c.on('error', rej);
    setTimeout(() => rej(new Error('no reply through chain')), 15000);
  });

  const ok = reply === EXPECTED;
  console.log(`connector localhost:${localPort} | reply: ${reply} | pass: ${ok}`);
  cleanup();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('FAIL:', e.message); cleanup(); process.exit(1); });
