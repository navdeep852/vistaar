with open(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'rb') as f:
    ldata = f.read()

pattern = b'{"access_token":'
matches = []
idx = 0
while True:
    pos = ldata.find(pattern, idx)
    if pos == -1: break
    matches.append(pos)
    idx = pos + len(pattern)

print("Matches count:", len(matches))
for i, m in enumerate(matches):
    print(f"Match {i} at {m}: {ldata[m:m+120]}")
    # try extract json
    for end in range(m + 500, min(m + 4000, len(ldata))):
        if ldata[end:end+1] == b'}':
            try:
                candidate = ldata[m:end+1].decode('utf-8')
                import json
                obj = json.loads(candidate)
                if 'access_token' in obj:
                    print(f" -> Valid JSON! expires_at: {obj.get('expires_at')}, refresh_token: {obj.get('refresh_token')}")
                    with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as out_f:
                        json.dump(obj, out_f, indent=2)
                    break
            except Exception:
                continue
