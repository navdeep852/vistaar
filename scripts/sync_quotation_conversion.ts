import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function syncQuotationStatus() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  
  const { data, error } = await supabase
    .from('quotations')
    .update({
      status: 'Converted',
      converted_invoice_id: '097946a0-6e5b-40ca-a7de-6b46e76459aa'
    })
    .eq('quotation_number', 'QT-2026-5468')
    .select();

  console.log('Quotation update result:', data, 'error:', error);
}

syncQuotationStatus().catch(console.error);
