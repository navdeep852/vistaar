const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const targetDiff = 417423.00;
  console.log('Target difference:', targetDiff);

  // Invoices:
  // INV-1: 365,800.00 (tax: 55,800, cogs: 225,000, profit_gross: 140,800, profit_net: 85,000)
  // INV-2: 731,600.00 (tax: 111,600, cogs: 450,000, profit_gross: 281,600, profit_net: 170,000)
  // INV-3: 292,640.00 (tax: 44,640, cogs: 180,000, profit_gross: 112,640, profit_net: 68,000)
  // INV-4: 365,800.00 (tax: 55,800, cogs: 225,000, profit_gross: 140,800, profit_net: 85,000)
  // INV-5: 46,002.30 (tax: 7,017.30, cogs: 29,000, profit_gross: 17,002.30, profit_net: 9,985)
  // INV-6: 32,432.30 (tax: 4,947.30, cogs: 20,300, profit_gross: 12,132.30, profit_net: 7,185)
  // CS-1: 3,141.00 (cogs: 2,400, profit: 741.00)
  // CS-2: 3,000.00 (cogs: 2,400, profit: 600.00)

  // Look at INV-1 + INV-5 + INV-6?
  // Look at taxes: 279,804.60
  // Look at collections: 17,40,415.60 - 11,34,100 = 606,315.60
  // What if Collections - COGS? No, that's 606,315.60.
  // What if 706,315.60 - 288,892.60?
  // Let's check branch profits:
  // Main branch:
  // INV-2: profit_gross = 281,600.00
  // INV-3: profit_gross = 112,640.00
  // INV-5: profit_gross = 17,002.30
  // CS-2: profit = 600.00
  // Sum Main branch profit: 281,600 + 112,640 + 17,002.30 + 600 = 411,842.30

  // South branch (398bd10a):
  // INV-1: profit_gross = 140,800.00

  // North branch (4330d620):
  // INV-4: profit_gross = 140,800.00
  // CS-1: profit = 741.00
  // Sum North: 141,541.00

  // Branch 5c456a11:
  // INV-6: profit_gross = 12,132.30
  // CS-2: profit = 600.00
  // Sum: 12,732.30

  // Wait! What if someone calculated:
  // 706,315.60 - 417,423 = 288,892.60
  // What is 417,423?
  // Notice: 417,423 has no decimal part (.00)!
  // 706,315.60 - 288,892.60 = 417,423.00!
  // Where did the .60 go? Both 706,315.60 and 288,892.60 end in .60!
  // So the difference is EXACTLY an integer: 417,423!
  // Which numbers in our dataset have no decimals or end in .60?
  // INV-2 gross profit = 281,600.00
  // If we take 281,600 + ...?
  // What if 288,892.60 was:
  // INV-2 profit gross: 281,600.00
  // + CS-1 profit: 741.00
  // + CS-2 profit: 600.00
  // = 282,941.00
  // What if 706,315.60 - (INV-1 + INV-4) profit?
  // INV-1 profit_gross = 140,800.00
  // INV-4 profit_gross = 140,800.00
  // 140,800 + 140,800 = 281,600.00
  // What if (Total Gross Profit 706,315.60) - (INV-2 profit_gross 281,600) = 424,715.60?
  // What if (Total Gross Profit 706,315.60) - (something) = 288,892.60?
  // Let's test all combinations of items and invoices!

  const items = [
    { name: 'INV-1 (Laptop)', grossProf: 140800, netProf: 85000, tax: 55800, revGross: 365800, cogs: 225000 },
    { name: 'INV-2 (Laptop)', grossProf: 281600, netProf: 170000, tax: 111600, revGross: 731600, cogs: 450000 },
    { name: 'INV-3 (Laptop)', grossProf: 112640, netProf: 68000, tax: 44640, revGross: 292640, cogs: 180000 },
    { name: 'INV-4 (Laptop)', grossProf: 140800, netProf: 85000, tax: 55800, revGross: 365800, cogs: 225000 },
    { name: 'INV-5 (CCTV)', grossProf: 10988.20, netProf: 6490, tax: 4498.20, revGross: 29488.20, cogs: 18500 },
    { name: 'INV-5 (Speaker)', grossProf: 6014.10, netProf: 3495, tax: 2519.10, revGross: 16514.10, cogs: 10500 },
    { name: 'INV-6 (Charger)', grossProf: 4988.20, netProf: 3190, tax: 1798.20, revGross: 11788.20, cogs: 6800 },
    { name: 'INV-6 (Headphones)', grossProf: 7144.10, netProf: 3995, tax: 3149.10, revGross: 20644.10, cogs: 13500 },
    { name: 'CS-1 (HDMI)', grossProf: 741.00, netProf: 741.00, tax: 0, revGross: 3141, cogs: 2400 },
    { name: 'CS-2 (HDMI)', grossProf: 600.00, netProf: 600.00, tax: 0, revGross: 3000, cogs: 2400 }
  ];

  console.log('Checking subset sums for 417423 or 288892.60:');
  // Check any linear combination of grossProf, netProf, tax, cogs, etc.
  // ...
  await client.end();
}
main();

