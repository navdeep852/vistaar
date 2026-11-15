import json
import urllib.request

with open('extracted_auth.json') as f:
    token = json.load(f)['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

SELECT_FIELDS = 'id,workspace_id,name,sku,part_number,product_code,category_id,categories(name),brand,unit,buy_price,selling_price,current_stock,minimum_stock,hsn_sac,location,gst_rate,tax_percent,active,created_at,updated_at'
url = f'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/products?select={SELECT_FIELDS}&active=eq.true&workspace_id=eq.ddb10dc7-3671-4def-9626-526afd473c1a&order=name.asc'

req = urllib.request.Request(
    url,
    headers={'apikey': apikey, 'Authorization': f'Bearer {token}'}
)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())

print(f"Returned {len(data)} products:")
for p in data:
    print(f"Name: {p['name']:<25} | current_stock: {p.get('current_stock')}")
