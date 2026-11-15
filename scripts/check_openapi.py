import json
import urllib.request
import urllib.error

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

token = auth_data['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

# Let's inspect OpenAPI schema of the PostgREST server
url = 'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/'
req = urllib.request.Request(
    url,
    headers={
        'apikey': apikey,
        'Authorization': f'Bearer {token}',
        'Accept': 'application/openapi+json'
    }
)
try:
    with urllib.request.urlopen(req) as resp:
        openapi = json.loads(resp.read().decode('utf-8'))
        definitions = list(openapi.get('definitions', {}).keys())
        paths = list(openapi.get('paths', {}).keys())
        print(f"OpenAPI exposed tables/definitions ({len(definitions)}):")
        for d in sorted(definitions):
            print(f"  - {d}")
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code, e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
