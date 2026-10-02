// VISTAAR Business OS — Supabase Edge Function: create-employee
// Secure server-side provisioning of employee login accounts
// Runs on Supabase Edge Runtime (Deno).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateEmployeeRequest {
  action?: 'create' | 'repair';
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  employeeId?: string; // used for custom ID or repair
  employee_id?: string;
}

/**
 * Generates a cryptographically secure temporary password.
 * Satisfies the VISTAAR password policy:
 * - Minimum 14 characters (> 12)
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 symbol
 */
function generateSecureTemporaryPassword(length = 14): string {
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
  const isValid =
    generated.length >= 12 &&
    /[A-Z]/.test(generated) &&
    /[a-z]/.test(generated) &&
    /[0-9]/.test(generated) &&
    /[^A-Za-z0-9]/.test(generated);

  return isValid ? generated : generateSecureTemporaryPassword(length);
}

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('[CreateEmployee] Missing server environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error: Service role key is not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate Authorization Header & Caller Identity
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user: callerUser }, error: callerAuthErr } = await supabaseUser.auth.getUser();
    if (callerAuthErr || !callerUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid authentication session.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin Client with Service Role privileges (server-side only)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. OWNER AUTHORIZATION: Caller must be an Active Owner
    const { data: callerProfile, error: callerProfErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status, workspace_id')
      .eq('id', callerUser.id)
      .single();

    if (callerProfErr || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Caller profile could not be verified.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (callerProfile.role !== 'owner' || callerProfile.status !== 'Active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only the workspace owner can create VISTAAR login accounts.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authoritative Workspace derived strictly from caller's owner profile
    const ownerWorkspaceId = callerProfile.workspace_id;
    if (!ownerWorkspaceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Owner workspace could not be identified.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse Request Body
    const body: CreateEmployeeRequest = await req.json().catch(() => ({}));
    const action = body.action || 'create';

    // =========================================================================
    // ACTION: REPAIR / RE-ISSUE CREDENTIALS FOR EXISTING BROKEN EMPLOYEE PROFILE
    // =========================================================================
    if (action === 'repair') {
      const searchEmpId = (body.employeeId || '').trim();
      const searchEmail = (body.email || '').trim().toLowerCase();

      if (!searchEmpId && !searchEmail) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee ID or email is required for account repair.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let profileQuery = supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('workspace_id', ownerWorkspaceId);

      if (searchEmpId) {
        profileQuery = profileQuery.eq('employee_id', searchEmpId);
      } else {
        profileQuery = profileQuery.eq('email', searchEmail);
      }

      const { data: targetProfile, error: targetErr } = await profileQuery.maybeSingle();
      if (targetErr || !targetProfile) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee profile not found in your workspace.' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const repairPassword = generateSecureTemporaryPassword();
      const targetEmail = targetProfile.email;

      // Check if Auth user exists for this email
      let existingAuthUser: any = null;
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        existingAuthUser = (listData?.users || []).find(
          (u: any) => (u.email || '').toLowerCase() === targetEmail.toLowerCase()
        );
      } catch (listErr) {
        console.warn('[RepairEmployee] listUsers notice:', listErr);
      }

      let targetAuthId = targetProfile.id;

      if (existingAuthUser) {
        targetAuthId = existingAuthUser.id;
        // Update password for existing Auth account
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(targetAuthId, {
          password: repairPassword,
          user_metadata: {
            ...existingAuthUser.user_metadata,
            account_type: 'employee',
            workspace_id: ownerWorkspaceId,
            employee_id: targetProfile.employee_id,
            role: 'employee',
            must_change_password: true,
          },
        });
        if (updateAuthErr) {
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to update employee authentication credentials.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        // Create new Auth account
        const { data: newAuthData, error: newAuthErr } = await supabaseAdmin.auth.admin.createUser({
          email: targetEmail,
          password: repairPassword,
          email_confirm: true,
          user_metadata: {
            account_type: 'employee',
            workspace_id: ownerWorkspaceId,
            name: targetProfile.name,
            phone: targetProfile.phone || '',
            department: targetProfile.department || '',
            designation: targetProfile.designation || '',
            role: 'employee',
            employee_id: targetProfile.employee_id,
            must_change_password: true,
          },
        });

        if (newAuthErr || !newAuthData?.user) {
          return new Response(
            JSON.stringify({ success: false, error: newAuthErr?.message || 'Failed to provision missing auth account.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        targetAuthId = newAuthData.user.id;
      }

      // Ensure profile ID matches Auth user UUID & flags must_change_password = true
      await supabaseAdmin.from('profiles').upsert({
        ...targetProfile,
        id: targetAuthId,
        must_change_password: true,
        status: 'Active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      return new Response(
        JSON.stringify({
          success: true,
          empId: targetProfile.employee_id,
          tempPass: repairPassword,
          name: targetProfile.name,
          user: {
            id: targetAuthId,
            email: targetEmail,
            name: targetProfile.name,
            role: 'employee',
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION: CREATE NEW EMPLOYEE ACCOUNT
    // =========================================================================
    const { name, email, phone, department, designation } = body;

    // Validate name
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee name is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: 'A valid email address is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone (Indian 10-digit)
    let cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      cleanPhone = cleanPhone.slice(2);
    }
    if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.slice(1);
    }
    if (cleanPhone && (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone))) {
      return new Response(
        JSON.stringify({ success: false, error: 'Phone number must be a valid 10-digit Indian mobile number.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate email in existing profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, workspace_id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'An account with this email address already exists.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve Employee ID (Custom or Auto-generated in VST-EMP-XXX format)
    let nextEmployeeId: string;
    const rawProvidedId = String(body.employeeId || body.employee_id || '');
    if (rawProvidedId.trim()) {
      if (rawProvidedId.startsWith(' ') || rawProvidedId.endsWith(' ') || rawProvidedId.startsWith('\t') || rawProvidedId.endsWith('\t')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee ID cannot have leading or trailing whitespace.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const trimmed = rawProvidedId.trim();
      if (trimmed.length < 3 || trimmed.length > 30) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee ID must be between 3 and 30 characters.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Only letters, numbers, hyphens (-), and underscores (_) are allowed.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (/^[-_]+$/.test(trimmed)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Employee ID cannot consist only of hyphens or underscores.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const customId = trimmed.toUpperCase();
      const { data: dupEmp } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('workspace_id', ownerWorkspaceId)
        .ilike('employee_id', customId)
        .maybeSingle();

      if (dupEmp) {
        return new Response(
          JSON.stringify({ success: false, error: `Employee ID ${customId} already exists in this business. Please choose another ID.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      nextEmployeeId = customId;
    } else {
      // Generate unique sequential Employee ID for this workspace (VST-EMP-001 format)
      const { data: rpcEmpId, error: rpcErr } = await supabaseAdmin
        .rpc('generate_next_employee_id', { p_workspace_id: ownerWorkspaceId });

      if (!rpcErr && rpcEmpId && typeof rpcEmpId === 'string' && /^VST-EMP-\d+$/i.test(rpcEmpId)) {
        nextEmployeeId = rpcEmpId;
      } else {
        // Deterministic query across both VST-EMP-XXX and VST-XXXXX patterns
        const { data: profilesList } = await supabaseAdmin
          .from('profiles')
          .select('employee_id')
          .eq('workspace_id', ownerWorkspaceId);

        let maxNum = 0;
        (profilesList || []).forEach((p: { employee_id?: string }) => {
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
    }

    // Generate cryptographically secure temporary password (never hardcoded)
    const temporaryPassword = generateSecureTemporaryPassword();

    // Create Supabase Auth User via Admin API
    const { data: authCreated, error: createErr } = await supabaseAdmin.auth.admin.createUser({
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

    if (createErr) {
      console.error('[CreateEmployee] Admin createUser error:', createErr);
      let clientMsg = 'Failed to create employee authentication account.';
      if (createErr.message?.includes('already registered') || createErr.message?.includes('email_exists')) {
        clientMsg = 'An account with this email address already exists.';
      }
      return new Response(
        JSON.stringify({ success: false, error: clientMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newAuthUser = authCreated.user;
    if (!newAuthUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication service did not return a user record.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomic Profile Creation (id = newAuthUser.id)
    try {
      const { error: upsertErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
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

      if (upsertErr) {
        console.error('[CreateEmployee] Profile upsert error, rolling back Auth user:', upsertErr);
        // Rollback Auth user to avoid orphan account
        await supabaseAdmin.auth.admin.deleteUser(newAuthUser.id);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create employee profile record. Action was rolled back.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (profileEx) {
      console.error('[CreateEmployee] Exception in profile creation, rolling back Auth user:', profileEx);
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error occurred during employee profile provisioning.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success response: return Employee ID + exact temporary password once
    return new Response(
      JSON.stringify({
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
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[CreateEmployee] Uncaught exception:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected internal error occurred while creating employee.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
