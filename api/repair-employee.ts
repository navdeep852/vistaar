import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

function generateSecureTempPass(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*_-+=';
  const allChars = upper + lower + digits + symbols;

  const getRandomChar = (charset: string): string => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return charset[arr[0] % charset.length];
  };

  const chars: string[] = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(symbols),
  ];

  for (let i = 4; i < Math.max(14, length); i++) {
    chars.push(getRandomChar(allChars));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  const generated = chars.join('');
  return (generated.length >= 12 && /[A-Z]/.test(generated) && /[a-z]/.test(generated) && /[0-9]/.test(generated) && /[^A-Za-z0-9]/.test(generated))
    ? generated
    : generateSecureTempPass(length);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing authorization header.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const clientUser = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user: callerUser }, error: callerAuthErr } = await clientUser.auth.getUser();
  if (callerAuthErr || !callerUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid authentication session.' });
  }

  const { employeeId, tempPassword } = req.body || {};
  const repairPassword = tempPassword || generateSecureTempPass();

  // If Service Role Key available, perform admin repair
  if (serviceRoleKey) {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: callerProf } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status, workspace_id')
      .eq('id', callerUser.id)
      .single();

    if (!callerProf || callerProf.role !== 'owner' || callerProf.status !== 'Active') {
      return res.status(403).json({ success: false, error: 'Only the workspace owner can repair employee accounts.' });
    }

    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('workspace_id', callerProf.workspace_id)
      .or(`employee_id.eq.${employeeId},id.eq.${employeeId}`)
      .single();

    if (!prof) {
      return res.status(404).json({ success: false, error: 'Employee profile not found in your workspace.' });
    }

    let authUserId = prof.id;
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
    const existing = (listData?.users || []).find((u: any) => (u.email || '').toLowerCase() === prof.email.toLowerCase());

    if (existing) {
      authUserId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: repairPassword,
        user_metadata: {
          ...existing.user_metadata,
          account_type: 'employee',
          workspace_id: callerProf.workspace_id,
          employee_id: prof.employee_id,
          role: 'employee',
          must_change_password: true,
        },
      });
    } else {
      const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: prof.email,
        password: repairPassword,
        email_confirm: true,
        user_metadata: {
          account_type: 'employee',
          workspace_id: callerProf.workspace_id,
          name: prof.name,
          phone: prof.phone || '',
          department: prof.department || '',
          designation: prof.designation || '',
          role: 'employee',
          employee_id: prof.employee_id,
          must_change_password: true,
        },
      });

      if (createErr || !newAuth?.user) {
        return res.status(500).json({ success: false, error: createErr?.message || 'Failed to create Auth account' });
      }
      authUserId = newAuth.user.id;
    }

    await supabaseAdmin.from('profiles').upsert({
      ...prof,
      id: authUserId,
      status: 'Active',
      must_change_password: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    return res.status(200).json({
      success: true,
      empId: prof.employee_id,
      tempPass: repairPassword,
      name: prof.name,
      user: { id: authUserId, email: prof.email, name: prof.name, role: 'employee' },
    });
  }

  // Fallback to RPC repair_employee_account
  try {
    const { data: rpcRes, error: rpcErr } = await clientUser.rpc('repair_employee_account', {
      p_employee_id: employeeId,
      p_temporary_password: repairPassword,
    });

    if (rpcErr) {
      return res.status(400).json({ success: false, error: rpcErr.message });
    }

    return res.status(200).json(rpcRes);
  } catch (rpcEx: any) {
    return res.status(500).json({ success: false, error: rpcEx.message || 'Server error repairing employee account.' });
  }
}
