# ZenithMC — Where we are right now

_Quick "you are here" map. Pairs with `ARCHITECTURE.md` (the full design)._

## ✅ Done & verified

- **Host app** (`host/`) — downloads & launches Paper, parses console for
  ready/join/leave, publishes a live room record, opens the P2P attach-seam.
- **Connector** (`connector/`) — exposes a local port to Minecraft, forwards over the
  seam, auto-picks a free port if 25565 is busy and tells the friend what to paste.
- **Website room page** (`src/RoomPage.jsx`) — per-subdomain page with online status,
  player count, connector download, and copy-the-address. Subdomain routing in
  `main.jsx`. **Website builds clean.**
- **Registry interface** — local-file stub now, Firebase drop-in sketched.
- **Analytics** (`host/src/analytics.mjs`) — player sessions + playtime rollups.
- **Proven live:** full chain `Minecraft client → connector → host edge → MC server`
  works across separate processes (loopback transport). Analytics logic unit-checked.

## ⬜ Not built yet

- Firebase actually wired (Stage 2) — **needs your Firebase config.**
- Real WebRTC hole-punching replacing the loopback seam (Stage 3).
- Two-machine latency test (Stage 4) — **needs a second PC.**
- One-click packaging into `.exe` + bundled JRE (Stage 5).
- Admin analytics dashboard UI (Stage 6).

## 🟡 Current stage: end of Stage 1 (local proof) → start of Stage 2/3

## Decisions locked in

- **Architecture:** P2P + connector is the SOLE primary path (your rules #4/#5 forbid
  a relay). The old Cloudflare-SRV + bore.pub relay path is **retired**. SRV-fallback
  stays documented as a future add-on *if* a good free AU tunnel ever appears.
- **Data layer:** Firestore in the **ZenithURL** project (`zenithurl-e9909`), namespaced
  under the **`from_zenithmc/`** sub-project (created via Abstrak). All Firestore access
  goes through the backend (`api/api.py`) — the host app ships no credentials.

## Stage 2 wiring done (needs your key to go live)

- `api/api.py` rewritten: Firestore-backed `/sync`, `/live-servers`, `/room/<name>`,
  `/session`; **leaked Cloudflare token removed**; safe in-memory fallback for dev.
- Host app POSTs room status + player sessions to the backend (`host/src/backend.mjs`).
- Website room page reads the live `/room/<name>` endpoint.

## 🚦 Crossroads (what needs YOU)

1. **🔴 Rotate the Cloudflare token** — `cfut_…98a3a73e` is still in git history. Rotate
   it in the Cloudflare dashboard. (We no longer use it, but it's exposed.)
2. **Firebase service-account key** (FREE, no card): Firebase console → ZenithURL →
   Project settings → Service accounts → *Generate new private key*. Set the JSON as
   env var `FIREBASE_SERVICE_ACCOUNT` on the backend host. Until then the API runs on
   the in-memory fallback.
3. **`pk_live_` key** for the admin gate (Gates → Accounts) — needed for Stage 6.
4. **A second machine** — to prove <50ms in Stage 4 (can come later).

## How to run what exists today

```bash
# Website (room page + landing)
cd Website && npm install && npm run dev
#   landing : http://localhost:5173
#   room    : http://localhost:5173/?room=barneysworld

# Host app (downloads Paper on first run, needs Java — you have 21)
cd Website/host && node src/index.mjs myserver

# Connector (in another terminal)
cd Website/connector && node src/index.mjs
```
