import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta?.env) {
    return import.meta.env[key];
  }
  const proc = (globalThis as any).process;
  if (proc?.env) {
    return proc.env[key];
  }
  return undefined;
};

export const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || 'https://placeholder.supabase.co';
export const supabaseAnonKey =
  getEnvVar('VITE_SUPABASE_ANON_KEY') ||
  getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  'placeholder-anon-key';

export const isSupabaseConfigured = (): boolean => {
  const url = getEnvVar('VITE_SUPABASE_URL');
  const key = supabaseAnonKey;
  if (!url || !key) return false;
  if (
    url === 'https://your-supabase-project-id.supabase.co' ||
    url === 'https://placeholder.supabase.co' ||
    url.includes('kluxsykmnijvkqxelba') ||
    url.includes('placeholder') ||
    url.includes('your-supabase-project-id') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
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
