import re
import json

with open(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'rb') as f:
    data = f.read()

pattern = b'vistaar_local_branch_inventory_db_ddb10dc7-3671-4def-9626-526afd473c1a'
idx = data.find(pattern)
if idx != -1:
    sub = data[idx+len(pattern):]
    # find '['
    start = sub.find(b'[')
    end = sub.find(b']')
    if start != -1 and end != -1:
        json_bytes = sub[start:end+1]
        try:
            items = json.loads(json_bytes.decode('utf-8'))
            print(f"Found {len(items)} items in branch_inventory_db in 000103.log")
            for item in items:
                print(f"ProdID: {item.get('productId')} | branchId: {item.get('branchId')} | currentStock: {item.get('currentStock')} | openingStock: {item.get('openingStock')}")
            with open(r'd:\Project\vistaar-main\vistaar-main\branch_inventory_desktop_dump.json', 'w') as out_f:
                json.dump(items, out_f, indent=2)
        except Exception as e:
            print("JSON parse error:", e)
            print("Snippet:", json_bytes[:200])
else:
    print("Pattern not found")
