const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const targetDiff = 417423.00;
const targetGP2 = 288892.60;
const targetGP1 = 706315.60;

// All values associated with each transaction:
const txs = [
  { name: 'INV1', gt: 365800, net: 310000, tax: 55800, cogs: 225000, gpGross: 140800, gpNet: 85000, paid: 365800, bal: 0 },
  { name: 'INV2', gt: 731600, net: 620000, tax: 111600, cogs: 450000, gpGross: 281600, gpNet: 170000, paid: 731600, bal: 0 },
  { name: 'INV3', gt: 292640, net: 248000, tax: 44640, cogs: 180000, gpGross: 112640, gpNet: 68000, paid: 292640, bal: 0 },
  { name: 'INV4', gt: 365800, net: 310000, tax: 55800, cogs: 225000, gpGross: 140800, gpNet: 85000, paid: 265800, bal: 100000 },
  { name: 'INV5', gt: 46002.30, net: 38985, tax: 7017.30, cogs: 29000, gpGross: 17002.30, gpNet: 9985, paid: 46002.30, bal: 0 },
  { name: 'INV6', gt: 32432.30, net: 27485, tax: 4947.30, cogs: 20300, gpGross: 12132.30, gpNet: 7185, paid: 32432.30, bal: 0 },
  { name: 'CS1', gt: 3141, net: 3141, tax: 0, cogs: 2400, gpGross: 741, gpNet: 741, paid: 3141, bal: 0 },
  { name: 'CS2', gt: 3000, net: 3000, tax: 0, cogs: 2400, gpGross: 600, gpNet: 600, paid: 3000, bal: 0 }
];

console.log('Finding subsets for diff 417423 or GP 288892.60:');

// Check subsets of gpGross
const n = txs.length;
for (let mask = 1; mask < (1 << n); mask++) {
  let sumGPGross = 0;
  let sumGPNet = 0;
  let sumCogs = 0;
  let sumGT = 0;
  let names = [];
  for (let i = 0; i < n; i++) {
    if ((mask & (1 << i)) !== 0) {
      sumGPGross += txs[i].gpGross;
      sumGPNet += txs[i].gpNet;
      sumCogs += txs[i].cogs;
      sumGT += txs[i].gt;
      names.push(txs[i].name);
    }
  }

  if (Math.abs(sumGPGross - targetGP2) < 0.01) {
    console.log('MATCH sumGPGross == 288892.60:', names.join('+'), sumGPGross);
  }
  if (Math.abs(sumGPGross - targetDiff) < 0.01) {
    console.log('MATCH sumGPGross == 417423.00:', names.join('+'), sumGPGross);
  }
  if (Math.abs(sumGPNet - targetGP2) < 0.01) {
    console.log('MATCH sumGPNet == 288892.60:', names.join('+'), sumGPNet);
  }
  if (Math.abs(sumGPNet - targetDiff) < 0.01) {
    console.log('MATCH sumGPNet == 417423.00:', names.join('+'), sumGPNet);
  }
  if (Math.abs(sumCogs - targetDiff) < 0.01) {
    console.log('MATCH sumCogs == 417423.00:', names.join('+'), sumCogs);
  }
  if (Math.abs(sumGT - targetDiff) < 0.01) {
    console.log('MATCH sumGT == 417423.00:', names.join('+'), sumGT);
  }
}

// Check other combinations: what if tax + something?
// Total tax: 279,804.60
// 417,423.00 - 279,804.60 = 137,618.40
// Total gross profit: 706,315.60
// What if 288,892.60 came from:
// Total Net Sales (15,60,611.00) - Total COGS (11,34,100.00) = 4,26,511.00
// 4,26,511.00 - 288,892.60 = 137,618.40
// Notice: 137,618.40!
// What is 137,618.40?
// 279,804.60 - 142,186.20?
console.log('Done subset search.');

