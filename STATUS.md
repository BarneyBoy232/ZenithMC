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

The skeleton is real and runs locally. The two things that make it a *product* —
a real registry (Firebase) and a real P2P link (WebRTC) — are next, and the first of
those needs input from you.

## 🚦 Crossroads (what needs YOU)

1. **Firebase** — reuse the existing `zenithstreaming-f8539` project, or a new one?
   Either way I need its web config to wire Stage 2.
2. **A second machine** — to genuinely prove <50ms in Stage 4 (can come later).
3. **Order** — build the real P2P transport next (Stage 3) or wire Firebase first
   (Stage 2)? They're independent; I can do whichever you prefer.

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
