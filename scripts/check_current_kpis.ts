import { supabase } from '../src/lib/supabase';
import { financialAnalyticsRepository } from '../src/services/analytics/financialAnalyticsRepository';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { resolveDateRange } from '../src/lib/dateRange';
import * as fs from 'fs';

const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';

async function main() {
  const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
  // Set Authorization header on supabase client
  (supabase as any).rest.headers = {
    ...(supabase as any).rest.headers,
    Authorization: `Bearer ${authData.access_token}`,
  };
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  (supabaseAuthService as any).currentProfile = {
    id: authData.user?.id || '9c7c7b39-55b5-4778-a3e4-79b133833b8b',
    companyId: WS_ID,
    role: 'owner',
    name: 'Navdeep Maurya',
    email: authData.user?.email || 'navdeep@vistaarone.com',
  };

  const todayRange = resolveDateRange('today');
  console.log('Today Range:', todayRange.startDateStr, 'to', todayRange.endDateStr);

  financialAnalyticsRepository.invalidateCache();
  const kpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, MAIN_BRANCH_ID, WS_ID);
  console.log('KPIs with current local code (commit 6d7030b):');
  console.log(JSON.stringify(kpis, null, 2));
}

main().catch(console.error);
