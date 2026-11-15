import json

with open('database_inventory_scan.json') as f:
    scan = json.load(f)

with open('products_22_audit.json') as f:
    products = json.load(f)

prod_map = {p['id']: p for p in products}

print("=== INVOICE ITEMS ===")
for item in scan['invoice_items']:
    p = prod_map.get(item.get('product_id'))
    pname = p['name'] if p else item.get('product_name', 'Unknown')
    print(f"Invoice: {item.get('invoice_id')} | Prod: {pname:<25} | Qty: {item.get('quantity')} | BuyPrice: {item.get('buy_price')} | SellPrice: {item.get('selling_price')}")

print("\n=== COUNTER SALE ITEMS ===")
for item in scan['counter_sale_items']:
    p = prod_map.get(item.get('product_id'))
    pname = p['name'] if p else item.get('product_name', 'Unknown')
    print(f"Sale: {item.get('counter_sale_id')} | Prod: {pname:<25} | Qty: {item.get('quantity')} | BuyPrice: {item.get('buy_price')} | SellPrice: {item.get('selling_price')}")

print("\n=== STOCK MOVEMENTS ===")
for m in scan['stock_movements']:
    p = prod_map.get(m.get('product_id'))
    pname = p['name'] if p else 'Unknown'
    print(f"Movement: type={m.get('type')} | Prod: {pname:<25} | Qty: {m.get('quantity')} | Ref: {m.get('reference_id')} | Date: {m.get('created_at')}")
