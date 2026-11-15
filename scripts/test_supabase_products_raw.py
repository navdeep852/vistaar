import json
import urllib.request
import urllib.parse

auth = json.load(open('extracted_auth.json'))
token = auth['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'
wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a'

fields_fallback = 'id,workspace_id,name,sku,part_number,product_code,category_id,categories(name),brand,unit,buy_price,selling_price,current_stock,minimum_stock,hsn_sac,gst_rate,tax_percent,active,created_at,updated_at'

query_url = f"https://kluxsykimnjivkqxelba.supabase.co/rest/v1/products?select={fields_fallback}&active=eq.true&workspace_id=eq.{wsId}&order=name.asc"

req = urllib.request.Request(
    query_url,
    headers={
        'apikey': apikey,
        'Authorization': f'Bearer {token}',
        'Range': '0-24'
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print(f"Products returned: {len(data)}")
        for p in data:
            print(f"Name: {p.get('name'):<25} | current_stock: {repr(p.get('current_stock'))}")
except Exception as e:
    print("Error:", e)
    if hasattr(e, 'read'):
        print(e.read().decode('utf-8'))
