import React, { useState, useEffect } from 'react';
import { Download, Server, Terminal, Play, Copy, CheckCircle, Globe } from 'lucide-react';

export default function App() {
  const [copied, setCopied] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeServers, setActiveServers] = useState([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);

  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const handleDownload = () => {
    setIsDownloading(true);
    setTimeout(() => setIsDownloading(false), 2000);
    // When you have the .exe, change the button to an <a> tag pointing to /ZenithHost.exe
  };

  // Actively ping the Command Center for real servers
  useEffect(() => {
    const fetchLiveServers = async () => {
      try {
        const response = await fetch('https://api.zenithurl.com/live-servers'); 
        const data = await response.json();
        setActiveServers(data.servers || []);
      } catch (err) {
        // Fails gracefully if the API is offline
        setActiveServers([]);
      } finally {
        setIsLoadingServers(false);
      }
    };

    fetchLiveServers();
    const interval = setInterval(fetchLiveServers, 30000); // Update list every 30s
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
          Turn your spare RAM into a professional Minecraft server. Download the ZenithHost app, pick a name, and get a clean URL instantly. No port forwarding required.
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
        <p className="text-sm text-slate-500 mt-4">Requires Java 21 • v1.0.0 Beta</p>
      </header>

      {/* How it Works */}
      <section className="bg-slate-900 py-24 border-y border-slate-800">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">How it Works</h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-950 p-8 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Download size={100} />
              </div>
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 border border-slate-700 text-slate-300 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
                <span className="font-bold text-xl">1</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Download the App</h3>
              <p className="text-slate-400 leading-relaxed">
                Grab the lightweight .exe file. It contains the PaperMC engine and secure tunnel software built right in.
              </p>
            </div>

            <div className="bg-slate-950 p-8 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Terminal size={100} />
              </div>
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 border border-slate-700 text-slate-300 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
                <span className="font-bold text-xl">2</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Claim Your Name</h3>
              <p className="text-slate-400 leading-relaxed">
                Type in what you want your server to be called. The app handles the rest, starting the server and linking the domain.
              </p>
            </div>

            <div className="bg-slate-950 p-8 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Play size={100} />
              </div>
              <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-6 border border-slate-700 text-slate-300 group-hover:bg-emerald-500/10 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
                <span className="font-bold text-xl">3</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Share & Play</h3>
              <p className="text-slate-400 leading-relaxed">
                Give your friends your clean URL. No complicated IPs or ports to remember.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Server Network */}
      <section className="py-24 max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Live Network Status</h2>
            <p className="text-slate-400">Servers currently being hosted by the community.</p>
          </div>
          <Server className="text-slate-700 w-12 h-12" />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {isLoadingServers ? (
             <div className="p-12 text-center text-slate-500 animate-pulse">
               Scanning distributed network for active servers...
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
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Server size={20} className="text-emerald-500" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">{server.name}</div>
                    <div className="text-sm text-slate-500 font-mono hidden sm:block">via bore.pub tunnel</div>
                  </div>
                </div>

                <div className="w-full sm:w-auto flex items-center gap-3">
                  <div className="flex-1 sm:flex-none bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 font-mono text-sm text-slate-300 flex items-center justify-between gap-4">
                    <span className="truncate">{url}</span>
                    <button 
                      onClick={() => copyToClipboard(url)}
                      className="text-slate-500 hover:text-emerald-400 transition-colors shrink-0"
                      title="Copy URL"
                    >
                      {isCopied ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          
          {!isLoadingServers && activeServers.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No servers are currently online. Download the app to start yours!
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 text-center text-slate-500 text-sm">
        <p>© 2026 ZenithURL Distributed Hosting.</p>
        <p className="mt-2 text-slate-600">Not affiliated with Mojang or Microsoft.</p>
      </footer>
    </div>
  );
}