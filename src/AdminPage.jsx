import React, { useState, useEffect } from 'react';
import { Globe, Server, ServerOff, Users, Lock, RefreshCw } from 'lucide-react';
import { subscribeAllRooms, subscribeSessions } from './lib/registry.js';
import { gate, ADMIN_EMAIL } from './lib/auth.js';

function fmtMins(ms) {
  return ms ? `${(ms / 60000).toFixed(1)} min` : '—';
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]);

  const authorized = user && user.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!authorized) return;
    const unsubR = subscribeAllRooms(setRooms);
    const unsubS = subscribeSessions((s) => setSessions(s.sort((a, b) => (b.leftAt || 0) - (a.leftAt || 0))));
    return () => { unsubR(); unsubS(); };
  }, [authorized]);

  const signIn = async () => {
    setError(null);
    try {
      setUser(await gate.signIn());
    } catch (e) {
      setError(e.message || 'Sign-in failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans">
      <nav className="border-b border-slate-800 px-4 h-16 flex items-center gap-2 font-bold text-xl">
        <Globe className="text-emerald-500" /> ZenithMC admin
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {!user ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
            <Lock className="mx-auto mb-4 text-emerald-500" size={32} />
            <p className="text-slate-400 mb-6">Sign in to view the live network.</p>
            <button onClick={signIn} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-3 rounded-xl">
              Sign in with Google
            </button>
            {error && <p className="text-red-400/80 text-sm mt-4">{error}</p>}
          </div>
        ) : !authorized ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400">
            <ServerOff className="mx-auto mb-4 text-red-400/80" size={32} />
            <p>Signed in as {user.email}, but this account is not an admin.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <Stat label="Servers online" value={rooms.filter((r) => r.online).length} />
              <Stat label="Players online" value={rooms.filter((r) => r.online).reduce((n, r) => n + (r.playerCount || 0), 0)} />
              <Stat label="Total sessions" value={sessions.length} />
            </div>

            <h2 className="text-lg font-medium mb-3 flex items-center gap-2"><Server size={18} className="text-emerald-500" /> Servers</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-10">
              {rooms.length === 0 ? <Empty text="No servers yet." /> : rooms.map((r, i) => (
                <Row key={r.room} last={i === rooms.length - 1}>
                  <span className="font-mono">{r.room}</span>
                  <span className={r.online ? 'text-emerald-400' : 'text-slate-500'}>{r.online ? 'online' : 'offline'}</span>
                  <span className="flex items-center gap-1 text-slate-300"><Users size={14} />{r.playerCount || 0}</span>
                  <span className="text-slate-500">{r.version || '—'}</span>
                </Row>
              ))}
            </div>

            <h2 className="text-lg font-medium mb-3 flex items-center gap-2"><RefreshCw size={18} className="text-emerald-500" /> Recent sessions</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              {sessions.length === 0 ? <Empty text="No sessions yet." /> : sessions.slice(0, 50).map((s, i) => (
                <Row key={i} last={i === Math.min(sessions.length, 50) - 1}>
                  <span className="font-mono">{s.room}</span>
                  <span>{s.name}</span>
                  <span className="text-slate-400">{fmtMins(s.durationMs)}</span>
                  <span className="text-slate-500" />
                </Row>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="text-3xl font-bold text-emerald-400">{value}</div>
      <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{label}</div>
    </div>
  );
}
function Row({ children, last }) {
  return <div className={`grid grid-cols-4 gap-3 px-5 py-3 text-sm ${last ? '' : 'border-b border-slate-800'}`}>{children}</div>;
}
function Empty({ text }) {
  return <div className="p-10 text-center text-slate-500">{text}</div>;
}
