import React, { useState, useEffect } from 'react';
import { Download, Terminal, Shield, Save, ArrowUpCircle, Globe, Server, Lock, Unlock, Copy, CheckCircle, ServerOff, Zap } from 'lucide-react';

export default function App() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [activeServers, setActiveServers] = useState([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [networkError, setNetworkError] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    // In a real scenario, this would trigger the actual file download
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Error handled silently
    }
    document.body.removeChild(textArea);
  };

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await fetch('https://api.zenithurl.com/live-servers');
        if (!response.ok) throw new Error();
        const data = await response.json();
        setActiveServers(data || []);
        setNetworkError(false);
      } catch {
        setActiveServers([]);
        setNetworkError(true);
      } finally {
        setIsLoadingServers(false);
      }
    };
    fetchServers();
    const interval = setInterval(fetchServers, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30">
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Globe className="text-emerald-500" />
            <span>mc.zenithurl.com</span>
          </div>
          <div className="flex gap-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest self-center">v1.1.0 PRO</span>
            <button className="text-sm font-medium text-slate-300 hover:text-white transition-colors">Login</button>
          </div>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-8 border border-emerald-500/20">
          <Zap size={14} /> NEW: One-Click Backups & Whitelist Controls
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-linear-to-br from-white to-slate-400 bg-clip-text text-transparent">
          The Ultimate <br />Self-Hosting Engine.
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Turn your PC into a high-performance Minecraft node. Distributed hosting with Pro-level management, instant URLs, and zero port forwarding.
        </p>
        <button 
          onClick={handleDownload}
          className="group inline-flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-lg px-10 py-5 rounded-2xl transition-all hover:scale-105 shadow-[0_0_50px_-10px_#10b981] disabled:opacity-70 disabled:hover:scale-100"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <div className="h-6 w-6 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={24} />
          )}
          {isDownloading ? 'Downloading...' : 'Download ZenithHost Pro'}
        </button>
      </header>

      <section className="max-w-6xl mx-auto px-4 grid md:grid-cols-4 gap-6 mb-24">
        {[
          { icon: <Shield />, title: "Live Whitelist", desc: "Toggle server access instantly from the dashboard." },
          { icon: <Save />, title: "One-Click Backup", desc: "Zip your entire world for safe keeping locally." },
          { icon: <ArrowUpCircle />, title: "Easy Upgrades", desc: "Switch Paper versions without losing data." },
          { icon: <Zap />, title: "Panic Switch", desc: "Kill all active processes in 1 second." }
        ].map(feat => (
          <div key={feat.title} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 hover:border-emerald-500/50 transition-colors">
            <div className="text-emerald-500 mb-4">{feat.icon}</div>
            <h3 className="font-bold mb-2">{feat.title}</h3>
            <p className="text-sm text-slate-500">{feat.desc}</p>
          </div>
        ))}
      </section>

      <section className="py-12 max-w-4xl mx-auto px-4">
        <h2 className="text-3xl font-bold mb-8">Zenith Live Network</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          {isLoadingServers ? (
            <div className="p-20 text-center text-slate-500 animate-pulse">Scanning Network...</div>
          ) : networkError ? (
            <div className="p-20 text-center text-red-400/80 flex flex-col items-center gap-3">
              <ServerOff size={32} />
              <p>Unable to connect to the Zenith API.</p>
            </div>
          ) : activeServers.length === 0 ? (
            <div className="p-20 text-center text-slate-500">No active nodes detected. Be the first!</div>
          ) : (
            activeServers.map((server, idx) => {
              const url = `${server.name}.mc.zenithurl.com`;
              const isCopied = copied === url;
              return (
                <div key={server.name} className={`p-6 flex items-center justify-between hover:bg-slate-800/50 transition-colors ${idx !== activeServers.length - 1 ? 'border-b border-slate-800' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-500">
                      <Server size={24} />
                    </div>
                    <div>
                      <div className="font-bold text-lg">{url}</div>
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-widest">Active Node</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(url)}
                    className="flex items-center gap-2 px-5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-bold hover:text-emerald-400 transition-colors"
                  >
                    {isCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
                    {isCopied ? 'Copied' : 'Copy URL'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <footer className="border-t border-slate-800 py-12 text-center text-slate-500 text-xs uppercase tracking-widest">
        <p>© 2026 ZenithURL Distributed Hosting • Pro Edition</p>
      </footer>
    </div>
  );
}