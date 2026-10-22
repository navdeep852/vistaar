const fs = require('fs');
const path = require('path');

const files = [
  'public/favicon.ico',
  'public/favicon.svg',
  'public/favicon-48x48.png',
  'public/favicon-96x96.png',
  'public/favicon-192x192.png',
  'public/favicon-512x512.png',
  'public/apple-touch-icon.png',
  'public/Vistaar_Icon_logo.png'
];

console.log('--- Verifying Public Brand Assets ---');
for (const rel of files) {
  const full = path.resolve(rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    continue;
  }
  const stat = fs.statSync(full);
  const buf = fs.readFileSync(full);
  let detail = '';
  if (rel.endsWith('.ico')) {
    const count = buf.readUInt16LE(4);
    detail = `ICO entries: ${count}`;
  } else if (rel.endsWith('.svg')) {
    const match = buf.toString('utf-8').match(/viewBox="([^"]+)"/);
    detail = `SVG viewBox: ${match ? match[1] : 'unknown'}`;
  } else if (rel.endsWith('.png')) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    detail = `PNG dimensions: ${w}x${h} (Square: ${w === h ? 'YES' : 'NO'}, Multiple of 48: ${w % 48 === 0 ? 'YES' : 'NO'})`;
  }
  console.log(`${rel.padEnd(28)} | Size: ${String(stat.size).padStart(6)} bytes | ${detail}`);
}
