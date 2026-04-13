from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app) 

# In-memory database of active servers
active_servers = {}

# --- ADD YOUR REAL CLOUDFLARE KEYS HERE ---
CLOUDFLARE_API_TOKEN = "cfut_bdAgReVi90symRLO7wilSDdq6skSIskCwj78XGQi98a3a73e"
ZONE_ID = "cb957de4a36dcefa4904df15bb79f410"

def update_dns_records(subdomain, port):
    """
    Creates a CNAME record and an SRV record.
    The CNAME ensures Minecraft can resolve the base domain, 
    preventing the 'Unknown Host' error in older clients.
    """
    base_url = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # 1. Create a CNAME record pointing to bore.pub
    cname_data = {
        "type": "CNAME",
        "name": f"{subdomain}.mc.zenithurl.com",
        "content": "bore.pub",
        "proxied": False # Minecraft traffic cannot be proxied by Cloudflare
    }
    
    try:
        requests.post(base_url, headers=headers, json=cname_data)
        # We ignore errors here in case the CNAME already exists
    except: pass

    # 2. Create the SRV record to handle the port routing
    srv_data = {
        "type": "SRV",
        "name": f"{subdomain}.mc.zenithurl.com",
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
        else:
            print(f"[DNS ERROR] {response.text}")
    except Exception as e:
        print(f"[DNS ERROR] {e}")

@app.route('/sync', methods=['POST'])
def sync_server():
    """Desktop app hits this when a server turns on or off."""
    data = request.json
    subdomain = data.get('subdomain')
    status = data.get('status')
    
    if status == "online":
        port = data.get('port')
        is_private = data.get('is_private', False)
        
        active_servers[subdomain] = {
            "name": subdomain,
            "is_private": is_private,
            "port": port,
            "players": 0 
        }
        
        update_dns_records(subdomain, port)
        
    elif status == "offline" and subdomain in active_servers:
        del active_servers[subdomain]
        
    return jsonify({"success": True})

@app.route('/live-servers', methods=['GET'])
def get_live_servers():
    """React storefront hits this to get the list of public servers."""
    public_servers = [s for s in active_servers.values() if not s['is_private']]
    return jsonify(public_servers)

if __name__ == '__main__':
    app.run(port=5000)