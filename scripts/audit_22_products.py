import json
import urllib.request

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    token = json.load(f)['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

url = 'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/products?select=*&order=created_at.asc'
req = urllib.request.Request(
    url,
    headers={'apikey': apikey, 'Authorization': f'Bearer {token}'}
)

with urllib.request.urlopen(req) as resp:
    products = json.loads(resp.read().decode())

print(f"{'#':<3} | {'Product Name':<25} | {'Stock':<6} | {'BuyPrice':<8} | {'MinStock':<8} | {'Part Number':<15} | {'Created At'}")
print("-" * 105)
for i, p in enumerate(products):
    print(f"{i+1:<3} | {p.get('name', ''):<25} | {p.get('current_stock', 0):<6} | {p.get('buy_price', 0):<8} | {p.get('minimum_stock', 0):<8} | {str(p.get('part_number', '')):<15} | {p.get('created_at')}")

with open(r'd:\Project\vistaar-main\vistaar-main\products_22_audit.json', 'w') as out_f:
    json.dump(products, out_f, indent=2)
