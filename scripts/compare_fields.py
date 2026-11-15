import json

with open(r'd:\Project\vistaar-main\vistaar-main\all_products_raw.json') as f:
    products = json.load(f)

print(f"Comparing product 1 ({products[1]['name']}) vs product 22 ({products[21]['name']}):")
p_old = products[1]
p_new = products[21]

all_keys = sorted(list(set(list(p_old.keys()) + list(p_new.keys()))))
for k in all_keys:
    val_old = p_old.get(k)
    val_new = p_new.get(k)
    print(f"Key: {k:<25} | Old: {str(val_old):<30} | New: {str(val_new):<30}")
