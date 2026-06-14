#!/usr/bin/env node
// index.mjs — ZenithMC host app entry point.
//
// Usage:  node src/index.mjs <room-name> [--port 25565] [--mem 2048]
//
// End to end:
//   1. launches a Paper Minecraft server in host/servers/<room>/
//   2. publishes the room to Firestore (the phone book)
//   3. accepts direct P2P connections from friends -> bridges them to the server
//   4. streams player counts + completed sessions to Firestore (analytics)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MinecraftServer } from './mcServer.mjs';
import { SessionTracker } from './analytics.mjs';
import { startHostP2P } from './p2p.mjs';
import { getDb, publishRoom, takedownRoom, writeSession } from '../../shared/firestoreSignaling.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const [room, ...rest] = argv;
  const opts = { room, port: 25565, mem: 2048 };
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--port') opts.port = Number(rest[i + 1]);
    if (rest[i] === '--mem') opts.mem = Number(rest[i + 1]);
  }
  return opts;
}

async function main() {
  const { room, port, mem } = parseArgs(process.argv.slice(2));
  if (!room) {
    console.error('Usage: node src/index.mjs <room-name> [--port 25565] [--mem 2048]');
    process.exit(1);
  }

  const dir = join(ROOT, 'servers', room);
  const mc = new MinecraftServer({ name: room, dir, port, memoryMb: mem });
  const sessions = new SessionTracker();
  const db = getDb();
  let p2p = null;

  mc.on('log', (line) => process.stdout.write(`[mc] ${line}\n`));

  mc.on('ready', async () => {
    p2p = startHostP2P({ room, targetPort: port });
    await publishRoom(db, room, { motd: mc.motd, version: mc.version, playerCount: 0 });
    console.log(`\n✅ Room "${room}" is live (direct P2P).`);
    console.log(`   Share: mc.zenithurl.com/${room}\n`);
  });

  mc.on('player-join', async ({ name, count }) => {
    sessions.join(name, Date.now());
    console.log(`👤 ${name} joined  (${count} online)`);
    await publishRoom(db, room, { playerCount: count });
  });

  mc.on('player-leave', async ({ name, count }) => {
    const s = sessions.leave(name, Date.now());
    if (s) {
      console.log(`👋 ${name} left  (${count} online, played ${(s.durationMs / 60000).toFixed(1)} min)`);
      await writeSession(db, { room, ...s });
    }
    await publishRoom(db, room, { playerCount: count });
  });

  mc.on('stopped', async () => {
    p2p?.stop();
    await takedownRoom(db, room);
    console.log('Server stopped, room taken offline.');
    process.exit(0);
  });

  process.on('SIGINT', () => mc.stop());
  process.on('SIGTERM', () => mc.stop());

  console.log(`Starting room "${room}" (downloading Paper on first run)…`);
  await mc.start();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
