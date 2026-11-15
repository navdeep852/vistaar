import json
import urllib.request
import urllib.error

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

token = auth_data['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

tables = [
    'branch_inventory',
    'inventory_receipts',
    'stock_receipts',
    'stock_movements',
    'inventory_movements',
    'purchase_orders',
    'purchase_order_items',
    'purchase_order_receipts',
    'branches',
    'invoices',
    'invoice_items'
]

for t in tables:
    url = f'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/{t}?select=*&limit=5'
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
            data = json.loads(resp.read().decode('utf-8'))
            print(f"Table '{t}': EXISTS, sample rows: {len(data)}")
            if data:
                print(f"   Fields: {list(data[0].keys())}")
    except urllib.error.HTTPError as e:
        print(f"Table '{t}': HTTP {e.code} ({e.reason})")
    except Exception as e:
        print(f"Table '{t}': Error {e}")
