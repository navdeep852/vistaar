const https = require('https');
const fs = require('fs');

const data = JSON.stringify({
  email: 'navdeep@vistaarone.com',
  password: 'Password123!@#'
});

const req = https.request('https://kluxsykimnjivkqxelba.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    'apikey': 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const parsed = JSON.parse(body);
    if (parsed.access_token) {
      console.log('Login SUCCESS! User:', parsed.user?.email);
      fs.writeFileSync('extracted_auth.json', JSON.stringify(parsed, null, 2));
    } else {
      console.log('Response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('Req error:', e);
});

req.write(data);
req.end();
