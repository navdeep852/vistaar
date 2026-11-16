import re
import json
import urllib.request
import urllib.error
import glob
import os

leveldb_dir = r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb'
files = glob.glob(os.path.join(leveldb_dir, '*.log')) + glob.glob(os.path.join(leveldb_dir, '*.ldb'))

unique_tokens = []
for fpath in files:
    try:
        with open(fpath, 'rb') as f:
            ldata = f.read()
        tokens = re.findall(rb'\"refresh_token\":\"([a-zA-Z0-9_\-]+)\"', ldata)
        for t in tokens:
            ts = t.decode('latin1')
            if ts not in unique_tokens:
                unique_tokens.append(ts)
    except Exception:
        pass

print(f"Testing {len(unique_tokens)} unique refresh tokens...")
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
url = 'https://kluxsykimnjivkqxelba.supabase.co/auth/v1/token?grant_type=refresh_token'

valid_token = None
for i, rt in enumerate(reversed(unique_tokens)):
    body = json.dumps({'refresh_token': rt}).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'apikey': apikey,
            'Content-Type': 'application/json'
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("SUCCESS! Token valid! New expires_in:", data.get('expires_in'))
            valid_token = data.get('access_token')
            with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as out_f:
                json.dump(data, out_f, indent=2)
            break
    except Exception:
        pass

def get_valid_token():
    return valid_token

