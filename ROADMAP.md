# ZenithMC — Roadmap & Working Method

## How we work: the ZenithMC Build Loop (4 steps)

Every coding turn from here follows these four steps, shown in the reply so you can
follow along. One roadmap step at a time — no scope creep.

1. **🎯 SCOPE** — Name the single roadmap step being done, its *done-criteria*
   (what finished looks like), and the exact files I'll touch.
2. **🔨 BUILD** — Write the code, matching the surrounding style. Tight diffs.
3. **✅ PROVE** — Run it and show *real output* (a test, a command, live data).
   Never "should work" — demonstrate it.
4. **🚀 LAND** — Commit + push, tick the step here, and report a short TL;DR with
   the next step queued.

---

## Steps to completion (ordered)

> Latency is **not** a step. A direct P2P path is inherently low-latency for
> same-region players, so <50ms is an *outcome* of Phase A done right — validated
> incidentally when we first connect two real machines, not as a separate task.

### Phase A — Core P2P (make it actually connect)
1. **Backend signaling mailbox** — `/signal` endpoints (post/get SDP + ICE per
   room+session), Firestore-backed with in-memory fallback.
   *Done when:* host & connector can exchange a WebRTC handshake through the backend.
2. **Host app → real WebRTC** — replace the loopback proxy seam with `hostSide`
   from `webrtcBridge.mjs`, driven by backend signaling.
   *Done when:* the host accepts a real DataChannel and bridges it to its MC server.
3. **Connector → real WebRTC** — replace the loopback forwarder with `friendSide`;
   listen on localhost, dial the host via backend signaling; auto-pick a free port.
   *Done when:* Minecraft → connector → host over WebRTC on one machine, no loopback.
4. **Connector ↔ website control** — the room page tells the running connector which
   host to dial (local control port / deep link), so "Connect" just works.
   *Done when:* clicking Connect on `room.mc.zenithurl.com` sets up the paste address.

> **Milestone after Phase A:** two real PCs connect directly. Latency = the direct
> internet path between them. This is the make-or-break, and it's now structural.

### Phase B — Live & reachable
5. **Service-account key + deploy backend** — set `FIREBASE_SERVICE_ACCOUNT` on the
   backend host; deploy; confirm Firestore persistence under `from_zenithmc/`.
   *Done when:* rooms survive a backend restart and show across instances.
6. **Wildcard `*.mc.zenithurl.com`** — DNS + site host config so every subdomain
   serves the room page.
   *Done when:* any `<name>.mc.zenithurl.com` resolves to the room page.

### Phase C — Zero-friction UX
7. **Host app GUI** — small window: name server, Start/Stop, copy share link, status
   (replaces the CLI).
   *Done when:* a non-technical host can launch a server without a terminal.
8. **Connector auto-start + tray** — first launch installs to startup + runs in the
   tray; never touched again.
   *Done when:* after one launch it auto-runs every boot and serves any server.
9. **Graceful NAT-failure handling** — detect when hole-punching fails (strict NAT
   both ends) and show a clear message instead of hanging or silently relaying.
   *Done when:* an un-punchable pair gets an honest "couldn't connect directly".

### Phase D — Ship it
10. **One-click packaging** — bundle host app + connector + a JRE into `.exe`
    downloads so users need no Node/Java.
    *Done when:* a fresh PC can host/join from the downloaded files alone.
11. **Admin analytics dashboard** — Abstrak gate (`pk_live_`) + admin-only view of
    all servers / players / sessions.
    *Done when:* only you can see the global live dashboard.
12. **Hardening & polish** — DataChannel backpressure, signaling reconnect/refresh,
    subdomain ownership locks, server-status ping (live player count/MOTD), room-name
    validation, rate limits.
    *Done when:* it survives real-world flakiness and abuse.

---

## Status legend
`⬜ todo` · `🟡 in progress` · `✅ done`

| Step | State |
|------|-------|
| 1 Backend signaling mailbox | ⬜ |
| 2 Host app → real WebRTC | ⬜ |
| 3 Connector → real WebRTC | ⬜ |
| 4 Connector ↔ website control | ⬜ |
| 5 Service-account key + deploy | ⬜ (needs your key) |
| 6 Wildcard subdomain | ⬜ |
| 7 Host app GUI | ⬜ |
| 8 Connector auto-start + tray | ⬜ |
| 9 NAT-failure handling | ⬜ |
| 10 Packaging | ⬜ |
| 11 Admin dashboard | ⬜ (needs `pk_live_`) |
| 12 Hardening & polish | ⬜ |

_Foundations already done (Stages 0–3 groundwork): host app skeleton, connector,
website room page, Firestore-ready backend, and the **proven** WebRTC transport
(`npm run test:p2p`)._
