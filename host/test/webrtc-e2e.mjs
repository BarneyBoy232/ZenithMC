// webrtc-e2e.mjs — proves a Minecraft TCP stream survives the full WebRTC P2P path.
//
//   Minecraft client -> connector listener -> DataChannel (WebRTC) -> host -> MC server
//
// Signaling here is in-process (production swaps it for the backend Firestore mailbox).
// Run: npm run test:p2p   (from host/)
//
// This does NOT prove <50ms latency — that needs two real machines across the
// internet (Stage 4). It proves the transport + bridge are correct.

import net from 'node:net';
import { EventEmitter } from 'node:events';
import dc from 'node-datachannel';
import { hostSide, friendSide } from '../../shared/webrtcBridge.mjs';

function signalingPair() {
  const a = new EventEmitter();
  const b = new EventEmitter();
  return [
    { send: (m) => setImmediate(() => b.emit('m', m)), onRecv: (cb) => a.on('m', cb) },
    { send: (m) => setImmediate(() => a.emit('m', m)), onRecv: (cb) => b.on('m', cb) },
  ];
}

const FAKE_MC_PORT = 25565;
const CONNECTOR_PORT = 25599;
const EXPECTED = 'MC_REPLY_VIA_WEBRTC';

async function main() {
  const [sigHost, sigFriend] = signalingPair();

  const mc = net.createServer((s) => s.on('data', () => s.write(EXPECTED)));
  await new Promise((r) => mc.listen(FAKE_MC_PORT, '127.0.0.1', r));

  hostSide(dc, { targetPort: FAKE_MC_PORT, signaling: sigHost });

  const friend = friendSide(dc, { signaling: sigFriend });
  await new Promise((res, rej) => {
    friend.pc.onStateChange((st) => st === 'connected' && res());
    setTimeout(() => rej(new Error('p2p connect timeout')), 12000);
  });

  const listener = net.createServer((sock) => friend.attach(sock));
  await new Promise((r) => listener.listen(CONNECTOR_PORT, '127.0.0.1', r));

  const reply = await new Promise((res, rej) => {
    const c = net.connect(CONNECTOR_PORT, '127.0.0.1');
    let buf = '';
    c.on('connect', () => c.write('LOGIN_PACKET'));
    c.on('data', (d) => { buf += d; res(buf); });
    c.on('error', rej);
    setTimeout(() => rej(new Error('no reply')), 8000);
  });

  const ok = reply === EXPECTED;
  console.log(`P2P link: connected | reply: ${reply} | pass: ${ok}`);
  // NOTE: deliberately NOT calling dc.cleanup() — its native teardown segfaults on
  // exit in this lib version. Letting the process exit tears everything down safely.
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
