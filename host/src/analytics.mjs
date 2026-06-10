// analytics.mjs — turns raw join/leave events into player SESSIONS.
//
// This is the data your admin dashboard will show: who played, when, and for how
// long, across every server. The host app streams these records to the registry's
// admin path. Timestamps are injected (not read from the clock inside) so the logic
// is deterministic and unit-testable.

export class SessionTracker {
  constructor() {
    this.open = new Map(); // name -> joinedAt
    this.completed = []; // finished sessions
  }

  /** Record a join at time `at` (ms epoch). */
  join(name, at) {
    if (!this.open.has(name)) this.open.set(name, at);
  }

  /** Record a leave at time `at`; returns the completed session (or null). */
  leave(name, at) {
    const joinedAt = this.open.get(name);
    if (joinedAt == null) return null;
    this.open.delete(name);
    const session = { name, joinedAt, leftAt: at, durationMs: at - joinedAt };
    this.completed.push(session);
    return session;
  }

  /** Rollups for the admin view. */
  summary() {
    return {
      activePlayers: this.open.size,
      totalSessions: this.completed.length,
      totalPlaytimeMs: this.completed.reduce((sum, s) => sum + s.durationMs, 0),
    };
  }
}
