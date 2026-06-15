#!/usr/bin/env node
// index.mjs — ZenithMC host app, command-line entry.
//
// Usage:
//   node src/index.mjs <room> [--version 1.21.11] [--port 25565] [--mem 2048]
//                             [--private] [--dir "C:\\path\\to\\existing\\server"]
//
// Launches a Paper server (or attaches an existing one via --dir), publishes the
// room, accepts direct P2P connections, and streams analytics. All the real work
// lives in HostController so the GUI/packaged app share it.

import { HostController } from './controller.mjs';

function parseArgs(argv) {
  const room = argv[0];
  const rest = argv.slice(1);
  const opts = { room, port: 25565, mem: 2048, version: '1.21.11', private: rest.includes('--private') };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--port') opts.port = Number(rest[i + 1]);
    if (rest[i] === '--mem') opts.mem = Number(rest[i + 1]);
    if (rest[i] === '--version') opts.version = rest[i + 1];
    if (rest[i] === '--dir') opts.dir = rest[i + 1];
  }
  return opts;
}

async function main() {
  const { room, port, mem, version, private: isPrivate, dir } = parseArgs(process.argv.slice(2));
  if (!room) {
    console.error('Usage: node src/index.mjs <room> [--version 1.21.11] [--port 25565] [--mem 2048] [--private] [--dir <path>]');
    process.exit(1);
  }

  const ctrl = new HostController();
  ctrl.on('log', (line) => process.stdout.write(`[mc] ${line}\n`));
  ctrl.on('stopped', () => process.exit(0));
  process.on('SIGINT', () => ctrl.stop());
  process.on('SIGTERM', () => ctrl.stop());

  console.log(`Starting room "${room}" (downloading Paper/Java on first run)…`);
  await ctrl.start({ room, port, mem, version, isPrivate, dir });
}

main().catch((err) => {
  console.error('Fatal:', err.message || err);
  process.exit(1);
});
