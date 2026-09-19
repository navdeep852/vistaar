// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code runs on Supabase Edge Functions (Deno runtime).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateEmployeeRequest {
  workspaceId: string;
  name: string;
  email: string;
  phone?: string;
  role?: string;
  department?: string;
  designation?: string;
  tempPassword?: string;
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

    // 2. Validate Authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Client for verifying caller
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

    // Admin Client with Service Role privileges
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    // 3. Parse and validate body
    const body: CreateEmployeeRequest = await req.json();
    const { workspaceId, name, email, phone, role, department, designation } = body;
    const tempPassword = body.tempPassword || 'TempPass@2026';

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required field: workspaceId.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Employee name is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: 'A valid email address is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Phone validation (Indian 10-digit)
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

    // 4. Verify caller permissions (must be owner or admin of target workspace)
    const { data: callerProfile, error: callerProfErr } = await supabaseAdmin
      .from('profiles')
      .select('role, workspace_id')
      .eq('id', callerUser.id)
      .single();

    if (callerProfErr || !callerProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Caller profile could not be verified.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (callerProfile.workspace_id !== workspaceId || !['owner', 'admin'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden: Only owners and administrators may create employee accounts.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Check for duplicate email in existing profiles
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'An account with this email address already exists.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Generate next sequential Employee ID for this workspace
    let nextEmployeeId: string;
    const { data: rpcEmpId, error: rpcErr } = await supabaseAdmin
      .rpc('generate_next_employee_id', { p_workspace_id: workspaceId });

    if (!rpcErr && rpcEmpId) {
      nextEmployeeId = rpcEmpId;
    } else {
      // Fallback query if RPC cache is refreshing
      const { data: profilesList } = await supabaseAdmin
        .from('profiles')
        .select('employee_id')
        .eq('workspace_id', workspaceId);

      let maxNum = 0;
      (profilesList || []).forEach((p: { employee_id?: string }) => {
        const match = (p.employee_id || '').match(/^VST-(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxNum) maxNum = n;
        }
      });
      nextEmployeeId = `VST-${String(maxNum + 1).padStart(5, '0')}`;
    }

    // 7. Create Supabase Auth User via Admin API
    const assignedRole = (role && ['employee', 'manager', 'admin', 'staff'].includes(role)) ? role : 'employee';

    const { data: authCreated, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        workspace_id: workspaceId,
        name: name.trim(),
        phone: cleanPhone,
        department: (department || '').trim(),
        designation: (designation || '').trim(),
        role: assignedRole,
        employee_id: nextEmployeeId,
        must_change_password: true,
      },
    });

    if (createErr) {
      console.error('[CreateEmployee] Admin createUser error:', createErr);
      let clientMsg = 'Failed to create employee authentication account.';
      if (createErr.message?.includes('already registered') || createErr.message?.includes('email_exists')) {
        clientMsg = 'An account with this email address already exists in the system.';
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

    // 8. Ensure Profile Record exists with correct Auth UUID
    // Trigger on_auth_user_created handles this, but we explicitly confirm or provision to guarantee consistency
    try {
      const { error: upsertErr } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: newAuthUser.id,
          workspace_id: workspaceId,
          employee_id: nextEmployeeId,
          name: name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          department: (department || '').trim(),
          designation: (designation || '').trim(),
          role: assignedRole,
          status: 'Active',
          must_change_password: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (upsertErr) {
        console.error('[CreateEmployee] Profile upsert error, rolling back Auth user:', upsertErr);
        // Rollback created auth user to avoid orphan record
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

    // 9. Success Response
    return new Response(
      JSON.stringify({
        success: true,
        empId: nextEmployeeId,
        tempPass: tempPassword,
        user: {
          id: newAuthUser.id,
          email: cleanEmail,
          name: name.trim(),
          role: assignedRole,
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
