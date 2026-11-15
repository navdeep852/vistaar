import json, urllib.request

with open('extracted_auth.json') as f:
    token = json.load(f)['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

url = 'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/profiles?select=*'
req = urllib.request.Request(url, headers={'apikey': apikey, 'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print('Profiles count:', len(data))
    for p in data:
        print(f"User: {p.get('email')} | role: {p.get('role')} | ws: {p.get('workspace_id')}")
