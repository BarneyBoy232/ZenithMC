import React, { useState, useEffect } from 'react';
import { Download, Terminal, Globe, Server, ServerOff, Copy, CheckCircle, Zap, Gauge, Infinity as InfinityIcon, Wifi, ArrowRight, Users, LogIn } from 'lucide-react';
import { subscribeRooms } from './lib/registry.js';
import { gate } from './lib/auth.js';

export default function App() {
  const [copied, setCopied] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [netError, setNetError] = useState(false);
  const [user, setUser] = useState(null);

  const signIn = async () => {
    try { setUser(await gate.signIn()); } catch { /* cancelled */ }
  };
  const signOut = async () => {
    try { await gate.signOut?.(); } catch { /* no-op */ }
    setUser(null);
  };

  useEffect(() => {
    let unsub;
    try {
      unsub = subscribeRooms((rooms) => { setServers(rooms); setNetError(false); setLoading(false); });
    } catch { setNetError(true); setLoading(false); }
    return () => unsub && unsub();
  }, []);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-100 font-sans selection:bg-emerald-500/30 antialiased">
      {/* nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#06070a]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25">
              <Globe className="text-emerald-400" size={18} />
            </span>
            <span>mc.zenithurl.com</span>
          </div>
          {user ? (
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {user.email}
            </button>
          ) : (
            <button onClick={signIn} className="flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white px-4 py-1.5 rounded-full border border-white/10 hover:border-emerald-500/40 hover:bg-white/5 transition-colors">
              <LogIn size={15} /> Sign in
            </button>
          )}
        </div>
      </nav>

      {/* hero */}
      <header className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[820px] h-[820px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="relative max-w-4xl mx-auto px-5 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Free forever · no card · no port forwarding
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Your PC is the <br />
            <span className="bg-linear-to-br from-emerald-300 via-emerald-400 to-teal-500 bg-clip-text text-transparent">Minecraft server.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Run a server on your own machine and share it with a link. Friends connect
            <span className="text-slate-200"> straight to you</span> — no relay, no data cap, no setup.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="/downloads/ZenithMC-Host.exe" className="group inline-flex items-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#06070a] font-bold text-base px-8 py-4 rounded-2xl transition-all hover:scale-[1.03] shadow-[0_0_60px_-12px_#10b981]">
              <Download size={20} /> Download for Windows
              <ArrowRight size={18} className="opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all" />
            </a>
            <a href="/downloads/ZenithMC-Host-Console.exe" className="inline-flex items-center gap-2 border border-white/10 hover:border-emerald-500/40 hover:bg-white/5 text-slate-300 hover:text-white font-medium px-6 py-4 rounded-2xl transition-colors">
              <Terminal size={18} /> Console version
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Gauge size={15} className="text-emerald-400/80" /> ~direct latency</span>
            <span className="inline-flex items-center gap-1.5"><InfinityIcon size={15} className="text-emerald-400/80" /> unlimited servers</span>
            <span className="inline-flex items-center gap-1.5"><Wifi size={15} className="text-emerald-400/80" /> no port forwarding</span>
          </div>
        </div>
      </header>

      {/* how it works */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400/80 mb-12">How it works</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { n: '1', icon: <Server size={22} />, title: 'Host', desc: 'Open the app, name your server, hit start. Your PC runs it.' },
            { n: '2', icon: <Globe size={22} />, title: 'Share', desc: 'Send friends your link — mc.zenithurl.com/yourname.' },
            { n: '3', icon: <Users size={22} />, title: 'Play', desc: 'They click connect and join. Traffic goes straight PC to PC.' },
          ].map((s) => (
            <div key={s.n} className="relative bg-white/[0.03] border border-white/10 rounded-3xl p-7 hover:border-emerald-500/30 transition-colors">
              <span className="absolute top-6 right-7 text-5xl font-black text-white/5">{s.n}</span>
              <div className="w-11 h-11 grid place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-5">{s.icon}</div>
              <h3 className="font-bold text-lg mb-1.5">{s.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* why */}
      <section className="max-w-5xl mx-auto px-5 py-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Zap size={20} />, title: 'Direct P2P', desc: 'No middleman relay — friends connect right to your machine.' },
          { icon: <InfinityIcon size={20} />, title: 'No data cap', desc: 'Nothing meters your traffic. Only your PC is the limit.' },
          { icon: <Server size={20} />, title: 'Unlimited servers', desc: 'Run as many as your hardware handles, each its own link.' },
          { icon: <Gauge size={20} />, title: 'Low latency', desc: 'A direct path means near-LAN ping for nearby players.' },
        ].map((f) => (
          <div key={f.title} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <div className="text-emerald-400 mb-3">{f.icon}</div>
            <h3 className="font-bold mb-1">{f.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* live network */}
      <section className="max-w-3xl mx-auto px-5 py-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Live now</h2>
          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> updating live
          </span>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl overflow-hidden">
          {loading ? (
            <div className="p-16 text-center text-slate-500 animate-pulse">Scanning the network…</div>
          ) : netError ? (
            <div className="p-16 text-center text-red-400/70 flex flex-col items-center gap-3"><ServerOff size={28} /> Couldn't reach the network.</div>
          ) : servers.length === 0 ? (
            <div className="p-16 text-center text-slate-500">No servers online right now. Be the first.</div>
          ) : (
            servers.map((s, i) => {
              const url = `mc.zenithurl.com/${s.room}`;
              return (
                <div key={s.room} className={`px-6 py-5 flex items-center justify-between hover:bg-white/[0.03] transition-colors ${i !== servers.length - 1 ? 'border-b border-white/5' : ''}`}>
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-11 h-11 shrink-0 grid place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><Server size={20} /></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{url}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5"><Users size={12} /> {s.playerCount} online</div>
                    </div>
                  </div>
                  <button onClick={() => copy(url)} className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:text-emerald-400 hover:border-emerald-500/30 transition-colors">
                    {copied === url ? <CheckCircle size={15} /> : <Copy size={15} />}{copied === url ? 'Copied' : 'Copy'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 text-center">
        <div className="text-slate-600 text-xs uppercase tracking-[0.2em] inline-flex items-center gap-2">
          <Zap size={12} className="text-emerald-500" /> ZenithMC · direct peer-to-peer hosting
        </div>
      </footer>
    </div>
  );
}
