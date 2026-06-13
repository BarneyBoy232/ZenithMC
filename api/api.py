"""
ZenithMC backend — the broker between host PCs and the website.

Design (P2P model):
  - The host app POSTs its room status here (/sync). We persist it in Firestore
    under the `from_zenithmc/` sub-project of the ZenithURL project.
  - The website reads live rooms (/live-servers) and a single room (/room/<name>).
  - NO game traffic passes through here — only tiny text records. Game packets go
    directly PC <-> PC over the P2P link.

Credentials: set the env var FIREBASE_SERVICE_ACCOUNT to the JSON of a service
account key for project `zenithurl-e9909` (generate it FREE in the Firebase
console -> Project settings -> Service accounts; no billing/card needed). If the
var is absent we fall back to an in-memory store so local dev still runs.

NOTE: the previous version hard-coded a Cloudflare API token and wrote SRV records
pointing at bore.pub. That relay path is retired (it breaks the no-cap / <=50ms
rules) and the secret was removed — rotate that token in Cloudflare regardless,
since it remains in git history.
"""

import os
import json
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

SUBPROJECT = "from_zenithmc"  # the Abstrak sub-project (a Firestore collection)


# --------------------------------------------------------------------------- #
# Storage: Firestore when credentials are present, else in-memory for dev.
# --------------------------------------------------------------------------- #
class MemoryStore:
    def __init__(self):
        self.rooms = {}
        self.sessions = []
        self.signals = {}  # (room, session) -> {"friend": [...], "host": [...]}

    def upsert_room(self, name, data):
        self.rooms[name] = {**self.rooms.get(name, {}), **data, "room": name}

    def delete_room(self, name):
        self.rooms.pop(name, None)

    def get_room(self, name):
        return self.rooms.get(name)

    def public_rooms(self):
        return [r for r in self.rooms.values() if r.get("online") and not r.get("private")]

    def add_session(self, session):
        self.sessions.append(session)

    # --- WebRTC signaling mailbox (one box per friend<->host connection) ---
    def signal_post(self, room, session, role, msg):
        box = self.signals.setdefault((room, session), {"friend": [], "host": []})
        box[role].append(msg)

    def signal_get(self, room, session, reader):
        other = "host" if reader == "friend" else "friend"
        box = self.signals.get((room, session))
        return list(box[other]) if box else []

    def pending_sessions(self, room):
        return [s for (r, s), box in self.signals.items() if r == room and box["friend"]]


class FirestoreStore:
    def __init__(self, db):
        self.db = db
        self.col = db.collection(SUBPROJECT)

    def upsert_room(self, name, data):
        self.col.document(f"room_{name}").set({**data, "room": name, "kind": "room"}, merge=True)

    def delete_room(self, name):
        self.col.document(f"room_{name}").set({"online": False}, merge=True)

    def get_room(self, name):
        doc = self.col.document(f"room_{name}").get()
        return doc.to_dict() if doc.exists else None

    def public_rooms(self):
        q = self.col.where("kind", "==", "room").where("online", "==", True)
        return [d.to_dict() for d in q.stream() if not d.to_dict().get("private")]

    def add_session(self, session):
        self.col.add({**session, "kind": "session"})

    # --- WebRTC signaling mailbox ---
    def _sig_doc(self, room, session):
        return self.col.document(f"sig_{room}_{session}")

    def signal_post(self, room, session, role, msg):
        from firebase_admin import firestore
        flag = "has_friend" if role == "friend" else "has_host"
        # Messages stored as JSON strings so ArrayUnion dedupes reliably.
        self._sig_doc(room, session).set({
            "kind": "signal", "room": room, "session": session, flag: True,
            role: firestore.ArrayUnion([json.dumps(msg)]),
        }, merge=True)

    def signal_get(self, room, session, reader):
        other = "host" if reader == "friend" else "friend"
        doc = self._sig_doc(room, session).get()
        data = doc.to_dict() if doc.exists else {}
        return [json.loads(x) for x in (data.get(other) or [])]

    def pending_sessions(self, room):
        q = (self.col.where("kind", "==", "signal")
             .where("room", "==", room).where("has_friend", "==", True))
        return [d.to_dict().get("session") for d in q.stream()]


def make_store():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not raw:
        print("[store] FIREBASE_SERVICE_ACCOUNT not set — using in-memory store (dev).")
        return MemoryStore()
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        cred = credentials.Certificate(json.loads(raw))
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        print("[store] Firestore connected (project from service account).")
        return FirestoreStore(firestore.client())
    except Exception as e:  # never crash the API over storage init
        print(f"[store] Firestore init failed ({e}); falling back to memory.")
        return MemoryStore()


store = make_store()


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.route("/sync", methods=["POST"])
def sync_server():
    """Host app publishes / refreshes / takes down a room."""
    data = request.json or {}
    name = data.get("subdomain") or data.get("room")
    if not name:
        return jsonify({"success": False, "error": "missing room name"}), 400

    if data.get("status") == "online":
        store.upsert_room(name, {
            "online": True,
            "private": bool(data.get("is_private", False)),
            # The P2P endpoint id the connector dials (not a relay address).
            "endpoint": data.get("endpoint"),
            "motd": data.get("motd"),
            "version": data.get("version"),
            "playerCount": int(data.get("players", 0) or 0),
            "owner": data.get("user_id", "anonymous"),
            "updatedAt": int(time.time()),
        })
    else:
        store.delete_room(name)

    return jsonify({"success": True})


@app.route("/live-servers", methods=["GET"])
def live_servers():
    """Public list for the landing-page network panel."""
    return jsonify(store.public_rooms())


@app.route("/room/<name>", methods=["GET"])
def room(name):
    """Single room lookup for the per-subdomain page."""
    r = store.get_room(name)
    if not r or not r.get("online"):
        return jsonify({"room": name, "online": False})
    return jsonify(r)


@app.route("/session", methods=["POST"])
def session():
    """Host app streams completed player sessions for admin analytics."""
    s = request.json or {}
    store.add_session({
        "room": s.get("room"),
        "name": s.get("name"),
        "joinedAt": s.get("joinedAt"),
        "leftAt": s.get("leftAt"),
        "durationMs": s.get("durationMs"),
    })
    return jsonify({"success": True})


@app.route("/signal", methods=["POST"])
def post_signal():
    """Append one SDP/ICE message to a friend<->host signaling box."""
    d = request.json or {}
    room, session, role, msg = d.get("room"), d.get("session"), d.get("role"), d.get("msg")
    if not (room and session and role) or msg is None:
        return jsonify({"error": "missing fields"}), 400
    if role not in ("friend", "host"):
        return jsonify({"error": "bad role"}), 400
    store.signal_post(room, session, role, msg)
    return jsonify({"ok": True})


@app.route("/signal", methods=["GET"])
def get_signal():
    """Read the OTHER side's messages (caller passes its own role)."""
    room, session, role = request.args.get("room"), request.args.get("session"), request.args.get("role")
    if not (room and session and role):
        return jsonify({"error": "missing fields"}), 400
    return jsonify({"messages": store.signal_get(room, session, role)})


@app.route("/signal/pending", methods=["GET"])
def get_pending():
    """Host discovers sessions where a friend is trying to connect."""
    room = request.args.get("room")
    if not room:
        return jsonify({"error": "missing room"}), 400
    return jsonify({"sessions": store.pending_sessions(room)})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "store": type(store).__name__})


if __name__ == "__main__":
    app.run(port=5000)
