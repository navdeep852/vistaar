import { supabase, isSupabaseConfigured } from '../src/lib/supabase';

async function searchIncident() {
  console.log('--- FORENSIC INCIDENT INVESTIGATION ---');
  console.log('isSupabaseConfigured:', isSupabaseConfigured());

  // 1. Search counter_sales
  const { data: csAll, error: csErr } = await supabase
    .from('counter_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('counter_sales error:', csErr?.message || 'none', 'total fetched:', csAll?.length);
  if (csAll) {
    const matchedCs = csAll.filter((cs: any) => 
      JSON.stringify(cs).includes('7600') || 
      JSON.stringify(cs).toLowerCase().includes('100ss') ||
      JSON.stringify(cs).toLowerCase().includes('testbranch') ||
      JSON.stringify(cs).toLowerCase().includes('bearing')
    );
    console.log('Matched counter_sales:', JSON.stringify(matchedCs, null, 2));
    if (csAll.length > 0) {
      console.log('Latest 3 counter_sales:', JSON.stringify(csAll.slice(0, 3), null, 2));
    }
  }

  // 2. Search counter_sale_items
  const { data: csiAll, error: csiErr } = await supabase
    .from('counter_sale_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('counter_sale_items error:', csiErr?.message || 'none', 'total fetched:', csiAll?.length);
  if (csiAll) {
    const matchedCsi = csiAll.filter((csi: any) => 
      JSON.stringify(csi).includes('7600') || 
      JSON.stringify(csi).toLowerCase().includes('100ss') ||
      JSON.stringify(csi).toLowerCase().includes('bearing') ||
      Number(csi.quantity) === 20
    );
    console.log('Matched counter_sale_items:', JSON.stringify(matchedCsi, null, 2));
  }

  // 3. Search invoices
  const { data: invAll, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('invoices error:', invErr?.message || 'none', 'total fetched:', invAll?.length);
  if (invAll) {
    const matchedInv = invAll.filter((inv: any) => 
      JSON.stringify(inv).includes('7600') || 
      JSON.stringify(inv).toLowerCase().includes('100ss') ||
      JSON.stringify(inv).toLowerCase().includes('testbranch') ||
      JSON.stringify(inv).toLowerCase().includes('bearing')
    );
    console.log('Matched invoices:', JSON.stringify(matchedInv, null, 2));
  }

  // 4. Search stock_movements
  const { data: smAll, error: smErr } = await supabase
    .from('stock_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('stock_movements error:', smErr?.message || 'none', 'total fetched:', smAll?.length);
  if (smAll) {
    const matchedSm = smAll.filter((sm: any) => 
      JSON.stringify(sm).includes('7600') || 
      JSON.stringify(sm).toLowerCase().includes('100ss') ||
      JSON.stringify(sm).toLowerCase().includes('testbranch') ||
      JSON.stringify(sm).toLowerCase().includes('bearing') ||
      Math.abs(Number(sm.quantity)) === 20
    );
    console.log('Matched stock_movements:', JSON.stringify(matchedSm, null, 2));
    if (smAll.length > 0) {
      console.log('Latest 5 stock_movements:', JSON.stringify(smAll.slice(0, 5), null, 2));
    }
  }

  // 5. Search products for Bearing or 100SS
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, name, part_number, product_code, current_stock, workspace_id')
    .or('name.ilike.%100ss%,name.ilike.%bearing%,part_number.ilike.%100ss%,product_code.ilike.%100ss%');
  console.log('products error:', pErr?.message || 'none', 'matched products:', JSON.stringify(prods, null, 2));

  // 6. Search branches for testbranch
  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('*')
    .ilike('branch_name', '%test%');
  console.log('branches error:', bErr?.message || 'none', 'matched branches:', JSON.stringify(branches, null, 2));

  // 7. Search payments
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('payments error:', payErr?.message || 'none', 'total fetched:', payments?.length);
  if (payments) {
    const matchedPay = payments.filter((p: any) => JSON.stringify(p).includes('7600'));
    console.log('Matched payments (7600):', JSON.stringify(matchedPay, null, 2));
  }

  // 8. Search daybook
  const { data: daybook, error: dErr } = await supabase
    .from('daybook_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('daybook error:', dErr?.message || 'none', 'total fetched:', daybook?.length);
  if (daybook) {
    const matchedD = daybook.filter((d: any) => JSON.stringify(d).includes('7600') || JSON.stringify(d).toLowerCase().includes('100ss'));
    console.log('Matched daybook:', JSON.stringify(matchedD, null, 2));
  }
}

searchIncident().catch(console.error);
