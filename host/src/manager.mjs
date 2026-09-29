// manager.mjs — runs MANY servers at once, each its own HostController on its own
// free port. The GUI talks to this: start adds a server, stop targets one by name,
// and logs are tagged with [room] so it's clear which server each line is from.
//
// Every successfully started server is remembered in <baseDir>/servers.json so it
// can be restarted from the GUI later (no digging through AppData), and any
// remembered server can be exported as a .zip backup.

import net from 'node:net';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { EventEmitter } from 'node:events';
import { HostController } from './controller.mjs';
import { ensurePaper, listVersions } from './mcServer.mjs';
import { getDb, authReady, updateRoom } from '../../shared/firestoreSignaling.mjs';

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    this.known = new Map();   // room -> { room, dir|null, version|null, private, lastStarted }
    this.log = [];
    this.baseDir = ROOT;
  }

  #knownPath() { return join(this.baseDir, 'servers.json'); }

  /** Load remembered servers from disk. Call after baseDir is final. */
  async loadKnown() {
    try {
      const arr = JSON.parse(await readFile(this.#knownPath(), 'utf8'));
      for (const k of arr) if (k?.room) this.known.set(k.room, k);
    } catch { /* first run — nothing saved yet */ }
    // Watch for deleted folders: their site listing should disappear.
    this.sweepMissing();
    if (!this._sweepTimer) {
      this._sweepTimer = setInterval(() => this.sweepMissing(), 10 * 60 * 1000);
      this._sweepTimer.unref?.();
    }
  }

  /**
   * A remembered server whose folder no longer exists (deleted/moved) is gone for
   * good — delist it from the site and forget it locally. Local forget happens
   * only after the delist write succeeds, so a temporary network failure just
   * retries on the next sweep instead of leaving a ghost listing forever.
   */
  async sweepMissing() {
    for (const k of [...this.known.values()]) {
      if (this.servers.has(k.room)) continue; // running — clearly still exists
      const dir = k.dir || join(this.baseDir, 'servers', k.room);
      const missing = await access(dir).then(() => false, () => true);
      if (!missing) continue;
      try {
        const db = getDb();
        await authReady();
        await updateRoom(db, k.room, { online: false, delisted: true });
        this.known.delete(k.room);
        await this.#saveKnown();
        this.#push(k.room, `Folder gone (${dir}) — removed from the site listing.`);
        this.emit('change');
      } catch { /* offline — retry next sweep */ }
    }
  }

  /** Show or hide a remembered server on the public list. */
  async setPrivacy(room, makePrivate) {
    room = String(room || '').toLowerCase().trim();
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    const db = getDb();
    await authReady();
    await updateRoom(db, room, { private: !!makePrivate });
    k.private = !!makePrivate;
    await this.#saveKnown();
    this.#push(room, makePrivate ? 'Hidden from the public list.' : 'Visible on the public list.');
  }

  async #saveKnown() {
    try {
      await writeFile(this.#knownPath(), JSON.stringify([...this.known.values()], null, 2));
    } catch { /* non-fatal */ }
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

  /** Remembered servers that are not currently running, newest first. */
  previous() {
    return [...this.known.values()]
      .filter((k) => !this.servers.has(k.room))
      .sort((a, b) => (b.lastStarted || 0) - (a.lastStarted || 0))
      .map((k) => ({ room: k.room, lastStarted: k.lastStarted || null, private: !!k.private }));
  }

  state() { return { servers: this.list(), previous: this.previous(), log: this.log }; }

  async start({ room, version, dir, isPrivate, mem } = {}) {
    // Explorer's "Copy as path" wraps the path in quotes; strip those + whitespace
    // so the folder actually resolves (otherwise the jar scan silently finds nothing).
    if (dir) dir = String(dir).trim().replace(/^["']+|["']+$/g, '');
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

    // Remember it so it can be restarted from the GUI next time.
    this.known.set(r, {
      room: r,
      dir: dir || null,
      version: version || null,
      private: !!isPrivate,
      lastStarted: Date.now(),
    });
    await this.#saveKnown();
  }

  /** Restart a remembered server with the settings it last ran with. */
  async restart(room) {
    const k = this.known.get(String(room || '').toLowerCase().trim());
    if (!k) throw new Error('Unknown server — start it once first.');
    await this.start({
      room: k.room,
      dir: k.dir || undefined,
      version: k.version || undefined,
      isPrivate: !!k.private,
    });
  }

  /** Resolve the folder a remembered server lives in. */
  #dirFor(room) {
    const k = this.known.get(room);
    return (k && k.dir) || join(this.baseDir, 'servers', room);
  }

  /** The Minecraft version a server runs (remembered, or read from its paper.version). */
  async versionFor(room) {
    const k = this.known.get(room);
    if (k && k.version) return k.version;
    try {
      const v = (await readFile(join(this.#dirFor(room), 'paper.version'), 'utf8')).trim();
      if (v) return v;
    } catch { /* no paper.version (attached server, maybe) */ }
    return 'na';
  }

  /** Newest available Minecraft version, cached for an hour (network call). */
  async latestVersion() {
    if (this._latestVer && Date.now() - this._latestVerAt < 3600000) return this._latestVer;
    try {
      const vs = await listVersions();
      if (vs && vs.length) { this._latestVer = vs[0]; this._latestVerAt = Date.now(); }
    } catch { /* keep whatever we had */ }
    return this._latestVer || null;
  }

  /** Next backup number for this server+version, e.g. fish(26.2-4) -> 4. */
  async #nextBackupNumber(room, version) {
    const backups = join(this.baseDir, 'backups');
    const re = new RegExp(`^${escapeRe(room)}\\(${escapeRe(version)}-(\\d+)\\)\\.zip$`);
    let max = 0;
    try {
      for (const f of await readdir(backups)) {
        const m = f.match(re);
        if (m) max = Math.max(max, Number(m[1]));
      }
    } catch { /* no backups dir yet */ }
    return max + 1;
  }

  /** Backup .zip files for one server, newest first. */
  async backupsFor(room) {
    const backups = join(this.baseDir, 'backups');
    try {
      const files = await readdir(backups);
      // New scheme "name(version-N).zip" plus any older "name-stamp.zip".
      const mine = files.filter((f) => (f.startsWith(room + '(') || f.startsWith(room + '-')) && f.endsWith('.zip'));
      const out = [];
      for (const f of mine) {
        const st = await stat(join(backups, f)).catch(() => null);
        out.push({ name: f, size: st ? st.size : 0 });
      }
      return out.sort((a, b) => b.name.localeCompare(a.name));
    } catch { return []; }
  }

  /** Everything the GUI's per-server detail panel shows. */
  async serverDetail(room) {
    room = String(room || '').toLowerCase().trim();
    const running = this.servers.get(room);
    const k = this.known.get(room);
    if (!running && !k) throw new Error('Unknown server.');
    return {
      room,
      running: !!running,
      port: running ? running.port : null,
      players: running ? running.ctrl.players : 0,
      private: !!(k && k.private),
      attached: !!(k && k.dir),
      version: await this.versionFor(room),
      latestVersion: await this.latestVersion(),
      dir: this.#dirFor(room),
      backupsDir: join(this.baseDir, 'backups'),
      joinUrl: `mc.zenithurl.com/${room}`,
      backups: await this.backupsFor(room),
    };
  }

  /**
   * Upgrade a ZenithMC-created server to the latest Minecraft version: download the
   * new Paper jar now so the next start uses it (Minecraft migrates the world on
   * first launch). Only for stopped, non-attached servers.
   */
  async upgrade(room) {
    room = String(room || '').toLowerCase().trim();
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    if (k.dir) throw new Error('Upgrade only applies to servers ZenithMC created, not attached folders.');
    if (this.servers.has(room)) throw new Error('Stop the server before upgrading.');
    const latest = await this.latestVersion();
    if (!latest) throw new Error("Couldn't reach the version list — check your connection.");
    if (k.version === latest) return { version: latest, changed: false };

    this.#push(room, `Upgrading to ${latest}… (downloading the new server)`);
    await ensurePaper(this.#dirFor(room), latest); // downloads paper.jar + writes paper.version
    k.version = latest;
    await this.#saveKnown();
    try { await authReady(); await updateRoom(getDb(), room, { version: latest }); } catch { /* offline */ }
    this.#push(room, `Upgraded to ${latest}. Start it to apply (the world migrates on first launch).`);
    return { version: latest, changed: true };
  }

  /**
   * Zip a server's folder to <baseDir>/backups/<name>(<version>-<n>).zip, e.g.
   * fish(26.2-4).zip — n counts up per server+version. Uses Windows' built-in tar
   * (bsdtar), which writes .zip via -a. The bundled JRE (jre-*) is excluded — it's
   * re-downloadable runtime, not world data. Best done while the server is stopped.
   */
  async backup(room) {
    room = String(room || '').toLowerCase().trim();
    if (!this.known.has(room) && !this.servers.has(room)) throw new Error('Unknown server.');
    const dir = this.#dirFor(room);
    await access(dir).catch(() => { throw new Error(`Server folder not found: ${dir}`); });

    const backups = join(this.baseDir, 'backups');
    await mkdir(backups, { recursive: true });
    const version = await this.versionFor(room);
    const n = await this.#nextBackupNumber(room, version);
    const name = `${room}(${version}-${n}).zip`;
    const out = join(backups, name);
    const folder = basename(dir);

    await new Promise((resolve, reject) => {
      // Run from the backups folder with a RELATIVE archive name: bsdtar parses a
      // "C:" drive prefix in -f as a remote host ("Cannot connect to C").
      const p = spawn('tar', [
        '-a', '-cf', name,
        '--exclude', `${folder}/jre`,
        '--exclude', `${folder}/jre-*`,
        '-C', dirname(dir), folder,
      ], { cwd: backups });
      let err = '';
      p.stderr.on('data', (b) => { err += b; });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Backup failed: ${err || 'tar exited ' + code}`))));
      p.on('error', reject);
    });
    this.#push(room, `Backup saved: ${out}`);
    return out;
  }

  stop(room) { this.servers.get(String(room || '').toLowerCase().trim())?.ctrl.stop(); }
  stopAll() { for (const s of this.servers.values()) s.ctrl.stop(); }
}
