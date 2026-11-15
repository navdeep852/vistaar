import json
import urllib.request
import urllib.error

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

token = auth_data['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
url = 'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/products?select=*&order=created_at.asc'

req = urllib.request.Request(
    url,
    headers={
        'apikey': apikey,
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        products = json.loads(resp.read().decode('utf-8'))
        print(f'Total products returned: {len(products)}')
        for i, p in enumerate(products):
            print(f"{i+1:2d}. ID: {p.get('id')} | Name: {p.get('name'):<25} | Stock: {p.get('current_stock')} | Created: {p.get('created_at')}")
        with open(r'd:\Project\vistaar-main\vistaar-main\all_products_raw.json', 'w') as out_f:
            json.dump(products, out_f, indent=2)
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code, e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
