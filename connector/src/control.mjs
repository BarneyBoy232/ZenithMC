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
import { startConnector } from './index.mjs';

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
  server.listen(port, '127.0.0.1');
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startControlServer();
  console.log(`ZenithMC connector control on http://127.0.0.1:${CONTROL_PORT}`);
}
