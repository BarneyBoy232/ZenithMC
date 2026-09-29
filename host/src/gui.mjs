// gui.mjs — local control panel for the host, styled to match the website. Manages
// many servers via ServerManager (each its own free port), with Create-new / Existing
// tabs, a per-server Stop button, and [room]-tagged logs. Exported for Electron;
// also runnable via `npm run gui`.

import http from 'node:http';
import { ServerManager } from './manager.mjs';
import { listVersions } from './mcServer.mjs';

const manager = new ServerManager();

// Visible build stamp so it's obvious whether an installed app is stale.
const BUILD = '2026-09-30.1';

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
  body{background:#0e1017;color:#e6eaf0;font-family:system-ui,-apple-system,sans-serif;max-width:780px;margin:0 auto;padding:0 18px 56px;line-height:1.55}
  .top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:22px 0 4px}
  .brand{display:flex;align-items:center;gap:11px;font-weight:700;font-size:20px}
  .sub{color:#7c899c;font-size:13px;margin:0 0 22px}
  .card{background:#171b23;border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:20px}
  .tabs{display:flex;gap:8px;margin-bottom:14px}
  .tab{padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#9aa6b6;font-weight:600;font-size:14px;cursor:pointer}
  .tab.active{background:rgba(139,92,246,.18);border-color:rgba(168,85,247,.5);color:#c4b5fd}
  label{display:block;color:#9aa6b6;font-size:13px;margin:12px 0 6px}
  input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #2a313d;background:#11151c;color:#e6eaf0;font-size:14px}
  .row{display:flex;gap:8px;align-items:stretch}
  .btn-alt{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:transparent;color:#d3d9e2;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none}
  .btn-alt:hover{border-color:rgba(255,255,255,.34);background:rgba(255,255,255,.05)}
  .hint{color:#7c899c;font-size:12px;margin-top:5px}
  .chk{display:flex;align-items:center;gap:8px;margin-top:14px;color:#cdd5e0;font-size:14px}
  .chk input{width:auto}
  .btn{margin-top:16px;padding:10px 18px;border-radius:12px;border:0;background:#8b5cf6;color:#fff;font-weight:700;font-size:14px;cursor:pointer}
  .btn:hover{background:#a78bfa}
  .btn-stop{padding:6px 13px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#e6eaf0;font-size:13px;cursor:pointer}
  .btn-stop:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.05)}
  .btn-stop:disabled{opacity:.4;cursor:not-allowed}
  .err{color:#f87171;font-size:13px;margin-top:10px;min-height:16px}
  h2{font-size:13px;font-weight:600;color:#9aa6b6;letter-spacing:.05em;text-transform:uppercase;margin:26px 0 10px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:11px 8px;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px}
  th{color:#7c899c;font-weight:500;font-size:12px}
  tr:last-child td{border-bottom:0}
  .mono{font-family:ui-monospace,monospace}
  .empty{color:#7c899c;padding:16px 8px}
  pre{background:#11151c;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:12px;height:260px;overflow:auto;font-size:12px;font-family:ui-monospace,monospace;color:#cdd5e0}
  .hide{display:none}
</style>`;

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>ZenithMC Host</title>${STYLE}</head><body>
<div class="top">
  <div class="brand">${LOGO} ZenithMC Host</div>
  <a class="btn-alt" href="https://zenithurl.com" target="_blank" rel="noopener">ZenithMC site ↗</a>
</div>
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

<h2>Servers</h2>
<div class="card">
  <table><thead><tr><th>Name</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table>
  <div class="hint" id="msg"></div>
</div>

<div id="detail" class="card hide" style="margin-top:14px"></div>

<h2>All activity</h2>
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
async function stop(room){
  document.getElementById('msg').textContent='Stopping '+room+'… (saving the world)';
  await fetch('/api/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  if(selRoom===room) setTimeout(()=>openServer(room),1200);
  setTimeout(()=>{ const m=document.getElementById('msg'); if(m.textContent.indexOf('Stopping '+room)===0) m.textContent=''; },9000);
}
async function restart(room){
  document.getElementById('msg').textContent='Starting '+room+'…';
  const r = await fetch('/api/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('msg').textContent=e.error||'Failed to start.'; }
  else document.getElementById('msg').textContent='';
  if(selRoom===room) setTimeout(()=>openServer(room),800);
}
async function privacy(room, makePrivate){
  const r = await fetch('/api/privacy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,private:makePrivate})});
  if(!r.ok){ const e=await r.json().catch(()=>({})); document.getElementById('msg').textContent=e.error||'Failed to update privacy.'; }
  else document.getElementById('msg').textContent='';
  if(selRoom===room) openServer(room);
}
async function backup(room){
  document.getElementById('msg').textContent='Backing up '+room+'… (can take a minute on big worlds)';
  const r = await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  const j = await r.json().catch(()=>({}));
  document.getElementById('msg').textContent = r.ok ? 'Backup saved: '+j.path : (j.error||'Backup failed.');
  if(selRoom===room) openServer(room); // refresh backups list
}

// ---- per-server detail panel ----
let selRoom=null, selDetail=null, lastLog=[];
async function openServer(room){
  selRoom=room;
  try{ selDetail=await (await fetch('/api/server?room='+encodeURIComponent(room))).json(); }
  catch(e){ return; }
  renderDetail();
}
function closeDetail(){ selRoom=null; selDetail=null; document.getElementById('detail').classList.add('hide'); }
function copyJoin(){ if(selDetail&&navigator.clipboard) navigator.clipboard.writeText(selDetail.joinUrl); }
function openDir(){ if(selDetail) fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:selDetail.dir})}); }
function openBackups(){ if(selDetail) fetch('/api/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:selDetail.backupsDir})}); }
function renderDetail(){
  const d=selDetail; if(!d) return;
  const el=document.getElementById('detail'); el.classList.remove('hide');
  const status = d.running ? '<span style="color:#34d399">● Online</span> · '+d.players+' player'+(d.players===1?'':'s') : '<span style="color:#9aa6b6">Stopped</span>';
  // version + upgrade
  let versionLine, upgradeBtn='';
  if(d.attached){
    versionLine = 'Version '+d.version+' <span style="color:#7c899c">(attached — upgrade in Minecraft)</span>';
  } else if(d.latestVersion && d.version===d.latestVersion){
    versionLine = 'Version '+d.version+' <span style="color:#34d399">· latest</span>';
  } else if(d.latestVersion){
    versionLine = 'Version '+d.version+' <span style="color:#c4b5fd">· '+d.latestVersion+' available</span>';
    upgradeBtn = '<button class="btn-stop" onclick="upgrade(\\''+d.room+'\\')"'+(d.running?' disabled title="Stop the server first"':'')+'>Upgrade to '+d.latestVersion+'</button>';
  } else {
    versionLine = 'Version '+d.version;
  }
  const backups = (d.backups&&d.backups.length)
    ? d.backups.map(b=>'<div class="mono" style="font-size:12px;color:#9aa6b6">'+b.name+' · '+(b.size/1048576).toFixed(1)+' MB</div>').join('')
    : '<div class="hint">No backups yet.</div>';
  const startStop = d.running
    ? '<button class="btn-stop" onclick="stop(\\''+d.room+'\\')">Stop</button>'
    : '<button class="btn-stop" onclick="restart(\\''+d.room+'\\')">Start</button>';
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-weight:700;font-size:16px">'+d.room+(d.private?' <span style="color:#7c899c;font-size:11px">(private)</span>':'')+'</div><button class="btn-alt" onclick="closeDetail()">Close</button></div>'
    +'<div style="font-size:13px;margin-bottom:2px">'+status+'</div>'
    +'<div style="font-size:13px;color:#cdd5e0;margin-bottom:4px">'+versionLine+'</div>'
    +'<label>Connector page — friends open this to join</label><div class="row"><input readonly value="'+d.joinUrl+'"><button class="btn-alt" onclick="copyJoin()">Copy</button><a class="btn-alt" href="https://'+d.joinUrl+'" target="_blank" rel="noopener">Open connector ↗</a></div>'
    +'<label>Stored location</label><div class="row"><input readonly value="'+d.dir+'"><button class="btn-alt" onclick="openDir()">Open</button></div>'
    +'<label>Backups</label>'+backups
    +'<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">'+startStop
    +'<button class="btn-stop" onclick="backup(\\''+d.room+'\\')">Back up now</button>'
    +'<button class="btn-stop" onclick="openBackups()">Open backups folder</button>'
    +upgradeBtn
    +'<button class="btn-stop" onclick="privacy(\\''+d.room+'\\','+(!d.private)+')">'+(d.private?'Make public':'Make private')+'</button></div>'
    +'<label>Console</label><pre id="detail-log" style="height:200px"></pre>';
  updateDetailLog();
}
async function upgrade(room){
  document.getElementById('msg').textContent='Upgrading '+room+'… (downloading the new server)';
  const r = await fetch('/api/upgrade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room})});
  const j = await r.json().catch(()=>({}));
  document.getElementById('msg').textContent = r.ok
    ? (j.changed ? 'Upgraded to '+j.version+' — Start it to apply (the world migrates on first launch).' : 'Already on the latest ('+j.version+').')
    : (j.error||'Upgrade failed.');
  if(selRoom===room) openServer(room);
}
function updateDetailLog(){
  if(!selRoom) return;
  const pre=document.getElementById('detail-log'); if(!pre) return;
  const atBottom = pre.scrollTop+pre.clientHeight >= pre.scrollHeight-4;
  pre.textContent=(lastLog||[]).filter(l=>l.indexOf('['+selRoom+'] ')===0).join('\\n');
  if(atBottom) pre.scrollTop=pre.scrollHeight;
}
async function tick(){
  try{
    const s=await (await fetch('/api/status')).json();
    lastLog=s.log;
    const rows=[];
    for(const x of s.servers){
      const status = x.running ? ('<span style="color:#34d399">● Online</span> · '+x.players+' player'+(x.players===1?'':'s')) : '<span style="color:#94a3b8">Starting…</span>';
      rows.push('<tr><td class="mono">'+x.room+'</td><td>'+status+'</td><td style="text-align:right"><a class="btn-stop" style="text-decoration:none" href="https://mc.zenithurl.com/'+x.room+'" target="_blank" rel="noopener">Connector ↗</a> <button class="btn-stop" onclick="openServer(\\''+x.room+'\\')">Open</button> <button class="btn-stop" onclick="stop(\\''+x.room+'\\')">Stop</button></td></tr>');
    }
    for(const x of (s.previous||[])){
      const last = x.lastStarted ? ' · last run '+new Date(x.lastStarted).toLocaleString() : '';
      const name = x.room + (x.private?' <span style="color:#64748b;font-size:11px">(private)</span>':'');
      rows.push('<tr><td class="mono">'+name+'</td><td style="color:#94a3b8">Stopped'+last+'</td><td style="text-align:right"><button class="btn-stop" onclick="openServer(\\''+x.room+'\\')">Open</button> <button class="btn-stop" onclick="restart(\\''+x.room+'\\')">Start</button></td></tr>');
    }
    document.getElementById('rows').innerHTML = rows.length ? rows.join('') : '<tr><td class="empty" colspan="3">No servers yet — create one above.</td></tr>';
    document.getElementById('log').textContent=s.log.join('\\n');
    updateDetailLog();
  }catch(e){}
}
setInterval(tick,1000); tick(); loadVersions();
</script></body></html>`;

export function startGuiServer({ port = Number(process.env.ZMC_GUI_PORT ?? 7800), baseDir, pickDirectory, openPath } = {}) {
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
    if (req.method === 'GET' && url.pathname === '/api/server') {
      try {
        const detail = await manager.serverDetail(url.searchParams.get('room') || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(detail));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/open') {
      let body = ''; for await (const c of req) body += c;
      let ok = false;
      try { ok = openPath ? await openPath(JSON.parse(body || '{}').path) : false; } catch { ok = false; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok }));
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
    if (req.method === 'POST' && url.pathname === '/api/upgrade') {
      let body = ''; for await (const c of req) body += c;
      try {
        const result = await manager.upgrade(JSON.parse(body || '{}').room);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
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
