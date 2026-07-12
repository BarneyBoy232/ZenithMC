// gui.mjs — local control panel for the host, styled to match the website. Manages
// many servers via ServerManager (each its own free port), with Create-new / Existing
// tabs, a per-server Stop button, and [room]-tagged logs. Exported for Electron;
// also runnable via `npm run gui`.

import http from 'node:http';
import { ServerManager } from './manager.mjs';
import { listVersions } from './mcServer.mjs';

const manager = new ServerManager();

// Visible build stamp so it's obvious whether an installed app is stale.
const BUILD = '2026-07-12.1';

const LOGO = `<svg width="34" height="34" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#120a1a" stroke="#a855f7" stroke-width="2"/>
  <rect x="15" y="10" width="34" height="44" rx="6" fill="#33214d"/>
  <rect x="16" y="12" width="3" height="3" fill="#4a3170"/><rect x="45" y="12" width="3" height="3" fill="#4a3170"/>
  <rect x="16" y="44" width="3" height="3" fill="#4a3170"/><rect x="45" y="44" width="3" height="3" fill="#4a3170"/>
  <rect x="20" y="15" width="24" height="34" rx="8" fill="#7c3aed"/>
  <rect x="24" y="20" width="5" height="5" fill="#a855f7"/><rect x="33" y="26" width="6" height="6" fill="#c084fc"/>
  <rect x="25" y="34" width="6" height="6" fill="#a855f7"/><rect x="30" y="41" width="5" height="5" fill="#d8b4fe"/></svg>`;

const STYLE = `<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{background:#06070a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:28px 18px 48px;line-height:1.5}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;margin-bottom:2px}
  .sub{color:#64748b;font-size:13px;margin:0 0 22px}
  .card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px}
  .tabs{display:flex;gap:8px;margin-bottom:14px}
  .tab{padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:transparent;color:#94a3b8;font-weight:600;font-size:14px;cursor:pointer}
  .tab.active{background:rgba(124,58,237,.16);border-color:rgba(168,85,247,.45);color:#c084fc}
  label{display:block;color:#94a3b8;font-size:13px;margin:12px 0 6px}
  input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #1e293b;background:#0f172a;color:#e2e8f0;font-size:14px}
  .row{display:flex;gap:8px;align-items:stretch}
  .btn-alt{padding:0 16px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#cbd5e1;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
  .btn-alt:hover{border-color:rgba(255,255,255,.3)}
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
<p class="sub">Each server gets its own link: mc.zenithurl.com/&lt;name&gt; · build ${BUILD}</p>

<div class="card">
  <div class="tabs">
    <button class="tab active" id="t-new" onclick="tab('new')">Create new</button>
    <button class="tab" id="t-exist" onclick="tab('existing')">Existing</button>
  </div>

  <div id="pane-new">
    <label>Server name</label>
    <input id="n-room" placeholder="my-world">
    <label>Minecraft version</label>
    <select id="n-version"><option value="1.21.11">1.21.11</option></select>
    <label class="chk"><input type="checkbox" id="n-public" checked> List publicly on mc.zenithurl.com</label>
    <button class="btn" onclick="startNew()">Start new server</button>
  </div>

  <div id="pane-existing" class="hide">
    <label>Server folder</label>
    <div class="row">
      <input id="e-dir" placeholder="C:\\Users\\you\\Documents\\MyServer">
      <button class="btn-alt" onclick="browse()">Browse…</button>
    </div>
    <div class="hint">Attach a server you already have — pick or paste the folder that holds its .jar. The name, version and world are taken from what's there.</div>
    <label class="chk"><input type="checkbox" id="e-public" checked> List publicly on mc.zenithurl.com</label>
    <button class="btn" onclick="startExisting()">Attach and start</button>
  </div>
  <div class="err" id="err"></div>
</div>

<h2>Running servers</h2>
<div class="card"><table><thead><tr><th>Name</th><th>Port</th><th>Players</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>

<h2>Previous servers</h2>
<div class="card">
  <table><thead><tr><th>Name</th><th>Last started</th><th></th></tr></thead><tbody id="prev"></tbody></table>
  <div class="hint" id="msg"></div>
</div>

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
function startExisting(){
  const d = document.getElementById('e-dir').value.trim().replace(/^["']+|["']+$/g,'');
  post({ dir:d, public:document.getElementById('e-public').checked });
}
async function browse(){
  try{
    const r = await fetch('/api/pick-dir',{method:'POST'});
    const j = await r.json();
    if(j.dir) document.getElementById('e-dir').value = j.dir;
  }catch(e){}
}
async function loadVersions(){
  try{
    const j = await (await fetch('/api/versions')).json();
    if(Array.isArray(j.versions) && j.versions.length){
      document.getElementById('n-version').innerHTML =
        j.versions.map(v=>'<option value="'+v+'">'+v+'</option>').join('');
    }
  }catch(e){}
}
async function stop(room){ await fetch('/api/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})}); }
async function restart(room){
  document.getElementById('msg').textContent='Starting '+room+'…';
  const r = await fetch('/api/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('msg').textContent=e.error||'Failed to start.'; }
  else document.getElementById('msg').textContent='';
}
async function privacy(room, makePrivate){
  const r = await fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,private:makePrivate})});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('msg').textContent=e.error||'Failed to update privacy.'; }
  else document.getElementById('msg').textContent='';
  tick();
}
async function backup(room){
  document.getElementById('msg').textContent='Backing up '+room+'… (can take a minute on big worlds)';
  const r = await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  const j = await r.json().catch(()=>({}));
  document.getElementById('msg').textContent = r.ok ? 'Backup saved: '+j.path : (j.error||'Backup failed.');
}
async function tick(){
  try{
    const s=await (await fetch('/api/status')).json();
    document.getElementById('rows').innerHTML = s.servers.length
      ? s.servers.map(x=>'<tr><td class="mono">'+x.room+'</td><td>'+x.port+'</td><td>'+(x.running?x.players:'starting…')+'</td><td style="text-align:right"><button class="btn-stop" onclick="stop(\\''+x.room+'\\')">Stop</button></td></tr>').join('')
      : '<tr><td class="empty" colspan="4">No servers running.</td></tr>';
    document.getElementById('prev').innerHTML = (s.previous&&s.previous.length)
      ? s.previous.map(x=>'<tr><td class="mono">'+x.room+(x.private?' <span style="color:#64748b;font-size:11px">(private)</span>':'')+'</td><td>'+(x.lastStarted?new Date(x.lastStarted).toLocaleString():'—')+'</td><td style="text-align:right"><button class="btn-stop" onclick="restart(\\''+x.room+'\\')">Start</button> <button class="btn-stop" onclick="backup(\\''+x.room+'\\')">Backup</button> <button class="btn-stop" onclick="privacy(\\''+x.room+'\\','+(!x.private)+')">'+(x.private?'Make public':'Make private')+'</button></td></tr>').join('')
      : '<tr><td class="empty" colspan="3">Servers you\\'ve run before will show here.</td></tr>';
    document.getElementById('log').textContent=s.log.join('\\n');
  }catch(e){}
}
setInterval(tick,1000); tick(); loadVersions();
</script></body></html>`;

export function startGuiServer({ port = Number(process.env.ZMC_GUI_PORT ?? 7800), baseDir, pickDirectory } = {}) {
  if (baseDir) manager.baseDir = baseDir;
  manager.loadKnown(); // restore the remembered-servers list (async, non-blocking)
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
    if (req.method === 'GET' && url.pathname === '/api/versions') {
      const versions = await listVersions().catch(() => ['1.21.11']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ versions }));
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-dir') {
      let dir = null;
      try { dir = pickDirectory ? await pickDirectory() : null; } catch { dir = null; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ dir }));
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
    if (req.method === 'POST' && url.pathname === '/api/restart') {
      let body = ''; for await (const c of req) body += c;
      try {
        await manager.restart(JSON.parse(body || '{}').room);
        res.writeHead(200); return res.end('{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/privacy') {
      let body = ''; for await (const c of req) body += c;
      try {
        const b = JSON.parse(body || '{}');
        await manager.setPrivacy(b.room, b.private);
        res.writeHead(200); return res.end('{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/backup') {
      let body = ''; for await (const c of req) body += c;
      try {
        const path = await manager.backup(JSON.parse(body || '{}').room);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ path }));
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
