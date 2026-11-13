import * as fs from 'fs';
import * as glob from 'glob';

const ldbDir = 'C:\\Users\\Navdeep\\AppData\\Local\\com.grovyx.vistaar\\EBWebView\\Default\\Local Storage\\leveldb';
const files = fs.readdirSync(ldbDir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));

for (const file of files) {
  const content = fs.readFileSync(`${ldbDir}\\${file}`);
  const keys = ['vistaar_company_branches_db', 'vistaar_local_branches_db'];
  for (const k of keys) {
    const idx = content.indexOf(Buffer.from(k));
    if (idx !== -1) {
      console.log(`Found ${k} in ${file} at ${idx}`);
      const start = content.indexOf(Buffer.from('['), idx);
      if (start !== -1 && start - idx < 200) {
        let depth = 0;
        for (let e = start; e < Math.min(start + 500000, content.length); e++) {
          if (content[e] === 91) depth++;
          else if (content[e] === 93) {
            depth--;
            if (depth === 0) {
              const str = content.subarray(start, e + 1).toString('utf8');
              try {
                const parsed = JSON.parse(str);
                console.log(`Parsed ${k}: length = ${parsed.length}`);
                fs.writeFileSync(`extracted_${k}.json`, JSON.stringify(parsed, null, 2));
              } catch (err) {}
              break;
            }
          }
        }
      }
    }
  }
}
