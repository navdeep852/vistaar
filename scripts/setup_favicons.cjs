const fs = require('fs');
const path = require('path');

console.log('--- Generating VISTAAR Favicon Assets ---');

const tauriIconIco = path.join('src-tauri', 'icons', 'icon.ico');
const tauriIcon512 = path.join('src-tauri', 'icons', 'icon.png');
const tauriAppleIcon = path.join('src-tauri', 'icons', 'ios', 'AppIcon-60x60@3x.png');

if (!fs.existsSync(tauriIconIco) || !fs.existsSync(tauriIcon512) || !fs.existsSync(tauriAppleIcon)) {
  console.error('Missing required source assets in src-tauri/icons!');
  process.exit(1);
}

// 1. Copy multi-resolution favicon.ico (16, 24, 32, 48, 64, 256)
const icoDest = path.join('public', 'favicon.ico');
fs.copyFileSync(tauriIconIco, icoDest);
console.log('Saved public/favicon.ico:', fs.statSync(icoDest).size, 'bytes');

// 2. Extract embedded PNG entries from icon.ico
const icoBuf = fs.readFileSync(tauriIconIco);
const count = icoBuf.readUInt16LE(4);
const entries = {};

for (let i = 0; i < count; i++) {
  const offset = 6 + i * 16;
  const width = icoBuf.readUInt8(offset) || 256;
  const size = icoBuf.readUInt32LE(offset + 8);
  const imgOffset = icoBuf.readUInt32LE(offset + 12);
  entries[width] = icoBuf.slice(imgOffset, imgOffset + size);
}

// 3. Extract 48x48 PNG (directly required by Google Search)
if (entries[48]) {
  const p48Dest = path.join('public', 'favicon-48x48.png');
  fs.writeFileSync(p48Dest, entries[48]);
  console.log('Saved public/favicon-48x48.png:', fs.statSync(p48Dest).size, 'bytes');
}

// 4. Save 512x512 high-resolution master
const p512Dest = path.join('public', 'favicon-512x512.png');
fs.copyFileSync(tauriIcon512, p512Dest);
console.log('Saved public/favicon-512x512.png:', fs.statSync(p512Dest).size, 'bytes');

// 5. Save apple-touch-icon.png (180x180)
const appleDest = path.join('public', 'apple-touch-icon.png');
fs.copyFileSync(tauriAppleIcon, appleDest);
console.log('Saved public/apple-touch-icon.png:', fs.statSync(appleDest).size, 'bytes');

// 6. Generate favicon.svg with authentic VISTAAR branding
const base64_256 = entries[256].toString('base64');
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="v-blue-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="50%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f297a"/>
    </linearGradient>
    <linearGradient id="v-blue-light" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="v-silver" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
    <filter id="v-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#020617" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Vector Representation of VISTAAR Brand Emblem -->
  <g id="vistaar-vector-fallback">
    <!-- Outer Chevron / Wing Left -->
    <path d="M 27 100 L 115 100 L 115 285 L 256 425 L 256 508 L 27 305 Z" fill="url(#v-blue-dark)"/>
    <!-- Outer Chevron / Wing Right -->
    <path d="M 485 100 L 397 100 L 397 285 L 256 425 L 256 508 L 485 305 Z" fill="url(#v-blue-dark)"/>
    <!-- Center Spires -->
    <path d="M 123 4 L 155 35 L 155 240 L 123 210 Z" fill="url(#v-blue-light)"/>
    <path d="M 389 6 L 357 35 L 357 240 L 389 210 Z" fill="url(#v-blue-light)"/>
    <!-- Hexagonal Frame -->
    <polygon points="256,128 366,192 366,318 256,382 146,318 146,192" fill="#ffffff" filter="url(#v-shadow)"/>
    <polygon points="256,138 356,198 356,312 256,372 156,312 156,198" fill="url(#v-blue-light)"/>
    <!-- Center Diamond -->
    <polygon points="256,185 314,243 256,301 198,243" fill="url(#v-silver)"/>
  </g>

  <!-- High-fidelity 3D Brand Master Image -->
  <image href="data:image/png;base64,${base64_256}" width="512" height="512"/>
</svg>
`;

const svgDest = path.join('public', 'favicon.svg');
fs.writeFileSync(svgDest, svgContent, 'utf-8');
console.log('Saved public/favicon.svg:', fs.statSync(svgDest).size, 'bytes');

console.log('--- All Favicon Assets Successfully Created ---');
