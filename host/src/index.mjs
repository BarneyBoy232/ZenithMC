#!/usr/bin/env node
// index.mjs — ZenithMC host app entry point.
//
// Usage:  node src/index.mjs <room-name> [--port 25565] [--mem 2048]
//
// What it does end to end:
//   1. launches a Paper Minecraft server in host/servers/<room>/
//   2. opens the proxy seam (where the P2P link will attach)
//   3. publishes the room to the registry (local file now, Firebase later)
//   4. streams player join/leave events -> registry + console (your analytics feed)

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MinecraftServer } from './mcServer.mjs';
import { LocalRegistry } from './registry.mjs';
import { startProxy } from './proxy.mjs';
import { SessionTracker } from './analytics.mjs';
import { backend } from './backend.mjs';

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
  const edgePort = port + 1000; // the proxy "edge" the P2P transport will own
  const registry = new LocalRegistry(join(ROOT, 'servers', '_registry'));

  const mc = new MinecraftServer({ name: room, dir, port, memoryMb: mem });
  const sessions = new SessionTracker();

  mc.on('log', (line) => process.stdout.write(`[mc] ${line}\n`));

  mc.on('ready', async () => {
    startProxy({ listenPort: edgePort, targetPort: port });
    const endpoint = `edge:${edgePort}`; // P2P endpoint id the connector dials
    await registry.publish(room, {
      address: endpoint,
      motd: mc.motd,
      version: mc.version,
      playerCount: 0,
      players: [],
    });
    await backend.publish(room, { endpoint, motd: mc.motd, version: mc.version });
    console.log(`\n✅ Room "${room}" is live.`);
    console.log(`   MC server : 127.0.0.1:${port}`);
    console.log(`   Proxy edge: 127.0.0.1:${edgePort}  (P2P attaches here)`);
    console.log(`   Registry  : host/servers/_registry/${room}.json\n`);
  });

  mc.on('player-join', async ({ name, count }) => {
    sessions.join(name, Date.now());
    console.log(`👤 ${name} joined  (${count} online)`);
    await registry.updatePlayers(room, { count, players: [...mc.players] });
    await backend.players(room, count);
  });

  mc.on('player-leave', async ({ name, count }) => {
    const session = sessions.leave(name, Date.now());
    if (session) {
      const mins = (session.durationMs / 60000).toFixed(1);
      console.log(`👋 ${name} left  (${count} online, played ${mins} min)`);
      await backend.session({ room, ...session }); // admin analytics feed
    }
    await registry.updatePlayers(room, { count, players: [...mc.players] });
    await backend.players(room, count);
    console.log('   ↳ analytics:', JSON.stringify(sessions.summary()));
  });

  mc.on('stopped', async () => {
    await registry.takedown(room);
    await backend.takedown(room);
    console.log('Server stopped, room taken offline.');
    process.exit(0);
  });

  const shutdown = () => mc.stop();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Starting room "${room}" (downloading Paper on first run)…`);
  await mc.start();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
