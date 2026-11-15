import re
import json

def extract_key(fpath, key_name):
    with open(fpath, 'rb') as f:
        data = f.read()
    pattern = key_name.encode('utf-8')
    idx = 0
    results = []
    while True:
        idx = data.find(pattern, idx)
        if idx == -1:
            break
        # Look ahead for JSON-like string
        chunk = data[idx:idx+5000]
        results.append(chunk)
        idx += len(pattern)
    return results

print("=== Scanning 000103.log ===")
res = extract_key(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'vistaar_local_branch_inventory_db')
for i, r in enumerate(res):
    print(f"Match {i}: {r[:300]}")

res_b = extract_key(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'vistaar_company_branches_db')
for i, r in enumerate(res_b):
    print(f"Branches Match {i}: {r[:300]}")
