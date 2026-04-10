import React, { useState } from 'react';
import { Download, Terminal, Play, Globe } from 'lucide-react';

export default function App() {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    setIsDownloading(true);
    setTimeout(() => setIsDownloading(false), 2000);
    // When you have the .exe, change the button to an <a> tag pointing to /ZenithHost.exe
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-center">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Globe className="text-emerald-500" />
            <span>mc.zenithurl.com</span>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-6xl mx-auto px-4 py-24 text-center">
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

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 text-center text-slate-500 text-sm">
        <p>© 2026 ZenithURL Distributed Hosting.</p>
      </footer>
    </div>
  );
}