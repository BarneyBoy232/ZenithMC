// gui.mjs — local control panel for the host. Drives HostController in-process (so
// it works inside the packaged Electron app where there's no `node` to spawn).
// Exports startGuiServer for Electron; also runnable directly via `npm run gui`.

import http from 'node:http';
import { HostController } from './controller.mjs';

const controller = new HostController();

const STYLE = `<style>
  body{background:#020617;color:#e2e8f0;font-family:system-ui;max-width:760px;margin:36px auto;padding:0 16px}
  h1{color:#10b981} label{display:block;margin:8px 0;color:#94a3b8;font-size:14px}
  input{padding:8px 12px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;color:#e2e8f0;width:320px}
  button{padding:9px 16px;border-radius:8px;border:0;background:#10b981;color:#020617;font-weight:700;cursor:pointer;margin-right:8px}
  pre{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;height:320px;overflow:auto;margin-top:14px}
  .row{margin-top:14px}
</style>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>ZenithMC Host</title>${STYLE}</head><body>
<h1>ZenithMC Host</h1>
<p>Name your server and press Start. Share <code>mc.zenithurl.com/&lt;name&gt;</code> with friends.</p>
<label>Server name <input id="room" placeholder="barneysworld"></label>
<label>Minecraft version <input id="version" value="1.21.11"></label>
<label>Existing server folder (optional) <input id="dir" placeholder="leave blank to create a new world"></label>
<label><input type="checkbox" id="public" checked style="width:auto"> List publicly on mc.zenithurl.com</label>
<div class="row"><button onclick="start()">Start</button><button onclick="stop()">Stop</button> <span id="status"></span></div>
<pre id="log"></pre>
<script>
async function start(){
  const r = await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    room:document.getElementById('room').value,
    version:document.getElementById('version').value||undefined,
    dir:document.getElementById('dir').value||undefined,
    public:document.getElementById('public').checked,
  })});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('status').textContent=' '+(e.error||'failed'); }
}
async function stop(){ await fetch('/api/stop',{method:'POST'}); }
async function tick(){ try{ const s=await (await fetch('/api/status')).json(); document.getElementById('status').textContent=s.running?(' live: '+s.room+' ('+s.players+' online)'):' stopped'; document.getElementById('log').textContent=s.log.join('\\n'); }catch(e){} }
setInterval(tick,1000); tick();
</script></body></html>`;

export function startGuiServer({ port = Number(process.env.ZMC_GUI_PORT ?? 7800), baseDir } = {}) {
  if (baseDir) controller.baseDir = baseDir;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(page());
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(controller.state()));
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      let body = ''; for await (const c of req) body += c;
      try {
        const b = JSON.parse(body || '{}');
        await controller.start({ room: b.room, version: b.version, dir: b.dir, isPrivate: b.public === false });
        res.writeHead(200); return res.end('{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      controller.stop(); res.writeHead(200); return res.end('{}');
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1', () => console.log(`ZenithMC Host panel: http://127.0.0.1:${port}`));
  return { server, controller };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startGuiServer();
}
