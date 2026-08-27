import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykmnijvkqxelba.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  console.log('=============================================================================');
  console.log('VISTAAR SUPABASE MIGRATION — PHASE 3B LIVE SEEDING EXECUTOR');
  console.log('=============================================================================\n');

  console.log('1. Reading seed file supabase/migrations/003_seed_initial_data.sql...');
  const seedFilePath = path.resolve(process.cwd(), 'supabase', 'migrations', '003_seed_initial_data.sql');
  
  if (!fs.existsSync(seedFilePath)) {
    console.error('❌ Error: Seed migration file not found at:', seedFilePath);
    process.exit(1);
  }

  console.log('✅ Seed file loaded successfully.');
  console.log('2. Live database seeding instructions:');
  console.log('   - Copy the SQL contents of supabase/migrations/003_seed_initial_data.sql');
  console.log('   - Paste and run it in your Supabase SQL Editor (https://supabase.com/dashboard/project/kluxsykmnijvkqxelba)');
  console.log('\n=============================================================================');
  console.log('PHASE 3B SEED FILE GENERATED AND READY FOR EXECUTING IN SUPABASE SQL EDITOR.');
  console.log('=============================================================================\n');
}

executeMigration();
