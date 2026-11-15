import json

with open(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log', 'rb') as f:
    ldata = f.read()

prefix = b'sb-kluxsykimnjivkqxelba-auth-token'
idx = 0
last_pos = -1
while True:
    pos = ldata.find(prefix, idx)
    if pos == -1: break
    last_pos = pos
    idx = pos + len(prefix)

if last_pos != -1:
    chunk = ldata[last_pos:]
    start = chunk.find(b'{')
    # scan for valid json
    for end in range(start + 50, min(start + 5000, len(chunk))):
        if chunk[end:end+1] == b'}':
            try:
                candidate = chunk[start:end+1].decode('utf-8')
                obj = json.loads(candidate)
                if 'access_token' in obj:
                    print("Found valid auth token! expires_at:", obj.get('expires_at'))
                    print("Refresh token:", obj.get('refresh_token'))
                    with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as out_f:
                        json.dump(obj, out_f, indent=2)
                    print("Saved to extracted_auth.json")
                    break
            except Exception:
                continue
