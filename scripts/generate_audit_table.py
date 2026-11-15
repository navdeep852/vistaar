import json

with open('products_22_audit.json') as f:
    products = json.load(f)

with open('database_inventory_scan.json') as f:
    scan = json.load(f)

# Build mappings
invoice_items = scan.get('invoice_items', [])
counter_sale_items = scan.get('counter_sale_items', [])
stock_movements = scan.get('stock_movements', [])
stock_receipts = scan.get('stock_receipts', [])

# Map sales by product_id
sales_by_prod = {}
for it in invoice_items:
    pid = it.get('product_id')
    if pid:
        sales_by_prod[pid] = sales_by_prod.get(pid, 0.0) + float(it.get('quantity') or 0)

for cs in counter_sale_items:
    pid = cs.get('product_id')
    if pid:
        sales_by_prod[pid] = sales_by_prod.get(pid, 0.0) + float(cs.get('quantity') or 0)

# Map movements by product_id
movements_by_prod = {}
for sm in stock_movements:
    pid = sm.get('product_id')
    if pid:
        movements_by_prod[pid] = movements_by_prod.get(pid, [])
        movements_by_prod[pid].append(sm)

# Map receipts by product_id
receipts_by_prod = {}
for sr in stock_receipts:
    pid = sr.get('product_id')
    if pid:
        receipts_by_prod[pid] = receipts_by_prod.get(pid, [])
        receipts_by_prod[pid].append(sr)

# Read desktop LevelDB branch_inventory dump if available
try:
    with open('branch_inventory_desktop_dump.json') as f:
        desktop_b_inv = json.load(f)
except:
    desktop_b_inv = []

desktop_b_map = {item.get('productId'): item for item in desktop_b_inv}

audit_rows = []
for idx, p in enumerate(products):
    pid = p['id']
    name = p['name']
    ws_id = p.get('workspace_id')
    master_stock = float(p.get('current_stock') or 0)
    
    # Receipts
    rcpts = receipts_by_prod.get(pid, [])
    rcpt_qty = sum(float(r.get('quantity_received') or 0) for r in rcpts)
    
    # Movements
    movs = movements_by_prod.get(pid, [])
    mov_desc = ", ".join([f"{m.get('type')}:{m.get('quantity')}" for m in movs]) if movs else "None"
    
    # Sales
    depletions = sales_by_prod.get(pid, 0.0)
    
    # Branch allocation from desktop LevelDB
    b_entry = desktop_b_map.get(pid)
    b_alloc_stock = float(b_entry.get('currentStock') or 0) if b_entry else 0.0
    b_opening = float(b_entry.get('openingStock') or 0) if b_entry else 0.0
    
    # Inferred Opening Stock
    # For legacy products: master_stock + depletions equals original imported stock
    inferred_opening = master_stock + depletions
    
    audit_rows.append({
        'index': idx + 1,
        'product_id': pid,
        'name': name,
        'sku': p.get('sku'),
        'part_number': p.get('part_number'),
        'workspace_id': ws_id,
        'master_stock': master_stock,
        'receipts_count': len(rcpts),
        'receipt_qty': rcpt_qty,
        'movements_count': len(movs),
        'movements_summary': mov_desc,
        'sales_depletions': depletions,
        'opening_stock': inferred_opening,
        'desktop_local_alloc': b_alloc_stock,
        'is_new_product': (idx == 21)
    })

print(f"{'#':<3} | {'Product Name':<23} | {'Master':<6} | {'Sales':<5} | {'Opening':<7} | {'Movements':<22} | {'LocalAlloc':<10} | {'Status'}")
print("-" * 105)
for r in audit_rows:
    status = "NEW (22nd)" if r['is_new_product'] else ("OUT OF STOCK" if r['master_stock'] == 0 else "IN STOCK")
    print(f"{r['index']:<3} | {r['name']:<23} | {r['master_stock']:<6.1f} | {r['sales_depletions']:<5.1f} | {r['opening_stock']:<7.1f} | {r['movements_summary']:<22} | {r['desktop_local_alloc']:<10.1f} | {status}")

with open('audit_22_table_data.json', 'w') as out_f:
    json.dump(audit_rows, out_f, indent=2)
