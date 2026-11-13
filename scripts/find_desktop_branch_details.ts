import * as fs from 'fs';

const ldbDir = 'C:\\Users\\Navdeep\\AppData\\Local\\com.grovyx.vistaar\\EBWebView\\Default\\Local Storage\\leveldb';
const files = fs.readdirSync(ldbDir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));

for (const file of files) {
  const buf = fs.readFileSync(`${ldbDir}\\${file}`);
  const target = '5c456a11';
  let idx = 0;
  while ((idx = buf.indexOf(target, idx)) !== -1) {
    console.log(`Found ${target} in ${file} at offset ${idx}`);
    // Print 300 bytes before and 700 bytes after
    const start = Math.max(0, idx - 300);
    const end = Math.min(buf.length, idx + 700);
    const slice = buf.subarray(start, end).toString('utf8').replace(/[^\x20-\x7E]/g, ' ');
    console.log('Snippet:', slice);
    idx += target.length;
  }
}
