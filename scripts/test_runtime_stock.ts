import { supabase } from '../src/lib/supabase';
import { productService } from '../src/services/supabase/productService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import * as fs from 'fs';

const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';

async function main() {
  const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
  console.log('Authenticating with Supabase session for', authData.user?.email);

  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data: userRes } = await supabase.auth.getUser();
  console.log('supabase.auth.getUser():', userRes?.user?.id, userRes?.user?.email);

  // Set current user profile in supabaseAuthService
  (supabaseAuthService as any).currentProfile = {
    id: userRes.user!.id,
    companyId: WS_ID,
    role: 'owner',
    name: 'Navdeep Maurya',
    email: userRes.user!.email
  };

  // Direct Supabase query to see what PostgREST returns for products
  console.log('\n--- DIRECT SUPABASE PRODUCTS QUERY ---');
  const { data: directProds, error: directErr } = await supabase
    .from('products')
    .select('id, name, sku, current_stock, minimum_stock')
    .eq('workspace_id', WS_ID);
  console.log('Direct query count:', directProds?.length, 'error:', directErr);
  if (directProds && directProds.length > 0) {
    console.table(directProds.slice(0, 5));
  }

  // Test 1: Fetch with branchId = undefined
  console.log('\n--- TEST 1: productService.getProducts({ branchId: undefined }) ---');
  productService.invalidateCache();
  const res1 = await productService.getProducts({ workspaceId: WS_ID });
  console.log('Result 1 count:', res1.data.length, 'error:', res1.error);
  console.table(res1.data.slice(0, 5).map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, branchId: (p as any).branchId })));

  // Test 2: Fetch with branchId = MAIN_BRANCH_ID
  console.log('\n--- TEST 2: productService.getProducts({ branchId: MAIN_BRANCH_ID }) ---');
  productService.invalidateCache();
  const res2 = await productService.getProducts({ workspaceId: WS_ID, branchId: MAIN_BRANCH_ID });
  console.log('Result 2 count:', res2.data.length, 'error:', res2.error);
  console.table(res2.data.slice(0, 5).map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, branchId: (p as any).branchId })));

  // Test 3: Fetch with branchId = NORTH_BRANCH_ID
  console.log('\n--- TEST 3: productService.getProducts({ branchId: NORTH_BRANCH_ID }) ---');
  productService.invalidateCache();
  const res3 = await productService.getProducts({ workspaceId: WS_ID, branchId: NORTH_BRANCH_ID });
  console.log('Result 3 count:', res3.data.length, 'error:', res3.error);
  console.table(res3.data.slice(0, 5).map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, branchId: (p as any).branchId })));

  // Test 4: Fetch with branchId = 'ALL'
  console.log('\n--- TEST 4: productService.getProducts({ branchId: "ALL" }) ---');
  productService.invalidateCache();
  const res4 = await productService.getProducts({ workspaceId: WS_ID, branchId: 'ALL' });
  console.log('Result 4 count:', res4.data.length, 'error:', res4.error);
  console.table(res4.data.slice(0, 5).map(p => ({ id: p.id, name: p.name, currentStock: p.currentStock, branchId: (p as any).branchId })));
}

main().catch(console.error);
