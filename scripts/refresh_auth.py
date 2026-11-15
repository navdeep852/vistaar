import json
import urllib.request
import urllib.error

# Read current tokens
with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

# If refresh token not in extracted_auth.json, grab from 000103.log
import re
with open(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'rb') as f:
    ldata = f.read()

r_tokens = re.findall(rb'\"refresh_token\":\"([a-zA-Z0-9_\-]+)\"', ldata)
refresh_token = r_tokens[-1].decode('latin1') if r_tokens else auth_data.get('refresh_token')
print("Using refresh token:", refresh_token)

apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
url = 'https://kluxsykimnjivkqxelba.supabase.co/auth/v1/token?grant_type=refresh_token'

body = json.dumps({'refresh_token': refresh_token}).encode('utf-8')
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
        new_auth = json.loads(resp.read().decode('utf-8'))
        print("Successfully refreshed token! New expires_in:", new_auth.get('expires_in'))
        with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as out_f:
            json.dump(new_auth, out_f, indent=2)
except urllib.error.HTTPError as e:
    print("HTTPError refreshing token:", e.code, e.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
