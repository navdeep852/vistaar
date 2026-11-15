import json
import urllib.request
import urllib.error

with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json') as f:
    auth_data = json.load(f)

token = auth_data['access_token']
apikey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x'

candidates = [
    'workspaces', 'profiles', 'business_settings', 'categories', 'suppliers',
    'customers', 'products', 'inventory_settings', 'stock_receipts', 'stock_movements',
    'import_sessions', 'counter_sales', 'counter_sale_items', 'quotations', 'quotation_items',
    'invoices', 'invoice_items', 'payments', 'udhari_records', 'udhari_payments',
    'expenses', 'follow_ups', 'notifications', 'feedbacks', 'offers', 'id_mappings',
    'daybook_transactions', 'financial_accounts', 'transporters', 'vehicles', 'business_locations',
    'eway_bills', 'eway_bill_items', 'purchase_orders', 'purchase_order_items', 'supplier_catalogue_items',
    'salary_structures', 'salary_payments', 'security_audit_logs', 'inventory_audit_logs',
    'branches', 'user_branch_access', 'branch_inventory', 'stock_transfers', 'stock_transfer_items',
    'cashbook_entries', 'backups', 'financial_audit_logs', 'workspace_subscriptions'
]

results = {}
for c in candidates:
    url = f'https://kluxsykimnjivkqxelba.supabase.co/rest/v1/{c}?select=*&limit=1'
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
            results[c] = f'EXISTS (sample: {len(data)})'
    except urllib.error.HTTPError as e:
        results[c] = f'HTTP {e.code}'
    except Exception as e:
        results[c] = f'ERROR: {e}'

for k, v in results.items():
    print(f"{k:<30}: {v}")
