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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  // 1. Authenticate caller with Supabase
  const clientUser = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user: callerUser }, error: callerAuthErr } = await clientUser.auth.getUser();
  if (callerAuthErr || !callerUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid authentication session.' });
  }

  // 2. If Service Role Key is configured, execute via Admin client
  if (serviceRoleKey) {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Verify caller is active Owner
    const { data: callerProfile, error: callerProfErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status, workspace_id')
      .eq('id', callerUser.id)
      .single();

    if (callerProfErr || !callerProfile || callerProfile.role !== 'owner' || callerProfile.status !== 'Active') {
      return res.status(403).json({ success: false, error: 'Only the workspace owner can create VISTAAR login accounts.' });
    }

    const ownerWorkspaceId = callerProfile.workspace_id;
    const { name, email, phone, department, designation } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Employee name is required.' });
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    // Check duplicate
    const { data: dupProf } = await supabaseAdmin.from('profiles').select('id').eq('email', cleanEmail).maybeSingle();
    if (dupProf) {
      return res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
    }

    // Generate sequential Employee ID
    let nextEmployeeId: string;
    const { data: rpcEmpId } = await supabaseAdmin.rpc('generate_next_employee_id', { p_workspace_id: ownerWorkspaceId });
    if (rpcEmpId && typeof rpcEmpId === 'string' && /^VST-EMP-\d+$/i.test(rpcEmpId)) {
      nextEmployeeId = rpcEmpId;
    } else {
      const { data: profs } = await supabaseAdmin.from('profiles').select('employee_id').eq('workspace_id', ownerWorkspaceId);
      let maxNum = 0;
      (profs || []).forEach((p: { employee_id?: string }) => {
        const mEmp = (p.employee_id || '').match(/^VST-EMP-(\d+)$/i);
        const mVst = (p.employee_id || '').match(/^VST-(\d+)$/i);
        if (mEmp) {
          const n = parseInt(mEmp[1], 10);
          if (n > maxNum) maxNum = n;
        } else if (mVst) {
          const n = parseInt(mVst[1], 10);
          if (n > maxNum) maxNum = n;
        }
      });
      nextEmployeeId = `VST-EMP-${String(maxNum + 1).padStart(3, '0')}`;
    }

    const temporaryPassword = generateSecureTempPass();
    const cleanPhone = (phone || '').replace(/\D/g, '');

    // Create Supabase Auth User
    const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        account_type: 'employee',
        workspace_id: ownerWorkspaceId,
        name: name.trim(),
        phone: cleanPhone,
        department: (department || '').trim(),
        designation: (designation || '').trim(),
        role: 'employee',
        employee_id: nextEmployeeId,
        must_change_password: true,
      },
    });

    if (authErr) {
      const msg = authErr.message?.includes('already registered') || authErr.message?.includes('email_exists')
        ? 'An account with this email address already exists.'
        : authErr.message;
      return res.status(400).json({ success: false, error: msg });
    }

    const newAuthUser = authCreated?.user;
    if (!newAuthUser) {
      return res.status(500).json({ success: false, error: 'Authentication service did not return a user record.' });
    }

    // Atomic profile upsert
    const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
      id: newAuthUser.id,
      workspace_id: ownerWorkspaceId,
      employee_id: nextEmployeeId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      department: (department || '').trim() || null,
      designation: (designation || '').trim() || null,
      role: 'employee',
      status: 'Active',
      must_change_password: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.id);
      return res.status(500).json({ success: false, error: 'Failed to create employee profile record. Action was rolled back.' });
    }

    return res.status(200).json({
      success: true,
      empId: nextEmployeeId,
      tempPass: temporaryPassword,
      name: name.trim(),
      user: {
        id: newAuthUser.id,
        email: cleanEmail,
        name: name.trim(),
        role: 'employee',
      },
    });
  }

  // 3. Fallback to caller-scoped RPC create_employee_account
  try {
    const { name, email, phone, department, designation } = req.body || {};
    const temporaryPassword = generateSecureTempPass();
    const { data: rpcRes, error: rpcErr } = await clientUser.rpc('create_employee_account', {
      p_name: (name || '').trim(),
      p_email: (email || '').trim().toLowerCase(),
      p_phone: phone || '',
      p_department: department || null,
      p_designation: designation || null,
      p_temporary_password: temporaryPassword,
    });

    if (rpcErr) {
      return res.status(400).json({ success: false, error: rpcErr.message });
    }

    return res.status(200).json(rpcRes);
  } catch (rpcEx: any) {
    return res.status(500).json({ success: false, error: rpcEx.message || 'Server error creating employee account.' });
  }
}
