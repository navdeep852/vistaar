/**
 * Diagnostic Script: Product Creation Deep Investigation
 * Traces exact request, payload, database constraints, RLS policies, and triggers for products table.
 */

import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { productService } from '../src/services/supabase/productService';
import { supabaseAuthService } from '../src/services/supabaseAuth';

async function diagnoseProductSave() {
  console.log('====================================================');
  console.log('  DIAGNOSING PRODUCT CREATION / SAVE PIPELINE FAILURE');
  console.log('====================================================\n');

  console.log('1. Checking Supabase Configuration...');
  console.log('   isSupabaseConfigured():', isSupabaseConfigured());

  // Log in as test user/demo user to get a real session context
  console.log('\n2. Logging in to establish authenticated tenant context...');
  const loginRes = await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');
  console.log('   Login success:', loginRes.success);
  if (loginRes.error) {
    console.error('   Login error:', loginRes.error);
  }

  const currentProfile = supabaseAuthService.getUser();
  console.log('   Current User Profile:', currentProfile);
  const workspaceId = supabaseAuthService.getCurrentCompanyId();
  console.log('   Current Workspace ID:', workspaceId);

  // Check auth user in Supabase
  const { data: authUser, error: authError } = await supabase.auth.getUser();
  console.log('   Supabase Auth User:', authUser?.user?.id || 'No auth user', authError || '');

  // 3. Inspect Table Structure of 'products'
  console.log('\n3. Testing direct SELECT from products table...');
  const { data: selData, error: selError } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', workspaceId)
    .limit(1);

  if (selError) {
    console.error('   SELECT Error:', selError);
  } else {
    console.log('   SELECT Successful! Found rows:', selData?.length);
    if (selData && selData.length > 0) {
      console.log('   Sample Product Row Keys:', Object.keys(selData[0]));
    }
  }

  // 4. Test exact product payload submission matching the user screenshot
  console.log('\n4. Testing Product Insertion via productService.addProduct()...');
  const sampleFormPayload = {
    name: '75665',
    partNumber: '1000078',
    productCode: '1000078',
    sku: '1000078',
    category: 'Bearing',
    brand: 'ABC',
    unit: 'Piece',
    buyPrice: 200,
    sellingPrice: 300,
    currentStock: 23,
    receivedDate: '2026-08-28',
    purchaseOrderNumber: '',
    supplierName: '',
    hsnSac: '',
    gstRate: 18,
    minimumStock: 5,
    notes: 'Diagnostic Test Product',
  };

  console.log('   Sample Form Payload:', JSON.stringify(sampleFormPayload, null, 2));

  const addRes = await productService.addProduct(sampleFormPayload as any);
  console.log('   addProduct Result:', JSON.stringify(addRes, null, 2));

  if (!addRes.success) {
    console.log('\n5. Performing direct database insert to capture raw PostgreSQL error...');
    const rawPayload = {
      workspace_id: workspaceId,
      name: sampleFormPayload.name,
      part_number: sampleFormPayload.partNumber,
      sku: sampleFormPayload.sku,
      unit: sampleFormPayload.unit,
      buy_price: sampleFormPayload.buyPrice,
      selling_price: sampleFormPayload.sellingPrice,
      minimum_stock: sampleFormPayload.minimumStock,
      current_stock: sampleFormPayload.currentStock,
      tax_percent: sampleFormPayload.gstRate,
      description: sampleFormPayload.notes,
    };

    console.log('   Raw Supabase Payload:', JSON.stringify(rawPayload, null, 2));

    const { data: rawData, error: rawError } = await supabase
      .from('products')
      .insert([rawPayload])
      .select()
      .single();

    console.log('   Raw Insert Data:', rawData);
    console.log('   Raw Insert Error:', JSON.stringify(rawError, null, 2));
    if (rawError) {
      console.log('   Error Code:', (rawError as any).code);
      console.log('   Error Message:', (rawError as any).message);
      console.log('   Error Details:', (rawError as any).details);
      console.log('   Error Hint:', (rawError as any).hint);
    }
  }

  // 6. Test stock receipt insert if product insert succeeded
  if (addRes.success && addRes.data?.id) {
    console.log('\n6. Product created successfully! ID:', addRes.data.id);
    console.log('   Cleaning up diagnostic product...');
    await productService.deleteProduct(addRes.data.id);
  }
}

diagnoseProductSave().catch((err) => {
  console.error('Fatal diagnostic exception:', err);
});
