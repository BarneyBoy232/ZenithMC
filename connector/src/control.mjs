// control.mjs — the local control API the website talks to.
//
// The connector runs this in the background (after its one first launch). When a
// friend clicks "Connect" on a room page, the page calls http://127.0.0.1:48911/connect
// with the room name; the connector establishes the direct P2P link and returns the
// local port to paste into Minecraft. The friend never touches the file — the page
// drives it.
//
// CORS + Private Network Access headers are set so an https page may call loopback.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startConnector } from './index.mjs';
import { enableAutostart } from './autostart.mjs';

const CONTROL_PORT = Number(process.env.ZMC_CONTROL_PORT ?? 48911);
const active = new Map(); // room -> { localPort }

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Chrome PNA preflight
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  try { return JSON.parse(body || '{}'); } catch { return {}; }
}

export function startControlServer({ port = CONTROL_PORT } = {}) {
  const server = http.createServer(async (req, res) => {
    cors(res);
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ running: true, rooms: [...active.keys()] }));
    }

    if (req.method === 'POST' && url.pathname === '/connect') {
      const { room } = await readJson(req);
      if (!room) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'room required' })); }
      if (active.has(room)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(active.get(room)));
      }
      try {
        const { localPort } = await startConnector({ room });
        const info = { localPort };
        active.set(room, info);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(info));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    res.writeHead(404);
    res.end();
  });
  // Don't crash if the port is taken (another connector already running).
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error('Control port in use — another connector is already running.');
    else console.error('Control server error:', e.message);
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startControlServer();
  // Self-register to launch at login, so this is the only time the user runs it.
  enableAutostart(fileURLToPath(import.meta.url)).then((ok) => {
    if (ok) console.log('Auto-start enabled — this will run in the background from now on.');
  });
  console.log(`ZenithMC connector control on http://127.0.0.1:${CONTROL_PORT}`);
}
