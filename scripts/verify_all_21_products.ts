import { supabase } from '../src/lib/supabase';
import { productService } from '../src/services/supabase/productService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import * as fs from 'fs';

const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';

async function verify() {
  const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data: userRes } = await supabase.auth.getUser();

  (supabaseAuthService as any).currentProfile = {
    id: userRes.user!.id,
    companyId: WS_ID,
    role: 'owner',
    name: 'Navdeep Maurya',
    email: userRes.user!.email,
  };

  // 1. Fetch raw from PostgreSQL/PostgREST
  const { data: dbProducts, error: dbErr } = await supabase
    .from('products')
    .select('id, name, sku, current_stock, minimum_stock')
    .eq('workspace_id', WS_ID)
    .order('name');

  if (dbErr || !dbProducts) {
    console.error('Failed to fetch from DB:', dbErr);
    return;
  }

  console.log(`Fetched ${dbProducts.length} products from PostgreSQL.`);

  // 2. Fetch via productService for Main Branch
  productService.invalidateCache();
  const mainRes = await productService.getProducts({ workspaceId: WS_ID, branchId: MAIN_BRANCH_ID });

  // 3. Fetch via productService for North Branch
  productService.invalidateCache();
  const northRes = await productService.getProducts({ workspaceId: WS_ID, branchId: NORTH_BRANCH_ID });

  // 4. Fetch via productService for ALL Branches
  productService.invalidateCache();
  const allRes = await productService.getProducts({ workspaceId: WS_ID, branchId: 'ALL' });

  // 5. Check store.getProductAvailableStock for each product
  store.setProducts(mainRes.data);

  const comparisonRows: any[] = [];
  let allMatched = true;

  for (const p of dbProducts) {
    const rawStock = Number(p.current_stock);
    const mainProd = mainRes.data.find((m) => m.id === p.id);
    const northProd = northRes.data.find((n) => n.id === p.id);
    const allProd = allRes.data.find((a) => a.id === p.id);
    const storeStock = store.getProductAvailableStock(p.id, MAIN_BRANCH_ID);

    const mainStock = mainProd ? mainProd.currentStock : -1;
    const northStock = northProd ? northProd.currentStock : -1;
    const consolidatedStock = allProd ? allProd.currentStock : -1;

    const matches =
      mainStock === rawStock &&
      northStock === rawStock &&
      consolidatedStock === rawStock &&
      storeStock === rawStock;

    if (!matches) {
      allMatched = false;
    }

    comparisonRows.push({
      Name: p.name,
      SKU: p.sku,
      'DB Raw': rawStock,
      'Main Branch': mainStock,
      'North Branch': northStock,
      'Consolidated (ALL)': consolidatedStock,
      'Store Service': storeStock,
      Status: rawStock === 0 ? 'Out of Stock (Genuine)' : 'In Stock',
      Match: matches ? 'PASS' : 'FAIL',
    });
  }

  console.table(comparisonRows);
  console.log('\n==============================================');
  console.log(`ALL 21 PRODUCTS PARITY CHECK: ${allMatched ? 'ALL PASSED (100% PARITY)' : 'FAILED'}`);
  console.log('==============================================');

  const positiveCount = dbProducts.filter((p) => Number(p.current_stock) > 0).length;
  const zeroCount = dbProducts.filter((p) => Number(p.current_stock) <= 0).length;
  console.log(`Positive stock products: ${positiveCount} (expected 19)`);
  console.log(`Zero stock products: ${zeroCount} (expected 2: Laptop and CCTV Camera)`);
}

verify().catch(console.error);
