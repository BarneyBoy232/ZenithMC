// registry.mjs — the "phone book" the website reads.
//
// The website never touches game traffic; it only reads tiny TEXT records that
// say "room `barneysworld` is online, here's how to reach it, N players on".
//
// This file defines the Registry INTERFACE and a local-file implementation used
// for development. Swapping to Firebase Realtime DB later is a drop-in: implement
// the same three methods against Firebase and the rest of the app is unchanged.
//
//   publish(room, data)        -> create/refresh a room record
//   updatePlayers(room, info)  -> push live player count / names
//   takedown(room)             -> mark offline (also fire on host app exit)

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export class LocalRegistry {
  constructor(dir) {
    this.dir = dir;
  }

  #path(room) {
    return join(this.dir, `${room}.json`);
  }

  async #write(room, patch) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.#path(room), JSON.stringify(patch, null, 2));
  }

  async publish(room, data) {
    await this.#write(room, {
      room,
      online: true,
      ...data,
      // NOTE: no Date.now() here on purpose — caller stamps time so this stays
      // deterministic/testable. Firebase impl can use ServerValue.TIMESTAMP.
    });
  }

  async updatePlayers(room, { count, players }) {
    await this.#write(room, { room, online: true, playerCount: count, players });
  }

  async takedown(room) {
    await rm(this.#path(room), { force: true });
  }
}

// ---------------------------------------------------------------------------
// Firebase implementation sketch (enable once you wire credentials):
//
// import { initializeApp } from 'firebase/app';
// import { getDatabase, ref, set, update, onDisconnect } from 'firebase/database';
//
// export class FirebaseRegistry {
//   constructor(config) { this.db = getDatabase(initializeApp(config)); }
//   async publish(room, data) {
//     const r = ref(this.db, `rooms/${room}`);
//     await set(r, { room, online: true, ...data });
//     onDisconnect(r).update({ online: false }); // auto-offline if host app dies
//   }
//   async updatePlayers(room, info) { await update(ref(this.db, `rooms/${room}`), info); }
//   async takedown(room) { await update(ref(this.db, `rooms/${room}`), { online: false }); }
// }
// ---------------------------------------------------------------------------
