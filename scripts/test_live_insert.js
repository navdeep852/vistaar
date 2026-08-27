import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykmnijvkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function run() {
  console.log('Testing live connection to Supabase...');
  try {
    const { data, error, status } = await supabase.from('workspaces').select('*');
    if (error) {
      console.error('Supabase Query Error:', error);
    } else {
      console.log(`Success! Query returned status ${status}. Workspace count: ${data.length}`);
    }
  } catch (err) {
    console.error('Exception during query:', err.message);
  }
}

run();
