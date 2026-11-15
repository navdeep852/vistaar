import json

with open('products_22_audit.json') as f:
    products = json.load(f)

print(f"Total products: {len(products)}")
for idx, p in enumerate(products):
    print(f"{idx+1:>2}: {p['name']:<25} | DB current_stock: {p.get('current_stock')}")
