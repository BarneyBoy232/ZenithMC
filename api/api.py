from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import sqlite3
import os

app = Flask(__name__)
CORS(app) 

active_servers = {}

CLOUDFLARE_API_TOKEN = "cfut_bdAgReVi90symRLO7wilSDdq6skSIskCwj78XGQi98a3a73e"
ZONE_ID = "cb957de4a36dcefa4904df15bb79f410"

# Initialize Database
def init_db():
    conn = sqlite3.connect('zenith.db')
    conn.execute('CREATE TABLE IF NOT EXISTS servers (subdomain TEXT PRIMARY KEY, user_id TEXT)')
    conn.commit()
    conn.close()

init_db()

def clean_old_dns(subdomain):
    """Finds and deletes ALL existing SRV records to prevent stacking."""
    base_url = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"
    headers = {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}", "Content-Type": "application/json"}
    
    # Check for BOTH the correct prefixed name and the old broken name formats
    names_to_check = [
        f"_minecraft._tcp.{subdomain}.mc.zenithurl.com",
        f"{subdomain}.mc.zenithurl.com" 
    ]
    
    for srv_name in names_to_check:
        try:
            res = requests.get(f"{base_url}?type=SRV&name={srv_name}", headers=headers).json()
            for record in res.get('result', []):
                requests.delete(f"{base_url}/{record['id']}", headers=headers)
        except Exception as e:
            print(f"[CLEANUP ERROR] {e}")

def update_dns_records(subdomain, port):
    clean_old_dns(subdomain) # Automatically wipe old records first!
    
    base_url = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"
    headers = {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}", "Content-Type": "application/json"}
    
    cname_data = {
        "type": "CNAME",
        "name": f"{subdomain}.mc.zenithurl.com",
        "content": "bore.pub",
        "proxied": False
    }
    
    try:
        requests.post(base_url, headers=headers, json=cname_data)
    except: pass

    srv_data = {
        "type": "SRV",
        "name": f"_minecraft._tcp.{subdomain}.mc.zenithurl.com",
        "data": {
            "service": "_minecraft",
            "proto": "_tcp",
            "name": f"{subdomain}.mc.zenithurl.com",
            "priority": 0,
            "weight": 5,
            "port": int(port),
            "target": "bore.pub"
        }
    }
    
    try:
        response = requests.post(base_url, headers=headers, json=srv_data)
        if response.status_code == 200:
            print(f"[DNS ROUTED] {subdomain}.mc.zenithurl.com -> bore.pub:{port}")
    except Exception as e:
        print(f"[DNS ERROR] {e}")

@app.route('/sync', methods=['POST'])
def sync_server():
    data = request.json
    subdomain = data.get('subdomain')
    status = data.get('status')
    user_id = data.get('user_id', 'anonymous') # We'll add this to the desktop app next
    
    # Check Database Lock
    conn = sqlite3.connect('zenith.db')
    c = conn.cursor()
    c.execute('SELECT user_id FROM servers WHERE subdomain = ?', (subdomain,))
    row = c.fetchone()
    
    if row and row[0] != user_id:
        conn.close()
        return jsonify({"success": False, "error": "Subdomain is already taken by another user."}), 403
    elif not row:
        c.execute('INSERT INTO servers (subdomain, user_id) VALUES (?, ?)', (subdomain, user_id))
        conn.commit()
    conn.close()

    if status == "online":
        port = data.get('port')
        is_private = data.get('is_private', False)
        
        active_servers[subdomain] = {"name": subdomain, "is_private": is_private, "port": port, "players": 0}
        update_dns_records(subdomain, port)
        
    elif status == "offline" and subdomain in active_servers:
        del active_servers[subdomain]
        
    return jsonify({"success": True})

@app.route('/live-servers', methods=['GET'])
def get_live_servers():
    public_servers = [s for s in active_servers.values() if not s['is_private']]
    return jsonify(public_servers)

if __name__ == '__main__':
    app.run(port=5000)