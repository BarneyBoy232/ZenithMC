// controller.mjs — runs a host server in-process (no child node), so it works both
// from the CLI and inside the packaged Electron host app. Wraps the Minecraft
// server + P2P + Firestore publish + analytics behind start/stop/state, and emits
// 'log' and 'stopped' events.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { MinecraftServer } from './mcServer.mjs';
import { SessionTracker } from './analytics.mjs';
import { startHostP2P } from './p2p.mjs';
import { getDb, authReady, publishRoom, takedownRoom, writeSession } from '../../shared/firestoreSignaling.mjs';
import { normalizeRoom, isValidRoom } from '../../shared/validate.mjs';

// import.meta.url is empty once esbuild-bundled to CJS, so guard the path math.
let ROOT;
try { ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); } catch { ROOT = process.cwd(); }

export class HostController extends EventEmitter {
  constructor() {
    super();
    this.mc = null;
    this.p2p = null;
    this.room = null;
    this.log = [];
    this.running = false;
    this.players = 0;
    this.baseDir = ROOT; // where servers/ live; Electron points this at a writable dir
  }

  #push(line) {
    this.log.push(line);
    if (this.log.length > 500) this.log.shift();
    this.emit('log', line);
  }

  state() {
    return { running: this.running, room: this.room, players: this.players, log: this.log };
  }

  /**
   * @param opts.dir  optional existing server directory to use as-is (attach an
   *                  existing world/server). Defaults to host/servers/<room>.
   */
  async start({ room, port = 25565, mem = 2048, version = '1.21.11', isPrivate = false, dir } = {}) {
    if (this.mc) throw new Error('A server is already running.');
    room = normalizeRoom(room);
    if (!isValidRoom(room)) throw new Error('Invalid room name (letters, numbers, dashes; max 32).');

    this.room = room;
    this.log = [];
    this.players = 0;
    const serverDir = dir || join(this.baseDir, 'servers', room);
    const mc = new MinecraftServer({ name: room, dir: serverDir, port, memoryMb: mem, version, attach: !!dir });
    const sessions = new SessionTracker();
    const db = getDb();
    await authReady(); // carry an identity on every write
    this.mc = mc;

    mc.on('log', (l) => this.#push(l));
    mc.on('ready', async () => {
      this.running = true;
      this.p2p = startHostP2P({ room, targetPort: port });
      await publishRoom(db, room, { motd: mc.motd, version: mc.version, playerCount: 0, private: !!isPrivate });
      this.#push(`Room live: mc.zenithurl.com/${room} (${isPrivate ? 'private' : 'public'})`);
      // Heartbeat so the room stays "fresh"; a crashed/old instance goes stale and
      // its name can be reclaimed.
      this.heartbeat = setInterval(() => publishRoom(db, room, {}).catch(() => {}), 60000);
    });
    mc.on('player-join', async ({ name, count }) => {
      sessions.join(name, Date.now());
      this.players = count;
      await publishRoom(db, room, { playerCount: count });
    });
    mc.on('player-leave', async ({ name, count }) => {
      const s = sessions.leave(name, Date.now());
      this.players = count;
      if (s) await writeSession(db, { room, ...s });
      await publishRoom(db, room, { playerCount: count });
    });
    mc.on('stopped', async () => {
      this.running = false;
      clearInterval(this.heartbeat);
      this.p2p?.stop();
      this.p2p = null;
      this.mc = null;
      await takedownRoom(db, room);
      this.#push('Server stopped.');
      this.emit('stopped');
    });

    await mc.start();
  }

  stop() {
    this.mc?.stop();
  }
}
