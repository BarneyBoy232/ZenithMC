// manager.mjs — runs MANY servers at once, each its own HostController on its own
// free port. The GUI talks to this: start adds a server, stop targets one by name,
// and logs are tagged with [room] so it's clear which server each line is from.

import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { HostController } from './controller.mjs';

let ROOT;
try { ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); } catch { ROOT = process.cwd(); }

function isFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}
async function findFreePort(start, used) {
  for (let p = start; p < start + 200; p++) {
    if (used.has(p)) continue;
    if (await isFree(p)) return p;
  }
  throw new Error('No free port for the server.');
}

export class ServerManager extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // room -> { room, port, ctrl }
    this.log = [];
    this.baseDir = ROOT;
  }

  #push(room, line) {
    const l = `[${room}] ${line}`;
    this.log.push(l);
    if (this.log.length > 800) this.log.shift();
    this.emit('log', l);
  }

  list() {
    return [...this.servers.values()].map((s) => ({
      room: s.room, port: s.port, players: s.ctrl.players, running: s.ctrl.running,
    }));
  }

  state() { return { servers: this.list(), log: this.log }; }

  async start({ room, version, dir, isPrivate, mem } = {}) {
    // When attaching an existing folder without a name, derive one from the folder.
    let r = String(room || '').toLowerCase().trim();
    if (!r && dir) {
      r = String(dir.split(/[\\/]/).filter(Boolean).pop() || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    }
    if (!r) throw new Error('Please enter a server name.');
    if (this.servers.has(r)) throw new Error('A server with that name is already running.');
    const used = new Set([...this.servers.values()].map((s) => s.port));
    const port = await findFreePort(25565, used);

    const ctrl = new HostController();
    ctrl.baseDir = this.baseDir;
    ctrl.on('log', (l) => this.#push(r, l));
    ctrl.on('stopped', () => { this.servers.delete(r); this.emit('change'); });
    this.servers.set(r, { room: r, port, ctrl });
    this.emit('change');

    try {
      await ctrl.start({ room: r, port, version, dir, isPrivate, mem });
    } catch (e) {
      this.servers.delete(r);
      this.emit('change');
      throw e;
    }
  }

  stop(room) { this.servers.get(String(room || '').toLowerCase().trim())?.ctrl.stop(); }
  stopAll() { for (const s of this.servers.values()) s.ctrl.stop(); }
}
