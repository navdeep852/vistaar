import re
import json
import urllib.request
import urllib.error

with open(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'rb') as f:
    ldata = f.read()

tokens = re.findall(rb'\"refresh_token\":\"([a-zA-Z0-9_\-]+)\"', ldata)
unique_tokens = []
for t in tokens:
    ts = t.decode('latin1')
    if ts not in unique_tokens:
        unique_tokens.append(ts)

print(f"Testing {len(unique_tokens)} unique refresh tokens...")
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
url = 'https://kluxsykimnjivkqxelba.supabase.co/auth/v1/token?grant_type=refresh_token'

for i, rt in enumerate(reversed(unique_tokens)):
    print(f"Trying token {i}: {rt}")
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
            with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as out_f:
                json.dump(data, out_f, indent=2)
            break
    except urllib.error.HTTPError as e:
        print(f"  Failed: HTTP {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"  Error: {e}")
