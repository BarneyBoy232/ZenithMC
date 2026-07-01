// gui.mjs — local control panel for the host, styled to match the website. Manages
// many servers via ServerManager (each its own free port), with Create-new / Existing
// tabs, a per-server Stop button, and [room]-tagged logs. Exported for Electron;
// also runnable via `npm run gui`.

import http from 'node:http';
import { ServerManager } from './manager.mjs';

const manager = new ServerManager();

const LOGO = `<svg width="34" height="34" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#0b1220" stroke="#10b981" stroke-width="2"/>
  <polygon points="32,14 45.9,22 32,30 18.1,22" fill="#34d399"/>
  <polygon points="45.9,22 45.9,38 32,46 32,30" fill="#10b981"/>
  <polygon points="18.1,22 18.1,38 32,46 32,30" fill="#059669"/></svg>`;

const STYLE = `<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{background:#06070a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:28px 18px 48px;line-height:1.5}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;margin-bottom:2px}
  .sub{color:#64748b;font-size:13px;margin:0 0 22px}
  .card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px}
  .tabs{display:flex;gap:8px;margin-bottom:14px}
  .tab{padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#94a3b8;font-weight:600;font-size:14px;cursor:pointer}
  .tab.active{background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.4);color:#34d399}
  label{display:block;color:#94a3b8;font-size:13px;margin:12px 0 6px}
  input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #1e293b;background:#0f172a;color:#e2e8f0;font-size:14px}
  .hint{color:#64748b;font-size:12px;margin-top:5px}
  .chk{display:flex;align-items:center;gap:8px;margin-top:14px;color:#cbd5e1;font-size:14px}
  .chk input{width:auto}
  .btn{margin-top:16px;padding:10px 18px;border-radius:12px;border:0;background:#10b981;color:#06070a;font-weight:700;font-size:14px;cursor:pointer}
  .btn:hover{background:#34d399}
  .btn-stop{padding:6px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#e2e8f0;font-size:13px;cursor:pointer}
  .err{color:#f87171;font-size:13px;margin-top:10px;min-height:16px}
  h2{font-size:14px;font-weight:600;color:#94a3b8;letter-spacing:.04em;text-transform:uppercase;margin:26px 0 10px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.06);font-size:14px}
  th{color:#64748b;font-weight:500;font-size:12px}
  .mono{font-family:ui-monospace,monospace}
  .empty{color:#64748b;padding:16px 8px}
  pre{background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;height:280px;overflow:auto;font-size:12px;font-family:ui-monospace,monospace;color:#cbd5e1}
  .hide{display:none}
</style>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>ZenithMC Host</title>${STYLE}</head><body>
<div class="brand">${LOGO} ZenithMC Host</div>
<p class="sub">Each server gets its own link: mc.zenithurl.com/&lt;name&gt;</p>

<div class="card">
  <div class="tabs">
    <button class="tab active" id="t-new" onclick="tab('new')">Create new</button>
    <button class="tab" id="t-exist" onclick="tab('existing')">Existing</button>
  </div>

  <div id="pane-new">
    <label>Server name</label>
    <input id="n-room" placeholder="barneysworld">
    <label>Minecraft version</label>
    <input id="n-version" value="1.21.11">
    <label class="chk"><input type="checkbox" id="n-public" checked> List publicly on mc.zenithurl.com</label>
    <button class="btn" onclick="startNew()">Start new server</button>
  </div>

  <div id="pane-existing" class="hide">
    <label>Server folder</label>
    <input id="e-dir" placeholder="C:\\Users\\you\\Documents\\MyServer">
    <div class="hint">Attach a server you already have — paste the folder that holds it. The name, version and world are taken from what's there.</div>
    <label class="chk"><input type="checkbox" id="e-public" checked> List publicly on mc.zenithurl.com</label>
    <button class="btn" onclick="startExisting()">Attach and start</button>
  </div>
  <div class="err" id="err"></div>
</div>

<h2>Running servers</h2>
<div class="card"><table><thead><tr><th>Name</th><th>Port</th><th>Players</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>

<h2>Console</h2>
<pre id="log"></pre>

<script>
function tab(which){
  const isNew = which==='new';
  document.getElementById('t-new').classList.toggle('active',isNew);
  document.getElementById('t-exist').classList.toggle('active',!isNew);
  document.getElementById('pane-new').classList.toggle('hide',!isNew);
  document.getElementById('pane-existing').classList.toggle('hide',isNew);
  document.getElementById('err').textContent='';
}
async function post(body){
  document.getElementById('err').textContent='';
  const r = await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('err').textContent=e.error||'Failed to start.'; }
}
function startNew(){ post({ room:document.getElementById('n-room').value, version:document.getElementById('n-version').value||undefined, public:document.getElementById('n-public').checked }); }
function startExisting(){ post({ dir:document.getElementById('e-dir').value, public:document.getElementById('e-public').checked }); }
async function stop(room){ await fetch('/api/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})}); }
async function tick(){
  try{
    const s=await (await fetch('/api/status')).json();
    document.getElementById('rows').innerHTML = s.servers.length
      ? s.servers.map(x=>'<tr><td class="mono">'+x.room+'</td><td>'+x.port+'</td><td>'+(x.running?x.players:'starting…')+'</td><td style="text-align:right"><button class="btn-stop" onclick="stop(\\''+x.room+'\\')">Stop</button></td></tr>').join('')
      : '<tr><td class="empty" colspan="4">No servers running.</td></tr>';
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
