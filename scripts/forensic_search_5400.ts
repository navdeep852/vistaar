import { supabase } from '../src/lib/supabase';

async function main() {
  console.log('--- SEARCHING FOR 5400 SALE ACROSS SUPABASE ---');
  
  // 1. Check counter_sales table
  const { data: cs, error: csErr } = await supabase.from('counter_sales').select('*');
  console.log('counter_sales total rows:', cs?.length, 'error:', csErr?.message);
  if (cs && cs.length > 0) {
    for (const s of cs) {
      console.log('CS:', s.id, s.sale_number, s.invoice_number, s.final_total, s.workspace_id, s.branch_id, s.notes, s.created_at);
    }
  }

  // 2. Check invoices table
  const { data: inv, error: invErr } = await supabase.from('invoices').select('id, invoice_number, grand_total, balance_amount, branch_id, workspace_id, date, created_at, notes, terms');
  console.log('invoices total rows:', inv?.length, 'error:', invErr?.message);
  if (inv && inv.length > 0) {
    for (const i of inv) {
      if (Number(i.grand_total) === 5400 || String(i.grand_total).includes('5400') || JSON.stringify(i).includes('5400')) {
        console.log('MATCHING INVOICE (5400):', i);
      }
    }
  }

  // 3. Check daybook_transactions
  const { data: db, error: dbErr } = await supabase.from('daybook_transactions').select('*');
  console.log('daybook total rows:', db?.length, 'error:', dbErr?.message);
  if (db && db.length > 0) {
    for (const d of db) {
      if (Number(d.amount) === 5400 || Number(d.total_amount) === 5400 || JSON.stringify(d).includes('5400')) {
        console.log('MATCHING DAYBOOK (5400):', d);
      }
    }
  }

  // 4. Check stock_movements
  const { data: sm, error: smErr } = await supabase.from('stock_movements').select('*');
  console.log('stock_movements total rows:', sm?.length, 'error:', smErr?.message);
  if (sm && sm.length > 0) {
    for (const m of sm) {
      if (JSON.stringify(m).includes('5400')) {
        console.log('MATCHING STOCK MOVEMENT (5400):', m);
      }
    }
  }

  // 5. Check branches
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  console.log('Branches:', branches?.map(b => ({ id: b.id, name: b.branch_name, code: b.branch_code, is_main: b.is_main_branch })));

  console.log('--- COMPLETED FORENSIC SEARCH ---');
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
