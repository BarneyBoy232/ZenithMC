// gui.mjs — local control panel for the host. Manages MANY servers via ServerManager
// (each its own free port), with a per-server Stop button and [room]-tagged logs.
// Exports startGuiServer for Electron; also runnable directly via `npm run gui`.

import http from 'node:http';
import { ServerManager } from './manager.mjs';

const manager = new ServerManager();

const STYLE = `<style>
  body{background:#020617;color:#e2e8f0;font-family:system-ui;max-width:820px;margin:32px auto;padding:0 16px}
  h1{color:#10b981;margin-bottom:4px} h2{font-size:15px;color:#94a3b8;margin:22px 0 8px}
  label{display:block;margin:8px 0;color:#94a3b8;font-size:13px}
  input{padding:8px 12px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#e2e8f0;width:360px;max-width:100%}
  .hint{color:#64748b;font-size:12px;margin-top:2px}
  button{padding:8px 14px;border-radius:8px;border:0;background:#10b981;color:#020617;font-weight:700;cursor:pointer}
  button.stop{background:#1e293b;color:#e2e8f0}
  table{width:100%;border-collapse:collapse;margin-top:6px} td,th{text-align:left;padding:8px;border-bottom:1px solid #1e293b;font-size:14px}
  pre{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;height:300px;overflow:auto;margin-top:6px;font-size:12px}
  .err{color:#f87171;font-size:13px;min-height:18px}
</style>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>ZenithMC Host</title>${STYLE}</head><body>
<h1>ZenithMC Host</h1>
<p class="hint">Each server you start gets its own link: mc.zenithurl.com/&lt;name&gt;</p>

<h2>Start a server</h2>
<label>Server name <input id="room" placeholder="barneysworld"></label>
<label>Minecraft version <input id="version" value="1.21.11"></label>
<label>Existing server folder (optional)
  <input id="dir" placeholder="C:\\Users\\you\\Documents\\MyServer">
  <div class="hint">A full folder path to an existing server (the folder that holds its world). Leave blank to create a brand-new world.</div>
</label>
<label><input type="checkbox" id="public" checked style="width:auto"> List publicly on mc.zenithurl.com</label>
<div><button onclick="start()">Start server</button> <span id="err" class="err"></span></div>

<h2>Running servers</h2>
<table id="servers"><thead><tr><th>Name</th><th>Port</th><th>Players</th><th></th></tr></thead><tbody id="rows"></tbody></table>

<h2>Console</h2>
<pre id="log"></pre>
<script>
async function start(){
  document.getElementById('err').textContent='';
  const r = await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    room:document.getElementById('room').value,
    version:document.getElementById('version').value||undefined,
    dir:document.getElementById('dir').value||undefined,
    public:document.getElementById('public').checked,
  })});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('err').textContent=e.error||'failed'; }
  else document.getElementById('room').value='';
}
async function stop(room){ await fetch('/api/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})}); }
async function tick(){
  try{
    const s=await (await fetch('/api/status')).json();
    document.getElementById('rows').innerHTML = s.servers.length
      ? s.servers.map(x=>'<tr><td>'+x.room+'</td><td>'+x.port+'</td><td>'+(x.running?x.players:'starting…')+'</td><td><button class="stop" onclick="stop(\\''+x.room+'\\')">Stop</button></td></tr>').join('')
      : '<tr><td colspan="4" style="color:#64748b">No servers running.</td></tr>';
    document.getElementById('log').textContent=s.log.join('\\n');
  }catch(e){}
}
setInterval(tick,1000); tick();
</script></body></html>`;

export function startGuiServer({ port = Number(process.env.ZMC_GUI_PORT ?? 7800), baseDir } = {}) {
  if (baseDir) manager.baseDir = baseDir;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page());
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(manager.state()));
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      let body = ''; for await (const c of req) body += c;
      try {
        const b = JSON.parse(body || '{}');
        await manager.start({ room: b.room, version: b.version, dir: b.dir, isPrivate: b.public === false });
        res.writeHead(200); return res.end('{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      let body = ''; for await (const c of req) body += c;
      try { manager.stop(JSON.parse(body || '{}').room); } catch { /* ignore */ }
      res.writeHead(200); return res.end('{}');
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1', () => console.log(`ZenithMC Host panel: http://127.0.0.1:${port}`));
  return { server, manager };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startGuiServer();
}
