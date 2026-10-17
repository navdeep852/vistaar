import { supabase } from '../src/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function inspectAllSources() {
  console.log('=== INSPECTING ALL PERSISTENT SOURCES FOR SOLDIER / 87000 ===');

  // 1. Check Supabase Invoices
  try {
    const { data: invs, error } = await supabase.from('invoices').select('*');
    if (error) console.log('Supabase invoices query error:', error.message);
    else {
      console.log(`Supabase total invoices count: ${invs?.length || 0}`);
      const matches = (invs || []).filter((i: any) =>
        (i.customer_name && i.customer_name.toLowerCase().includes('soldier')) ||
        Math.abs(Number(i.grand_total) - 87000) < 1000 ||
        Math.abs(Number(i.paid_amount) - 87000) < 1000
      );
      console.log(`Supabase soldier/87000 matches:`, matches);
    }
  } catch (e: any) {
    console.log('Supabase query exception:', e.message);
  }

  // 2. Check Supabase Payments
  try {
    const { data: pays, error } = await supabase.from('payments').select('*');
    if (error) console.log('Supabase payments query error:', error.message);
    else {
      console.log(`Supabase total payments count: ${pays?.length || 0}`);
      const matches = (pays || []).filter((p: any) =>
        (p.customer_name && p.customer_name.toLowerCase().includes('soldier')) ||
        Math.abs(Number(p.amount) - 87000) < 1000
      );
      console.log(`Supabase soldier/87000 payment matches:`, matches);
    }
  } catch (e: any) {
    console.log('Supabase payments query exception:', e.message);
  }

  // 3. Check data/ directory for any store.json or backup files
  const dataDir = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    console.log(`Files in data/:`, files);
    for (const f of files) {
      const fullPath = path.join(dataDir, f);
      if (fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes('soldier') || content.includes('87000')) {
          console.log(`FOUND match in ${f}!`);
        }
      }
    }
  }

  // 4. Check data/backups/
  const backupsDir = path.join(dataDir, 'backups');
  if (fs.existsSync(backupsDir)) {
    const files = fs.readdirSync(backupsDir);
    console.log(`Files in data/backups/:`, files);
    for (const f of files) {
      const content = fs.readFileSync(path.join(backupsDir, f), 'utf8');
      if (content.toLowerCase().includes('soldier') || content.includes('87000')) {
        console.log(`FOUND match in backup ${f}!`);
      }
    }
  }
}

inspectAllSources();
