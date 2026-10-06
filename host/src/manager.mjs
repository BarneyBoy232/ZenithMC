// manager.mjs — runs MANY servers at once, each its own HostController on its own
// free port. The GUI talks to this: start adds a server, stop targets one by name,
// and logs are tagged with [room] so it's clear which server each line is from.
//
// Every successfully started server is remembered in <baseDir>/servers.json so it
// can be restarted from the GUI later (no digging through AppData), and any
// remembered server can be exported as a .zip backup.

import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, access, readdir, stat, rm, copyFile } from 'node:fs/promises';
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
    this.known = new Map();   // room -> { room, dir|null, version|null, private, lastStarted, ramPercent, backupDir }
    this.settings = {};       // app-wide settings (ramTotalMb) from settings.json
    this.log = [];
    this.baseDir = ROOT;
  }

  #knownPath() { return join(this.baseDir, 'servers.json'); }
  #settingsPath() { return join(this.baseDir, 'settings.json'); }

  /** Load remembered servers + app settings from disk. Call after baseDir is final. */
  async loadKnown() {
    try {
      const arr = JSON.parse(await readFile(this.#knownPath(), 'utf8'));
      for (const k of arr) if (k?.room) this.known.set(k.room, k);
    } catch { /* first run — nothing saved yet */ }
    try {
      this.settings = JSON.parse(await readFile(this.#settingsPath(), 'utf8')) || {};
    } catch { this.settings = {}; }
    // Watch for deleted folders: their site listing should disappear.
    this.sweepMissing();
    if (!this._sweepTimer) {
      this._sweepTimer = setInterval(() => this.sweepMissing(), 10 * 60 * 1000);
      this._sweepTimer.unref?.();
    }
  }

  // ---- RAM budget: one app-wide total, split across servers by percentage ----

  /** Total MB on this machine. */
  #systemMb() { return Math.floor(os.totalmem() / 1048576); }

  /** Sensible default budget when the user hasn't set one: half of system RAM,
   *  rounded down to a whole GB, clamped to [2 GB, system-2 GB]. */
  #defaultRamTotal() {
    const sys = this.#systemMb();
    const half = Math.floor(sys / 2 / 1024) * 1024;
    return Math.max(2048, Math.min(half, Math.max(2048, sys - 2048)));
  }

  /** The app-wide RAM budget in MB (user setting, or the computed default). */
  ramTotal() {
    const v = Number(this.settings.ramTotalMb);
    return Number.isFinite(v) && v >= 1024 ? Math.round(v) : this.#defaultRamTotal();
  }

  /** A server's share of the budget (percent). Defaults to 50% if unset. */
  ramPercentFor(room) {
    const k = this.known.get(room);
    const p = Number(k?.ramPercent);
    return Number.isFinite(p) && p > 0 && p <= 100 ? p : 50;
  }

  /** A server's actual heap in MB = budget × its share. */
  memoryMbFor(room) {
    return Math.max(512, Math.round(this.ramTotal() * this.ramPercentFor(room) / 100));
  }

  /** Sum of RAM shares of currently-running servers (optionally excluding one). */
  #runningPercent(exclude) {
    let sum = 0;
    for (const r of this.servers.keys()) if (r !== exclude) sum += this.ramPercentFor(r);
    return sum;
  }

  async #saveSettings() {
    try { await writeFile(this.#settingsPath(), JSON.stringify(this.settings, null, 2)); } catch { /* non-fatal */ }
  }

  /** App-wide RAM budget for the GUI settings panel. */
  ramSettings() {
    return { ramTotalMb: this.ramTotal(), systemMb: this.#systemMb(), defaultMb: this.#defaultRamTotal(), isDefault: !(Number(this.settings.ramTotalMb) >= 1024) };
  }

  /** Set the app-wide RAM budget (MB). */
  async setRamTotal(mb) {
    mb = Math.round(Number(mb));
    if (!Number.isFinite(mb) || mb < 1024) throw new Error('RAM budget must be at least 1024 MB (1 GB).');
    if (mb > this.#systemMb()) throw new Error(`That's more than this PC has (${(this.#systemMb() / 1024).toFixed(1)} GB installed).`);
    this.settings.ramTotalMb = mb;
    await this.#saveSettings();
    return this.ramSettings();
  }

  /** Set a server's RAM share (percent of the budget). Applies on next start. */
  async setRamPercent(room, percent) {
    room = String(room || '').toLowerCase().trim();
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    percent = Math.round(Number(percent));
    if (!Number.isFinite(percent) || percent < 1 || percent > 100) throw new Error('RAM share must be between 1% and 100%.');
    k.ramPercent = percent;
    await this.#saveKnown();
    this.#push(room, `RAM share set to ${percent}% (${this.memoryMbFor(room)} MB). Takes effect on next start.`);
    return { percent, mb: this.memoryMbFor(room) };
  }

  /**
   * A remembered server whose folder no longer exists (deleted/moved) is delisted
   * from the public site and flagged `missing` — but KEPT in the app so the user can
   * relink it to its new location (or delete it) from the GUI. If the folder comes
   * back (e.g. after a relink), the flag clears on the next sweep.
   */
  async sweepMissing() {
    for (const k of [...this.known.values()]) {
      if (this.servers.has(k.room)) continue; // running — clearly still exists
      const dir = k.dir || join(this.baseDir, 'servers', k.room);
      const missing = await access(dir).then(() => false, () => true);
      if (!missing) {
        if (k.missing) { k.missing = false; await this.#saveKnown(); this.emit('change'); }
        continue;
      }
      if (k.missing) continue; // already flagged and delisted
      try {
        const db = getDb();
        await authReady();
        await updateRoom(db, k.room, { online: false, delisted: true });
        k.missing = true;
        await this.#saveKnown();
        this.#push(k.room, `Folder gone (${dir}) — delisted. Relink it to a folder or delete it.`);
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

  /**
   * Start a server.
   *   dir       — attach an EXISTING server folder (runs its own jar, as-is).
   *   location  — parent folder to CREATE a new server in (Paper is downloaded into
   *               <location>/<name>). Ignored when `dir` is given.
   *   neither   — create in the default app location (<baseDir>/servers/<name>).
   */
  async start({ room, version, dir, location, isPrivate } = {}) {
    // Explorer's "Copy as path" wraps the path in quotes; strip those + whitespace
    // so the folder actually resolves (otherwise the jar scan silently finds nothing).
    if (dir) dir = String(dir).trim().replace(/^["']+|["']+$/g, '');
    if (location) location = String(location).trim().replace(/^["']+|["']+$/g, '');
    // When attaching an existing folder without a name, derive one from the folder.
    let r = String(room || '').toLowerCase().trim();
    if (!r && dir) {
      r = String(dir.split(/[\\/]/).filter(Boolean).pop() || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    }
    if (!r) throw new Error('Please enter a server name.');

    const attach = !!dir;
    let serverDir, storeDir;
    if (attach) {
      serverDir = dir; storeDir = dir;
    } else if (location) {
      // Custom location → a self-contained tree:  <location>/<name>/serverdata (the
      // Minecraft files) with <location>/<name>/backups alongside it. storeDir is the
      // serverdata path; backupDirFor() derives the sibling backups folder from it.
      serverDir = join(location, r, 'serverdata'); storeDir = serverDir;
    } else {
      serverDir = join(this.baseDir, 'servers', r); storeDir = null;
    }

    await this.#launch({ room: r, version, serverDir, attach, isPrivate, storeDir });
  }

  /** The one place a server is actually spawned + remembered (start and restart share it). */
  async #launch({ room: r, version, serverDir, attach, isPrivate, storeDir }) {
    if (this.servers.has(r)) throw new Error('A server with that name is already running.');

    // RAM budget: this server's share plus the shares of everything already running
    // must fit within 100% of the app-wide budget.
    const pct = this.ramPercentFor(r);
    const inUse = this.#runningPercent(r);
    if (inUse + pct > 100) {
      throw new Error(`Not enough allocated RAM: running servers already use ${inUse}% of the budget and "${r}" needs ${pct}% (over 100%). Lower a server's RAM share, raise the app's total RAM, or stop a server.`);
    }
    const mem = this.memoryMbFor(r);

    const used = new Set([...this.servers.values()].map((s) => s.port));
    const port = await findFreePort(25565, used);

    const ctrl = new HostController();
    ctrl.baseDir = this.baseDir;
    ctrl.on('log', (l) => this.#push(r, l));
    ctrl.on('stopped', () => { this.servers.delete(r); this.emit('change'); });
    this.servers.set(r, { room: r, port, ctrl });
    this.emit('change');

    try {
      await ctrl.start({ room: r, port, version, dir: serverDir, attach, isPrivate, mem });
    } catch (e) {
      this.servers.delete(r);
      this.emit('change');
      throw e;
    }

    // Remember it so it can be restarted from the GUI next time. Preserve any
    // per-server RAM share / custom backup folder already set.
    const prev = this.known.get(r) || {};
    this.known.set(r, {
      room: r,
      dir: storeDir,       // exact folder for attached/custom servers; null = default location
      attached: !!attach,  // true = run its own jar, never our download/upgrade/delete target
      missing: false,      // folder confirmed present (it just started)
      version: version || null,
      private: !!isPrivate,
      ramPercent: prev.ramPercent,   // keep the chosen share
      backupDir: prev.backupDir,     // keep any custom backup location
      lastStarted: Date.now(),
    });
    await this.#saveKnown();
  }

  /**
   * Point a remembered server at a different folder — e.g. after the user moved or
   * renamed its folder, or restored it somewhere new. Must be stopped. Keeps the
   * server's identity (name, privacy, attached/created nature); only the path moves.
   */
  async relink(room, dir) {
    room = String(room || '').toLowerCase().trim();
    dir = String(dir || '').trim().replace(/^["']+|["']+$/g, '');
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    if (this.servers.has(room)) throw new Error('Stop the server before relinking its folder.');
    if (!dir) throw new Error('Pick a folder.');
    await access(dir).catch(() => { throw new Error(`That folder does not exist: ${dir}`); });
    k.dir = dir;
    k.missing = false;
    await this.#saveKnown();
    this.#push(room, `Relinked to ${dir}. Start it to go live again.`);
    this.emit('change');
    return { dir };
  }

  /** Restart a remembered server with the settings it last ran with. */
  async restart(room) {
    const k = this.known.get(String(room || '').toLowerCase().trim());
    if (!k) throw new Error('Unknown server — start it once first.');
    await this.#launch({
      room: k.room,
      version: k.version || undefined,
      serverDir: this.#dirFor(k.room),
      attach: this.#isAttached(k),
      isPrivate: !!k.private,
      storeDir: k.dir || null,
    });
  }

  /** Whether a remembered server is an attached (own-jar) folder vs a ZenithMC-created one. */
  #isAttached(k) { return k ? (k.attached ?? !!k.dir) : false; }

  /** Resolve the folder a remembered server lives in. */
  #dirFor(room) {
    const k = this.known.get(room);
    return (k && k.dir) || join(this.baseDir, 'servers', room);
  }

  /** The generic/shared app backups folder — a backup always lands here for safety
   *  whenever a server lives in a custom location. */
  #genericBackups() { return join(this.baseDir, 'backups'); }

  /** The "SERVERNAME" folder that holds a custom server's data (and its backups).
   *  New custom servers store data under <SERVERNAME>/serverdata, so the server
   *  folder is its parent; older ones (pre-serverdata) keep data in <SERVERNAME>. */
  #serverFolder(k) {
    if (!k || !k.dir) return null;
    return basename(k.dir) === 'serverdata' ? dirname(k.dir) : k.dir;
  }

  /**
   * The PRIMARY place a server's backups go (what the panel shows and lists):
   *   1. an explicit per-server backup folder, if set (decoupled); else
   *   2. for a custom-location server, <SERVERNAME>/backups (beside its data); else
   *   3. the shared app backups folder (default-location + attached servers).
   */
  backupDirFor(room) {
    const k = this.known.get(room);
    if (k && k.backupDir) return k.backupDir;
    const sf = this.#serverFolder(k);
    if (sf && !this.#isAttached(k)) return join(sf, 'backups');
    return this.#genericBackups();
  }

  /**
   * EVERY folder a backup is written to. The primary (above), plus — whenever the
   * server lives in a custom location — the generic app folder as a safety copy.
   * So: default/no-override → [generic]; default/override → [chosen]; custom/no-override
   * → [SERVERNAME/backups, generic]; custom/override → [chosen, generic].
   */
  #backupDests(room) {
    const k = this.known.get(room);
    const primary = this.backupDirFor(room);
    const generic = this.#genericBackups();
    const serverIsCustom = !!(k && k.dir); // data lives outside the default app area
    const dests = [primary];
    if (serverIsCustom && primary !== generic) dests.push(generic);
    return dests;
  }

  /** Point a server's backups at a specific folder (decoupled from its data folder). */
  async setBackupDir(room, dir) {
    room = String(room || '').toLowerCase().trim();
    dir = String(dir || '').trim().replace(/^["']+|["']+$/g, '');
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    if (!dir) throw new Error('Pick a folder.');
    await access(dir).catch(() => { throw new Error(`That folder does not exist: ${dir}`); });
    k.backupDir = dir;
    await this.#saveKnown();
    this.#push(room, `Backups will now go to ${dir}.`);
    return { backupDir: dir };
  }

  /** Revert a server to the default backup location (beside its data, or the shared folder). */
  async clearBackupDir(room) {
    room = String(room || '').toLowerCase().trim();
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    delete k.backupDir;
    await this.#saveKnown();
    const d = this.backupDirFor(room);
    this.#push(room, `Backups reset to the default location (${d}).`);
    return { backupDir: d };
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

  /** Next backup number for this server+version, e.g. fish(26.2-4) -> 4. Scans every
   *  destination so the same filename is free in all of them (no clobbering a copy). */
  async #nextBackupNumber(room, version, dests) {
    const re = new RegExp(`^${escapeRe(room)}\\(${escapeRe(version)}-(\\d+)\\)\\.zip$`);
    let max = 0;
    for (const d of dests) {
      try {
        for (const f of await readdir(d)) {
          const m = f.match(re);
          if (m) max = Math.max(max, Number(m[1]));
        }
      } catch { /* dir not created yet */ }
    }
    return max + 1;
  }

  /** Backup .zip files for one server, newest first. */
  async backupsFor(room) {
    const backups = this.backupDirFor(room);
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
    const dir = this.#dirFor(room);
    // Live folder-existence check (stopped servers only — a running one clearly exists).
    const missing = running ? false : await access(dir).then(() => false, () => true);
    return {
      room,
      running: !!running,
      port: running ? running.port : null,
      players: running ? running.ctrl.players : 0,
      private: !!(k && k.private),
      attached: this.#isAttached(k),
      missing,
      version: await this.versionFor(room),
      latestVersion: await this.latestVersion(),
      dir,
      backupsDir: this.backupDirFor(room),
      backupExtra: this.#backupDests(room).slice(1), // extra safety copies (generic)
      backupCustom: !!(k && k.backupDir),
      ramPercent: this.ramPercentFor(room),
      ramMb: this.memoryMbFor(room),
      ramTotalMb: this.ramTotal(),
      joinUrl: `mc.zenithurl.com/${room}`,
      backups: await this.backupsFor(room),
    };
  }

  /**
   * Switch a ZenithMC-created server to any Minecraft version — up (upgrade) or down
   * (downgrade). Downloads the matching Paper jar now so the next start uses it.
   * Only for stopped, non-attached servers. Note: a world created on a newer version
   * may not load on an older one, so the GUI warns to back up before downgrading.
   */
  async setVersion(room, version) {
    room = String(room || '').toLowerCase().trim();
    version = String(version || '').trim();
    const k = this.known.get(room);
    if (!k) throw new Error('Unknown server — start it once first.');
    if (this.#isAttached(k)) throw new Error('Version changes apply to servers ZenithMC created, not attached folders.');
    if (this.servers.has(room)) throw new Error('Stop the server before changing its version.');
    if (!/^\d+(\.\d+)+$/.test(version)) throw new Error('Pick a valid Minecraft version.');
    const current = await this.versionFor(room);
    if (version === current) return { version, changed: false };

    this.#push(room, `Switching to ${version}… (downloading the server)`);
    await ensurePaper(this.#dirFor(room), version); // downloads paper.jar + writes paper.version
    k.version = version;
    await this.#saveKnown();
    try { await authReady(); await updateRoom(getDb(), room, { version }); } catch { /* offline */ }
    this.#push(room, `Now set to ${version}. Start it to apply (the world migrates on first launch).`);
    return { version, changed: true };
  }

  /**
   * Zip a server's folder to <backupDir>/<name>(<version>-<n>).zip, e.g.
   * fish(26.2-4).zip — n counts up per server+version. The backup folder is
   * resolved by backupDirFor() (custom override, beside the data, or shared).
   * Uses Windows' built-in tar
   * (bsdtar), which writes .zip via -a. The bundled JRE (jre-*) is excluded — it's
   * re-downloadable runtime, not world data. Best done while the server is stopped.
   */
  async backup(room) {
    room = String(room || '').toLowerCase().trim();
    if (!this.known.has(room) && !this.servers.has(room)) throw new Error('Unknown server.');
    const dir = this.#dirFor(room);
    await access(dir).catch(() => { throw new Error(`Server folder not found: ${dir}`); });

    const dests = this.#backupDests(room);           // one or more folders (primary [+ generic])
    for (const d of dests) await mkdir(d, { recursive: true });
    const version = await this.versionFor(room);
    const n = await this.#nextBackupNumber(room, version, dests);
    const name = `${room}(${version}-${n}).zip`;
    const folder = basename(dir);

    // Zip once into the primary destination…
    const primaryOut = join(dests[0], name);
    await new Promise((resolve, reject) => {
      // Run from the backups folder with a RELATIVE archive name: bsdtar parses a
      // "C:" drive prefix in -f as a remote host ("Cannot connect to C"). Exclude
      // the bundled JRE (re-downloadable) and any sibling backups folder.
      const p = spawn('tar', [
        '-a', '-cf', name,
        '--exclude', `${folder}/jre`,
        '--exclude', `${folder}/jre-*`,
        '--exclude', `${folder}/backups`,
        '-C', dirname(dir), folder,
      ], { cwd: dests[0] });
      let err = '';
      p.stderr.on('data', (b) => { err += b; });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Backup failed: ${err || 'tar exited ' + code}`))));
      p.on('error', reject);
    });
    // …then copy it to the other destinations (e.g. the generic safety folder).
    for (const d of dests.slice(1)) {
      try { await copyFile(primaryOut, join(d, name)); } catch { /* best-effort safety copy */ }
    }
    this.#push(room, dests.length > 1
      ? `Backup saved: ${primaryOut} (+ safety copy in ${dests[dests.length - 1]})`
      : `Backup saved: ${primaryOut}`);
    return primaryOut;
  }

  /**
   * Delete a server: forget it locally, remove its public listing, and (for a
   * ZenithMC-created server) delete its world folder. An attached server's own
   * folder is never touched — we only drop it from the app. Backups are always
   * kept. The server must be stopped first (so files aren't locked).
   */
  async delete(room) {
    room = String(room || '').toLowerCase().trim();
    const k = this.known.get(room);
    if (!k && !this.servers.has(room)) throw new Error('Unknown server.');
    if (this.servers.has(room)) throw new Error('Stop the server before deleting it.');
    const attached = this.#isAttached(k);
    const dir = this.#dirFor(room);

    try { await authReady(); await updateRoom(getDb(), room, { online: false, delisted: true }); } catch { /* offline — sweep/admin can finish it */ }
    if (!attached) {
      try { await rm(dir, { recursive: true, force: true }); } catch { /* already gone */ }
    }
    this.known.delete(room);
    await this.#saveKnown();
    this.emit('change');
    this.#push(room, attached ? 'Removed from ZenithMC (your folder was left untouched).' : 'Deleted — world files removed, backups kept.');
    return { attached };
  }

  /**
   * Send a console command to a running server (e.g. "whitelist add Steve", "op me",
   * "say hello"). A leading slash is optional — the server console doesn't use it.
   */
  command(room, cmd) {
    room = String(room || '').toLowerCase().trim();
    const s = this.servers.get(room);
    if (!s) throw new Error('That server is not running.');
    const c = String(cmd || '').trim().replace(/^\/+/, '');
    if (!c) throw new Error('Enter a command.');
    s.ctrl.send(c);
    this.#push(room, `> ${c}`);
    return { sent: c };
  }

  stop(room) { this.servers.get(String(room || '').toLowerCase().trim())?.ctrl.stop(); }
  stopAll() { for (const s of this.servers.values()) s.ctrl.stop(); }
}
