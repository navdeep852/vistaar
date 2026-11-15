import re
import json
import base64
import time

log_file = r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\000103.log'
with open(log_file, 'rb') as f:
    data = f.read()

tokens = re.findall(rb'eyJhbGciOiJ[A-Za-z0-9_\-\.]+', data)
print(f'Found {len(tokens)} JWT tokens in 000103.log')
latest_jwt = None
latest_payload = None

for i, t in enumerate(tokens):
    t_str = t.decode('latin1')
    try:
        parts = t_str.split('.')
        if len(parts) >= 2:
            payload_b64 = parts[1]
            # pad b64
            payload_b64 += '=' * ((4 - len(payload_b64) % 4) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode('ascii')))
            exp = payload.get('exp', 0)
            now = time.time()
            valid = exp > now
            print(f'Token {i}: sub={payload.get("sub")} exp={exp} (valid={valid}, remaining={int(exp-now)}s)')
            latest_jwt = t_str
            latest_payload = payload
    except Exception as e:
        print(f'Error parsing token {i}: {e}')

if latest_jwt:
    auth_data = {
        'access_token': latest_jwt,
        'payload': latest_payload
    }
    with open(r'd:\Project\vistaar-main\vistaar-main\extracted_auth.json', 'w') as f_out:
        json.dump(auth_data, f_out, indent=2)
    print('Updated extracted_auth.json successfully')
