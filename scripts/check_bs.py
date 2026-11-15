import json
import urllib.request

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

token = auth_data['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
url = 'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/business_settings?select=*'

req = urllib.request.Request(
    url,
    headers={
        'apikey': apikey,
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print(f"business_settings rows: {len(data)}")
    if data:
        row = data[0]
        print("Keys:", list(row.keys()))
        print("bank_details:", json.dumps(row.get('bank_details'), indent=2))
        with open(r'd:\Project\vistaar-main\vistaar-main\business_settings_dump.json', 'w') as out_f:
            json.dump(row, out_f, indent=2)
