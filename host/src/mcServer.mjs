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
const jreApi = (major) => `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`;

// Major version of the system `java`, or 0 if absent/unparseable. Handles both
// modern ("21.0.1" -> 21) and legacy ("1.8.0" -> 8) version strings.
function systemJavaMajor() {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (r.status !== 0) return 0;
  const m = ((r.stderr || '') + (r.stdout || '')).match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  const maj = Number(m[1]);
  return maj === 1 ? Number(m[2] || 0) : maj;
}

/** Minimum Java major a given Minecraft version needs, per the Paper API (default 21). */
export async function requiredJavaMajor(version) {
  try {
    const res = await fetch(`${PAPER_API}/versions/${version}`, { headers: PAPER_UA });
    if (!res.ok) return 21;
    const d = await res.json();
    return d?.version?.java?.version?.minimum ?? d?.java?.version?.minimum ?? 21;
  } catch { return 21; }
}

/**
 * Return a runnable `java` command that satisfies `requiredMajor`. Uses the system
 * Java if it's new enough; otherwise downloads a portable Temurin JRE of the right
 * major into `dir/jre-<major>` so end users install nothing. Newer Minecraft (e.g.
 * 26.x) needs Java 25, older (1.21.x) needs Java 21 — so the major is per-server.
 * (Windows target; on other platforms it falls back to system `java`.)
 */
export async function ensureJava(dir, requiredMajor = 21) {
  if (systemJavaMajor() >= requiredMajor) return 'java';
  if (process.platform !== 'win32') return 'java'; // packaged builds are Windows

  const jreDir = join(dir, `jre-${requiredMajor}`);
  const existing = await findJavaExe(jreDir);
  if (existing) return existing;

  await mkdir(jreDir, { recursive: true });
  const zip = join(jreDir, 'jre.zip');
  const res = await fetch(jreApi(requiredMajor), { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Java ${requiredMajor} download failed (${res.status})`);
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(createWriteStream(zip)).on('finish', resolve).on('error', reject);
  });
  // Windows ships tar.exe, which extracts .zip.
  if (spawnSync('tar', ['-xf', zip, '-C', jreDir]).status !== 0) throw new Error('JRE extract failed');
  const found = await findJavaExe(jreDir);
  if (!found) throw new Error('java.exe not found after extract');
  return found;
}

/** Find the server jar to run inside an existing server folder. */
async function findServerJar(dir) {
  const files = await readdir(dir).catch(() => []);
  const jars = files.filter((f) => f.toLowerCase().endsWith('.jar'));
  if (!jars.length) return null;
  return (
    jars.find((f) => /^paper.*\.jar$/i.test(f)) ||
    jars.find((f) => /^(purpur|spigot|craftbukkit).*\.jar$/i.test(f)) ||
    jars.find((f) => /server\.jar$/i.test(f)) ||
    jars[0]
  );
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

/** List installable Minecraft versions for the dropdown — clean stable Paper
 * releases (e.g. 1.21.11), newest first, dropping rc/pre/experimental builds. */
export async function listVersions() {
  const res = await fetch(`${PAPER_API}/versions`, { headers: PAPER_UA });
  if (!res.ok) throw new Error(`Paper versions lookup failed (${res.status})`);
  const data = await res.json();
  const ids = (data.versions || []).map((v) => v?.version?.id ?? v?.version ?? v).filter(Boolean);
  // Keep clean numeric releases (26.2, 26.1.2, 1.21.11 …), drop rc/pre/snapshots.
  // The API lists newest first, so 26.x sits above 1.21.x.
  const stable = ids.filter((id) => /^\d+(\.\d+)+$/.test(id));
  return stable.length ? stable : ids;
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
  constructor({ name, dir, port = 25565, memoryMb = 2048, version = '1.21.11', motd, attach = false }) {
    super();
    this.name = name;
    this.dir = dir;
    this.port = port;
    this.memoryMb = memoryMb;
    this.version = version;
    this.motd = motd ?? `${name} — powered by ZenithMC`;
    this.attach = attach; // attach an existing server folder (run its own jar)
    this.proc = null;
    this.players = new Set();
    this.ready = false;
    this._stopping = false;       // a stop has been requested
    this._stoppedEmitted = false; // guard so 'stopped' fires at most once
    this._killOnSpawn = false;    // stop requested before the process existed
    this._killTimer = null;       // graceful-stop -> force-kill fallback
  }

  // Emit 'stopped' at most once (proc exit and a proc-null stop can both reach here).
  #emitStopped(code) {
    if (this._stoppedEmitted) return;
    this._stoppedEmitted = true;
    clearTimeout(this._killTimer);
    this.ready = false;
    this.emit('stopped', code);
  }

  // Force the process down (SIGTERM now, SIGKILL shortly after if it clings on).
  #forceKill() {
    try { this.proc?.kill(); } catch { /* already gone */ }
    setTimeout(() => { try { this.proc?.kill('SIGKILL'); } catch { /* gone */ } }, 3000);
  }

  async #writeConfig() {
    await writeFile(join(this.dir, 'eula.txt'), 'eula=true\n');

    // If a server.properties already exists (attaching an existing server), keep
    // the host's settings and only override the port. Otherwise write defaults.
    const existing = await readFile(join(this.dir, 'server.properties'), 'utf8').catch(() => null);
    let props;
    if (existing) {
      props = existing
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('server-port='))
        .concat(`server-port=${this.port}`);
    } else {
      props = [
        `motd=${this.motd}`,
        `server-port=${this.port}`,
        'online-mode=true',
        'enable-status=true',
        'max-players=20',
      ];
    }
    await writeFile(join(this.dir, 'server.properties'), props.join('\n') + '\n');
  }

  async start() {
    // New servers: download the Java the chosen Minecraft version needs (26.x -> 25,
    // 1.21.x -> 21). Attached servers: default to 21 unless the system Java is newer.
    const requiredMajor = this.attach ? 21 : await requiredJavaMajor(this.version).catch(() => 21);
    const javaBin = await ensureJava(this.dir, requiredMajor);

    // Attaching an existing server: run its own jar, don't download Paper.
    // New server: download the requested Paper build.
    let jar = 'paper.jar';
    if (this.attach) {
      jar = await findServerJar(this.dir);
      if (!jar) {
        const files = await readdir(this.dir).catch(() => null);
        throw new Error(
          files === null
            ? `Can't open that folder: ${this.dir}`
            : `No .jar found in ${this.dir}. Files there: ${files.join(', ') || '(folder is empty)'}`,
        );
      }
    } else {
      await ensurePaper(this.dir, this.version);
    }
    await this.#writeConfig();

    this.proc = spawn(
      javaBin,
      [`-Xms${this.memoryMb}M`, `-Xmx${this.memoryMb}M`, '-jar', jar, '--nogui'],
      { cwd: this.dir },
    );

    this.proc.stdout.on('data', (b) => this.#parse(b.toString()));
    this.proc.stderr.on('data', (b) => this.emit('log', b.toString()));
    this.proc.on('exit', (code) => this.#emitStopped(code));

    // Stop was clicked while we were still downloading Java/Paper — kill it now.
    if (this._killOnSpawn) this.#forceKill();

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
    if (this._stopping) { this.#forceKill(); return; } // second click = force it
    this._stopping = true;
    if (this.proc) {
      this.send('stop'); // graceful: let Minecraft save the world…
      this._killTimer = setTimeout(() => this.#forceKill(), 8000); // …but don't wait forever
    } else {
      // Still starting (downloading Java/Paper), no process yet: mark it to die on
      // spawn and drop it from the UI now so Stop feels immediate.
      this._killOnSpawn = true;
      this.#emitStopped(0);
    }
  }
}
