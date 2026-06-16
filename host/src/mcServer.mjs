// mcServer.mjs — creates, launches and babysits a Minecraft (Paper) server.
//
// A "Minecraft server" is just a .jar run by Java. This module:
//   1. downloads the Paper jar (if missing) from the official PaperMC API,
//   2. accepts the EULA + writes server.properties (port, MOTD, etc.),
//   3. spawns `java -jar paper.jar` as a child process,
//   4. reads its console output to emit events (ready / player-join / player-leave).
//
// Those events are what feed both the live registry AND your admin analytics.

import { spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile, access, readdir, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

const PAPER_API = 'https://fill.papermc.io/v3/projects/paper';
const PAPER_UA = { 'User-Agent': 'ZenithMC/1.0 (+https://mc.zenithurl.com)' };
const JRE_API = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';

/**
 * Return a runnable `java` command. Uses the system Java if present; otherwise
 * downloads a portable Temurin JRE into `dir/jre` so end users install nothing.
 * (Windows target; on other platforms it falls back to system `java`.)
 */
export async function ensureJava(dir) {
  if (spawnSync('java', ['-version']).status === 0) return 'java';
  if (process.platform !== 'win32') return 'java'; // packaged builds are Windows

  const jreDir = join(dir, 'jre');
  const existing = await findJavaExe(jreDir);
  if (existing) return existing;

  await mkdir(jreDir, { recursive: true });
  const zip = join(jreDir, 'jre.zip');
  const res = await fetch(JRE_API, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`JRE download failed (${res.status})`);
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(createWriteStream(zip)).on('finish', resolve).on('error', reject);
  });
  // Windows ships tar.exe, which extracts .zip.
  if (spawnSync('tar', ['-xf', zip, '-C', jreDir]).status !== 0) throw new Error('JRE extract failed');
  const found = await findJavaExe(jreDir);
  if (!found) throw new Error('java.exe not found after extract');
  return found;
}

async function findJavaExe(jreDir) {
  try {
    for (const entry of await readdir(jreDir)) {
      const candidate = join(jreDir, entry, 'bin', 'java.exe');
      try { await access(candidate); return candidate; } catch { /* keep looking */ }
    }
  } catch { /* dir missing */ }
  return null;
}

/** Download the latest Paper build for `version` into `dir` (re-downloads if the
 * existing jar is a different version). */
export async function ensurePaper(dir, version = '1.21.11') {
  const jarPath = join(dir, 'paper.jar');
  const verPath = join(dir, 'paper.version');
  try {
    await access(jarPath);
    const have = (await readFile(verPath, 'utf8').catch(() => '')).trim();
    if (have === version) return jarPath; // correct version already present
  } catch {
    /* needs download */
  }

  await mkdir(dir, { recursive: true });

  const buildsRes = await fetch(`${PAPER_API}/versions/${version}/builds`, { headers: PAPER_UA });
  if (!buildsRes.ok) throw new Error(`Paper builds lookup failed (${buildsRes.status}) for ${version}`);
  const data = await buildsRes.json();
  const builds = Array.isArray(data) ? data : (data.builds || []);
  if (!builds.length) throw new Error(`No Paper builds found for ${version}`);
  const latest = builds.reduce((a, b) => (b.id > a.id ? b : a));
  const url = latest.downloads?.['server:default']?.url;
  if (!url) throw new Error('No server download in latest Paper build');

  const dl = await fetch(url, { headers: PAPER_UA });
  if (!dl.ok || !dl.body) throw new Error(`Paper jar download failed (${dl.status})`);

  await new Promise((resolve, reject) => {
    const ws = createWriteStream(jarPath);
    Readable.fromWeb(dl.body).pipe(ws).on('finish', resolve).on('error', reject);
  });
  await writeFile(verPath, version);

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
  constructor({ name, dir, port = 25565, memoryMb = 2048, version = '1.21.11', motd }) {
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
    const javaBin = await ensureJava(this.dir);
    await ensurePaper(this.dir, this.version);
    await this.#writeConfig();

    this.proc = spawn(
      javaBin,
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
