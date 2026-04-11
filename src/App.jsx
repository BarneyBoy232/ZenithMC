import React, { useState, useEffect } from 'react';
import { Download, Terminal, Play, Globe, Server, Lock, Unlock, Copy, CheckCircle, ServerOff } from 'lucide-react';

export default function App() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [activeServers, setActiveServers] = useState([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [networkError, setNetworkError] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    // Trigger actual download in production
    // window.location.href = 'https://api.zenithurl.com/download/latest';
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
      // Ignored for UI
    }
    document.body.removeChild(textArea);
  };

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await fetch('https://api.zenithurl.com/live-servers');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setActiveServers(data || []);
        setNetworkError(false);
      } catch {
        // Silently caught to prevent console spam since the backend API is not built yet
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
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Globe className="text-emerald-500" />
            <span>mc.zenithurl.com</span>
          </div>
          <button className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            Command Center Login
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-6xl mx-auto px-4 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium mb-8 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Distributed Network Active
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
          Host on your PC.<br />Share like a Pro.
        </h1>
        
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          Turn your spare RAM into a professional Minecraft server. Download the ZenithHost app, pick a name, and get a clean URL instantly.
        </p>
        
        <button 
          onClick={handleDownload}
          className="group relative inline-flex items-center justify-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-lg px-8 py-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_#10b981]"
        >
          {isDownloading ? (
            <div className="h-6 w-6 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={24} className="group-hover:-translate-y-1 transition-transform" />
          )}
          {isDownloading ? 'Downloading...' : 'Download ZenithHost for Windows'}
        </button>
      </header>

      {/* Live Server Network */}
      <section className="py-12 max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Live Network Browser</h2>
            <p className="text-slate-400">Servers currently being hosted by the community via the Zenith app.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {isLoadingServers ? (
             <div className="p-12 text-center text-slate-500 animate-pulse">
               Connecting to Zenith Network...
             </div>
          ) : networkError ? (
             <div className="p-12 text-center text-red-400/80 flex flex-col items-center gap-3">
               <ServerOff size={32} />
               <p>Unable to connect to the Zenith API.<br/>(The backend server hasn't been built or deployed yet)</p>
             </div>
          ) : activeServers.length === 0 ? (
             <div className="p-12 text-center text-slate-500">
               No active servers found on the network.
             </div>
          ) : activeServers.map((server, idx) => {
            const url = `${server.name}.mc.zenithurl.com`;
            const isCopied = copied === url;
            
            return (
              <div 
                key={server.name} 
                className={`p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors hover:bg-slate-800/50 ${idx !== activeServers.length - 1 ? 'border-b border-slate-800' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${server.is_private ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                    {server.is_private ? <Lock size={20} className="text-amber-500" /> : <Unlock size={20} className="text-emerald-500" />}
                  </div>
                  <div>
                    <div className="font-bold text-lg flex items-center gap-2">
                        {server.name}
                        {server.is_private && <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">Private</span>}
                    </div>
                    <div className="text-sm text-slate-500 font-mono hidden sm:block">{server.players || 0} players online</div>
                  </div>
                </div>

                <div className="w-full sm:w-auto flex items-center gap-3">
                  <div className="flex-1 sm:flex-none bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 font-mono text-sm text-slate-300 flex items-center justify-between gap-4">
                    <span className="truncate">{server.is_private ? '••••••••.mc.zenithurl.com' : url}</span>
                    <button 
                      onClick={() => {
                          if(server.is_private) {
                              alert("This server requires a password to view the connection IP.");
                          } else {
                              copyToClipboard(url)
                          }
                      }}
                      className="text-slate-500 hover:text-emerald-400 transition-colors shrink-0"
                      title={server.is_private ? "Unlock URL" : "Copy URL"}
                    >
                      {isCopied ? <CheckCircle size={16} className="text-emerald-400" /> : (server.is_private ? <Lock size={16} /> : <Copy size={16} />)}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 mt-12 text-center text-slate-500 text-sm">
        <p>© 2026 ZenithURL Distributed Hosting.</p>
      </footer>
    </div>
  );
}