# ZenithMC — Architecture (the whole picture)

A tool to host a Minecraft server on your own PC and share it with friends through
your own website, **free, no card, no port forwarding**, at near-normal-server latency.

The core trick: **your website never carries game traffic.** Game packets go
**directly PC ↔ PC** (peer-to-peer). Your site only passes a tiny text address that
introduces the two machines. That's why it's free + uncapped + low-latency, and why
it scales to unlimited servers (every connection is its own zero-cost "server").

---

## The 4 elements

| # | Element | Runs on | Job | Folder |
|---|---------|---------|-----|--------|
| 1 | **Host app** | Host's PC | Launches the Minecraft server, opens the P2P endpoint, publishes the room + analytics | `host/` |
| 2 | **Connector** | Friend's PC | Exposes `localhost:25565` to Minecraft, carries it over the P2P link to the host | `connector/` |
| 3 | **Website** | Vercel | Per-subdomain page: shows online status + connector download + what to paste | `src/` |
| 4 | **Registry** | Firebase (text only) | The "phone book": which rooms are live, their P2P address, player counts | `src/lib/registry.js` + `host/src/registry.mjs` |

## How they connect

```
            (writes text)                 (reads text)
 Host app  ───────────────►  Registry  ◄───────────────  Website
    │                       (Firebase)                      │
    │                                              friend downloads
    │                                                  Connector
    ▼                                                       │
 MC server ──► P2P endpoint ◄═══ DIRECT P2P LINK ═══► Connector ──► Minecraft
   :25565        (host edge)     (game packets only)    :25565
```

- **Solid line = text** (kilobytes, via your site). **Double line = game traffic**
  (never touches your servers).
- The P2P link is the *only* thing that affects latency, and it's a direct line
  between the two players — no relay detour.

## The seam (why swapping to real P2P is a one-line change)

Both the host proxy and the connector funnel everything through a single function:
- Host: `openUpstream()` in `host/src/proxy.mjs`
- Friend: `openP2P()` in `connector/src/index.mjs`

Today those return a **loopback TCP socket** (so the whole chain is testable on one
machine). The real build replaces *only* those functions with a **WebRTC / UDP
hole-punched stream**. Nothing else — Minecraft, the website, the registry — changes.

## How NAT hole-punching will work (the real P2P)

1. **Signal** — host & friend post their network candidates to a Firebase room (text).
2. **Discover** — each finds its public IP:port via a free STUN server.
3. **Punch** — both fire packets simultaneously; the routers open; a direct tunnel forms.
4. From then on, packets go straight PC ↔ PC.

*Honest limits:* (a) 50ms is only physically possible for same-region players; (b)
~10–20% of strict-NAT pairs can't punch through and must fail gracefully (no silent
laggy relay).

---

## Build stages (roadmap)

- **Stage 0 — Scaffold** ✅ host app, connector, website room page, registry interface.
- **Stage 1 — Local proof** ✅ full chain works across processes via loopback transport.
- **Stage 2 — Real registry** ⬜ wire Firebase so host writes / website reads live rooms.
- **Stage 3 — Real P2P** ⬜ replace the seam with WebRTC hole-punching + STUN signaling.
- **Stage 4 — Two-machine latency test** ⬜ prove <50ms host↔friend in Australia.
- **Stage 5 — Packaging** ⬜ bundle host app + connector + JRE into one-click downloads.
- **Stage 6 — Admin analytics UI** ⬜ dashboard reading the admin path (all servers/players).
- **Stage 7 — Polish** ⬜ wildcard `*.mc.zenithurl.com` on Vercel, server-status ping, UI.
