import { createClient } from '@supabase/supabase-js';

// Auto-load env in Node/script environment if available
const proc = (globalThis as any).process;
if (proc && proc.env && !proc.env.VITE_SUPABASE_URL) {
  try {
    // dynamically access if in Node
    const fs = (globalThis as any).require ? (globalThis as any).require('fs') : null;
    const path = (globalThis as any).require ? (globalThis as any).require('path') : null;
    if (fs && path) {
      const envPath = path.resolve(proc.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content: string = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach((line: string) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim();
              proc.env[key] = val;
            }
          }
        });
      }
    }
  } catch (e) {
    // Ignore error in browser/Vite context
  }
}

const getEnvVar = (key: string): string | undefined => {
  const proc = (globalThis as any).process;
  if (proc?.env && proc.env[key]) {
    return proc.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta?.env) {
    return import.meta.env[key];
  }
  return undefined;
};

export const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || 'https://kluxsykmnijvkqxelba.supabase.co';
export const supabaseAnonKey =
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

export const isSupabaseConfigured = (): boolean => {
  const url = getEnvVar('VITE_SUPABASE_URL') || supabaseUrl;
  const key = getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || supabaseAnonKey;
  if (!url || !key) return false;
  if (
    url === 'https://your-supabase-project-id.supabase.co' ||
    url === 'https://placeholder.supabase.co' ||
    url.includes('kluxsykmnijvkqxelba') ||
    url.includes('placeholder') ||
    url.includes('your-supabase-project-id')
  ) {
    return false;
  }
  if (
    key === 'your-supabase-publishable-anon-key' ||
    key === 'placeholder-anon-key' ||
    key.includes('placeholder')
  ) {
    return false;
  }
  return true;
};

if (typeof window !== 'undefined' && (import.meta as any)?.env?.DEV) {
  const rawUrl = getEnvVar('VITE_SUPABASE_URL');
  let origin: string | null = null;
  try {
    if (rawUrl) origin = new URL(rawUrl).origin;
  } catch (e) {
    origin = 'invalid-url';
  }
  console.log('[Supabase Config Check]', {
    supabaseUrlConfigured: Boolean(rawUrl),
    supabaseUrl: origin,
    anonKeyConfigured: Boolean(supabaseAnonKey && supabaseAnonKey !== 'placeholder-anon-key'),
    isConfigured: isSupabaseConfigured(),
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  url: string;
  status: number | null;
  category: string | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      connected: false,
      url: supabaseUrl,
      status: 400,
      category: 'UNCONFIGURED_ENVIRONMENT',
      error: 'Supabase is not configured with a valid live cloud project URL.',
    };
  }

  try {
    const { data, error, status } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) {
      return {
        connected: false,
        url: supabaseUrl,
        status,
        category: error.code ? `DB Error (${error.code})` : 'Query Failure',
        error: error.message,
      };
    }

    return {
      connected: true,
      url: supabaseUrl,
      status: status || 200,
      category: null,
      error: null,
    };
  } catch (err: any) {
    return {
      connected: false,
      url: supabaseUrl,
      status: null,
      category: 'Network/Transport Failure',
      error: err?.message || String(err),
    };
  }
}
