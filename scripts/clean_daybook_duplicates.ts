import { daybookService } from '../src/services/supabase/daybookService';

async function main() {
  console.log('=== VISTAAR DAYBOOK DUPLICATE CLEANUP UTILITY ===');
  const res = await daybookService.cleanDaybookDuplicates();
  console.log(`Cleanup complete. Cleaned: ${res.cleanedCount} duplicate entries.`);
  if (res.details.length > 0) {
    console.log('Details:');
    res.details.forEach((d) => console.log(' - ' + d));
  }
}

main().catch(console.error);

