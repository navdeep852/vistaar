import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { employeeId, workspaceId } = req.body || {};
  const cleanId = (employeeId || '').trim().toUpperCase();

  if (!cleanId) {
    return res.status(400).json({ found: false, error: 'Employee ID is required.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // 1. First attempt RPC get_email_by_employee_id
  try {
    const { data: rpcEmail, error: rpcErr } = await supabase.rpc('get_email_by_employee_id', {
      p_employee_id: cleanId,
      p_workspace_id: workspaceId || null,
    });

    if (!rpcErr && rpcEmail) {
      return res.status(200).json({
        found: true,
        email: String(rpcEmail).toLowerCase(),
        status: 'Active',
      });
    }
  } catch {
    // Continue to direct query if service role available
  }

  // 2. Direct query via service role client (bypasses RLS safely for login resolution)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      let q = supabase
        .from('profiles')
        .select('email, status')
        .ilike('employee_id', cleanId)
        .eq('is_archived', false);

      if (workspaceId) {
        q = q.eq('workspace_id', workspaceId);
      }

      const { data: prof } = await q.maybeSingle();
      if (prof && prof.email) {
        return res.status(200).json({
          found: true,
          email: prof.email.toLowerCase(),
          status: prof.status || 'Active',
        });
      }
    } catch (e: any) {
      console.warn('[Vercel API Resolve Employee] Query error:', e);
    }
  }

  return res.status(404).json({ found: false, error: 'Employee ID not found or inactive.' });
}
