// mcServer.mjs — creates, launches and babysits a Minecraft (Paper) server.
//
// A "Minecraft server" is just a .jar run by Java. This module:
//   1. downloads the Paper jar (if missing) from the official PaperMC API,
//   2. accepts the EULA + writes server.properties (port, MOTD, etc.),
//   3. spawns `java -jar paper.jar` as a child process,
//   4. reads its console output to emit events (ready / player-join / player-leave).
//
// Those events are what feed both the live registry AND your admin analytics.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';

/** Download the latest Paper build for `version` into `dir` (skips if present). */
export async function ensurePaper(dir, version = '1.21.4') {
  const jarPath = join(dir, 'paper.jar');
  try {
    await access(jarPath);
    return jarPath; // already downloaded
  } catch {
    /* needs download */
  }

  await mkdir(dir, { recursive: true });

  const buildsRes = await fetch(`${PAPER_API}/versions/${version}/builds`);
  if (!buildsRes.ok) throw new Error(`Paper builds lookup failed (${buildsRes.status})`);
  const { builds } = await buildsRes.json();
  const latest = builds.at(-1);
  const jarName = latest.downloads.application.name;
  const url = `${PAPER_API}/versions/${version}/builds/${latest.build}/downloads/${jarName}`;

  const dl = await fetch(url);
  if (!dl.ok || !dl.body) throw new Error(`Paper jar download failed (${dl.status})`);

  await new Promise((resolve, reject) => {
    const ws = createWriteStream(jarPath);
    Readable.fromWeb(dl.body).pipe(ws).on('finish', resolve).on('error', reject);
  });

  return jarPath;
}

export class MinecraftServer extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.name      friendly room name (becomes the subdomain key)
   * @param {string} opts.dir       working directory for this server's files
   * @param {number} [opts.port]    local port the server binds (default 25565)
   * @param {number} [opts.memoryMb]
   * @param {string} [opts.version] Minecraft version
   * @param {string} [opts.motd]
   */
  constructor({ name, dir, port = 25565, memoryMb = 2048, version = '1.21.4', motd }) {
    super();
    this.name = name;
    this.dir = dir;
    this.port = port;
    this.memoryMb = memoryMb;
    this.version = version;
    this.motd = motd ?? `${name} — powered by ZenithMC`;
    this.proc = null;
    this.players = new Set();
    this.ready = false;
  }

  async #writeConfig() {
    await writeFile(join(this.dir, 'eula.txt'), 'eula=true\n');
    const props = [
      `motd=${this.motd}`,
      `server-port=${this.port}`,
      'online-mode=true',
      'enable-status=true',
      'max-players=20',
    ].join('\n');
    await writeFile(join(this.dir, 'server.properties'), props + '\n');
  }

  async start() {
    await ensurePaper(this.dir, this.version);
    await this.#writeConfig();

    this.proc = spawn(
      'java',
      [`-Xms${this.memoryMb}M`, `-Xmx${this.memoryMb}M`, '-jar', 'paper.jar', '--nogui'],
      { cwd: this.dir },
    );

    this.proc.stdout.on('data', (b) => this.#parse(b.toString()));
    this.proc.stderr.on('data', (b) => this.emit('log', b.toString()));
    this.proc.on('exit', (code) => {
      this.ready = false;
      this.emit('stopped', code);
    });

    return this;
  }

  #parse(chunk) {
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      this.emit('log', line);

      if (/Done \([\d.]+s\)! For help/.test(line)) {
        this.ready = true;
        this.emit('ready');
      }
      const joined = line.match(/]: (\w+) joined the game/);
      if (joined) {
        this.players.add(joined[1]);
        this.emit('player-join', { name: joined[1], count: this.players.size });
      }
      const left = line.match(/]: (\w+) left the game/);
      if (left) {
        this.players.delete(left[1]);
        this.emit('player-leave', { name: left[1], count: this.players.size });
      }
    }
  }

  /** Send a raw console command to the server. */
  send(command) {
    this.proc?.stdin.write(command.replace(/\n+$/, '') + '\n');
  }

  stop() {
    this.send('stop');
  }
}
