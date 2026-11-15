import json
import urllib.request

auth = json.load(open('extracted_auth.json'))
token = auth['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

query_url = "https://kluxsykimnjivkqxelba.supabase.co/rest/v1/branch_inventory?select=*"

req = urllib.request.Request(
    query_url,
    headers={
        'apikey': apikey,
        'Authorization': f'Bearer {token}',
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"branch_inventory table EXISTS! Records: {len(data)}")
        print(json.dumps(data[:5], indent=2))
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print("Error:", e)
