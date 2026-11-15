import json
import urllib.request

with open('extracted_auth.json') as f:
    token = json.load(f)['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

with open('products_22_audit.json') as f:
    products = json.load(f)

headers = {'apikey': apikey, 'Authorization': f'Bearer {token}'}

def get_table(table, params=""):
    url = f'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/{table}?{params}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return f"Error: {e}"

# 1. Check invoice_items
inv_items = get_table('invoice_items', 'select=*')
print(f"Total invoice_items in DB: {len(inv_items) if isinstance(inv_items, list) else inv_items}")

# 2. Check counter_sale_items
cs_items = get_table('counter_sale_items', 'select=*')
print(f"Total counter_sale_items in DB: {len(cs_items) if isinstance(cs_items, list) else cs_items}")

# 3. Check stock_movements
sm_items = get_table('stock_movements', 'select=*')
print(f"Total stock_movements in DB: {len(sm_items) if isinstance(sm_items, list) else sm_items}")

# 4. Check stock_receipts
sr_items = get_table('stock_receipts', 'select=*')
print(f"Total stock_receipts in DB: {len(sr_items) if isinstance(sr_items, list) else sr_items}")

# 5. Check purchase_order_items
po_items = get_table('purchase_order_items', 'select=*')
print(f"Total purchase_order_items in DB: {len(po_items) if isinstance(po_items, list) else po_items}")

# 6. Check import_sessions
imp_items = get_table('import_sessions', 'select=*')
print(f"Total import_sessions in DB: {len(imp_items) if isinstance(imp_items, list) else imp_items}")

scan_results = {
    'invoice_items': inv_items if isinstance(inv_items, list) else [],
    'counter_sale_items': cs_items if isinstance(cs_items, list) else [],
    'stock_movements': sm_items if isinstance(sm_items, list) else [],
    'stock_receipts': sr_items if isinstance(sr_items, list) else [],
    'purchase_order_items': po_items if isinstance(po_items, list) else [],
    'import_sessions': imp_items if isinstance(imp_items, list) else [],
}
with open('database_inventory_scan.json', 'w') as out_f:
    json.dump(scan_results, out_f, indent=2)
print("Saved database_inventory_scan.json")
