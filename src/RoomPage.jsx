import React, { useState, useEffect, useCallback } from 'react';
import { Globe, Server, ServerOff, Copy, CheckCircle, Download, Users, Zap } from 'lucide-react';
import { fetchRoom } from './lib/registry.js';

// The per-subdomain page: xxx.mc.zenithurl.com
// This is "Version A" — it never carries game traffic. It confirms the server is
// online, gives the one-time connector download, and shows exactly what to paste
// into Minecraft. The connector on the friend's PC does the real P2P connection.

const PASTE_ADDRESS = 'localhost:25565'; // what the connector exposes locally

export default function RoomPage({ room }) {
  const [state, setState] = useState({ loading: true, data: null });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchRoom(room);
    setState({ loading: false, data });
  }, [room]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // live refresh
    return () => clearInterval(t);
  }, [load]);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const online = state.data?.online;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30">
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-2 font-bold text-xl tracking-tight">
          <Globe className="text-emerald-500" />
          <span>{room}<span className="text-slate-500">.mc.zenithurl.com</span></span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 py-16">
        {/* Status card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                {online ? <Server size={26} /> : <ServerOff size={26} />}
              </div>
              <div>
                <div className="font-bold text-2xl">{room}</div>
                <div className={`text-xs uppercase font-bold tracking-widest ${online ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {state.loading ? 'Checking…' : online ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>
            {online && (
              <div className="flex items-center gap-2 text-slate-300">
                <Users size={18} className="text-emerald-500" />
                <span className="font-bold text-lg">{state.data.playerCount}</span>
              </div>
            )}
          </div>
          {online && state.data.motd && (
            <p className="mt-5 text-slate-400 text-sm border-t border-slate-800 pt-5">{state.data.motd}</p>
          )}
        </div>

        {online ? (
          <>
            {/* Step 1: connector */}
            <Step n={1} title="Get the connector (first time only)">
              <p className="text-slate-400 text-sm mb-4">
                A tiny helper that creates the direct connection. Download once — after that it
                runs quietly and you never touch it again.
              </p>
              <button className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all hover:scale-105">
                <Download size={20} /> Download Connector
              </button>
            </Step>

            {/* Step 2: paste */}
            <Step n={2} title="Paste into Minecraft">
              <p className="text-slate-400 text-sm mb-4">
                In Minecraft → Multiplayer → Add Server, paste this address:
              </p>
              <div className="flex items-center gap-3 bg-slate-950 border border-slate-700 rounded-xl p-2 pl-5">
                <code className="flex-1 font-mono text-emerald-400 text-lg">{PASTE_ADDRESS}</code>
                <button
                  onClick={() => copy(PASTE_ADDRESS)}
                  className="flex items-center gap-2 px-5 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-bold hover:text-emerald-400 transition-colors"
                >
                  {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-slate-600 text-xs mt-3">
                The connector confirms the exact port if 25565 is busy on your PC.
              </p>
            </Step>
          </>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">
            <ServerOff size={32} className="mx-auto mb-4" />
            <p>This server is offline right now.</p>
            <p className="text-sm mt-2">Ask the host to open their ZenithMC app, then refresh.</p>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 py-10 text-center text-slate-500 text-xs uppercase tracking-widest">
        <span className="inline-flex items-center gap-1"><Zap size={12} className="text-emerald-500" /> Direct P2P • no relay • no data cap</span>
      </footer>
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center">{n}</span>
        <h3 className="font-bold text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}
