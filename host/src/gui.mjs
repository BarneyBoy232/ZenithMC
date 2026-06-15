#!/usr/bin/env node
// gui.mjs — minimal local control panel for the host.
//
// Serves a localhost page that drives the host CLI (node src/index.mjs <room>) and
// streams its console. Two looks: plain (default, raw/unstyled — the developer feel)
// and styled (open with ?theme=styled). The styled vs plain page is the only
// difference between the two downloads we offer; the engine underneath is identical.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.ZMC_GUI_PORT ?? 7800);

let child = null;
let room = null;
const log = [];
const pushLog = (line) => { log.push(line); if (log.length > 500) log.shift(); };

function start(name, isPrivate) {
  if (child || !name) return;
  room = name;
  log.length = 0;
  const args = [join(__dirname, 'index.mjs'), name];
  if (isPrivate) args.push('--private');
  child = spawn('node', args, { cwd: join(__dirname, '..') });
  child.stdout.on('data', (d) => d.toString().split('\n').forEach((l) => l.trim() && pushLog(l)));
  child.stderr.on('data', (d) => pushLog('[err] ' + d.toString().trim()));
  child.on('exit', () => { child = null; pushLog('— server stopped —'); });
}
function stop() { if (child) child.kill(); }

const STYLE = `<style>
  body{background:#020617;color:#e2e8f0;font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px}
  h1{color:#10b981} input,button{padding:8px 12px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#e2e8f0}
  button{background:#10b981;color:#020617;font-weight:700;cursor:pointer;border:0}
  pre{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;height:340px;overflow:auto}
</style>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>ZenithMC Host</title>${STYLE}</head><body>
<h1>ZenithMC Host</h1>
<p>Name your server and press Start. Share <code>&lt;name&gt;.mc.zenithurl.com</code> with friends.</p>
<div>
  <input id="room" placeholder="server name (e.g. barneysworld)">
  <button onclick="start()">Start</button>
  <button onclick="stop()">Stop</button>
  <span id="status"></span>
</div>
<label style="display:inline-block;margin-top:10px"><input type="checkbox" id="public" checked> List publicly on mc.zenithurl.com</label>
<pre id="log"></pre>
<script>
async function start(){ await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:document.getElementById('room').value, public:document.getElementById('public').checked})}); }
async function stop(){ await fetch('/api/stop',{method:'POST'}); }
async function tick(){ try{ const s=await (await fetch('/api/status')).json(); document.getElementById('status').textContent=s.running?(' live: '+s.room):' stopped'; document.getElementById('log').textContent=s.log.join('\\n'); }catch(e){} }
setInterval(tick,1000); tick();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(page());
  }
  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ running: !!child, room, log }));
  }
  if (req.method === 'POST' && url.pathname === '/api/start') {
    let body = ''; for await (const c of req) body += c;
    try { const b = JSON.parse(body || '{}'); start(b.room, b.public === false); } catch { /* ignore */ }
    res.writeHead(200); return res.end('{}');
  }
  if (req.method === 'POST' && url.pathname === '/api/stop') {
    stop(); res.writeHead(200); return res.end('{}');
  }
  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`ZenithMC Host panel: http://127.0.0.1:${PORT}`));
