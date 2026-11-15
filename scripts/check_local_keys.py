import glob, re

for fpath in glob.glob(r'C:\Users\Navdeep\AppData\Local\com.grovyx.vistaar\EBWebView\Default\Local Storage\leveldb\*.*'):
    with open(fpath, 'rb') as f:
        data = f.read()
    keys = re.findall(rb'vistaar_[a-zA-Z0-9_]+', data)
    if keys:
        unique_keys = set(k.decode('latin1') for k in keys)
        print(fpath, unique_keys)
