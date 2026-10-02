import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { serverStore } from './serverStore.ts';
import { startScheduler, processDueFollowUps, processSingleFollowUp } from './scheduler.ts';

export function followUpSchedulerPlugin(): Plugin {
  return {
    name: 'follow-up-scheduler-plugin',
    configResolved(config) {
      // Load environment variables from .env and .env.local on server initialization
      const env = loadEnv(config.mode, config.root, '');
      Object.assign(process.env, env);
      if (process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.log('[Follow-up Plugin] Environment loaded: WhatsApp credentials detected.');
      }
    },
    configureServer(server) {
      // Start the automated 1-minute background scheduler loop on server start
      startScheduler(60000);

      // Register API endpoints on Vite dev server middleware
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        // 1. POST /api/follow-ups/process
        if (req.url === '/api/follow-ups/process' && req.method === 'POST') {
          try {
            const result = processDueFollowUps();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, ...result }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: false, error: err.message }));
          }
        }

        // 2. POST /api/follow-ups/test-action
        if (req.url === '/api/follow-ups/test-action' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { followUpId } = JSON.parse(body || '{}');
              if (!followUpId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'followUpId is required' }));
              }

              console.log(`[API Test Action] Explicit test trigger received for follow-up ${followUpId}`);
              const testRes = processSingleFollowUp(followUpId);

              // Get fresh server store state
              const updatedStore = serverStore.getData();
              const updatedFollowUp = updatedStore.followUps.find((f) => f.id === followUpId);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(
                JSON.stringify({
                  success: testRes.success,
                  status: testRes.status,
                  errorMessage: testRes.error,
                  logs: testRes.logs,
                  followUp: updatedFollowUp,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 3. GET /api/sync
        if (req.url === '/api/sync' && req.method === 'GET') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(serverStore.getData()));
        }

        // 4. POST /api/sync
        if (req.url === '/api/sync' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const { followUps, notifications } = JSON.parse(body || '{}');
              const updated = serverStore.syncFromClient(followUps, notifications);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(updated));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 5. POST /api/create-employee & POST /functions/v1/create-employee
        if (
          (req.url === '/api/create-employee' || req.url?.startsWith('/functions/v1/create-employee')) &&
          req.method === 'POST'
        ) {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const {
                action = 'create',
                name,
                email,
                phone,
                department,
                designation,
                employeeId,
                employee_id,
                p_employee_id,
              } = JSON.parse(body || '{}');
              const searchEmpId = employeeId || employee_id || p_employee_id;

              const authHeader = req.headers['authorization'];
              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
              const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

              const { createClient } = await import('@supabase/supabase-js');

              // 1. Verify Caller via Auth Header if present
              let callerProfile: any = null;
              if (authHeader) {
                const supabaseUser = createClient(supabaseUrl, publishableKey, {
                  global: { headers: { Authorization: authHeader } },
                  auth: { persistSession: false },
                });
                const { data: { user: callerUser } } = await supabaseUser.auth.getUser();
                if (callerUser) {
                  // Verify profile
                  const clientForProf = serviceRoleKey
                    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
                    : supabaseUser;

                  const { data: prof } = await clientForProf
                    .from('profiles')
                    .select('id, role, status, workspace_id')
                    .eq('id', callerUser.id)
                    .single();

                  callerProfile = prof;
                }
              }

              // Owner authorization enforcement:
              // Only Owner can create login accounts. Normal employees are forbidden.
              if (callerProfile) {
                if (callerProfile.role !== 'owner' || callerProfile.status !== 'Active') {
                  res.statusCode = 403;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(
                    JSON.stringify({
                      success: false,
                      error: 'Only the workspace owner can create VISTAAR login accounts.',
                    })
                  );
                }
              }

              const targetWorkspaceId = callerProfile?.workspace_id || '00000000-0000-4000-a000-000000000001';

              // Helper for secure temporary password generation
              const generateSecureTempPass = () => {
                const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
                const lower = 'abcdefghijkmnpqrstuvwxyz';
                const digits = '23456789';
                const symbols = '!@#$%&*_-+=';
                const all = upper + lower + digits + symbols;
                const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
                const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
                for (let i = 4; i < 14; i++) chars.push(pick(all));
                for (let i = chars.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [chars[i], chars[j]] = [chars[j], chars[i]];
                }
                return chars.join('');
              };

              // Admin client for backend operations if key is configured
              const supabaseAdmin = serviceRoleKey
                ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
                : null;

              // =============================================================
              // ACTION: REPAIR / RE-ISSUE CREDENTIALS FOR EXISTING EMPLOYEE
              // =============================================================
              if (action === 'repair') {
                const cleanEmail = (email || '').trim().toLowerCase();
                const cleanId = (searchEmpId || '').trim();

                const tempPass = generateSecureTempPass();

                if (supabaseAdmin) {
                  let q = supabaseAdmin.from('profiles').select('*').eq('workspace_id', targetWorkspaceId);
                  if (cleanId) q = q.eq('employee_id', cleanId);
                  else if (cleanEmail) q = q.eq('email', cleanEmail);

                  const { data: profData } = await q.maybeSingle();
                  if (!profData) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: false, error: 'Employee profile not found.' }));
                  }

                  let authUserId = profData.id;
                  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
                  const authUser = (listData?.users || []).find(
                    (u: any) => (u.email || '').toLowerCase() === profData.email.toLowerCase()
                  );

                  if (authUser) {
                    authUserId = authUser.id;
                    await supabaseAdmin.auth.admin.updateUserById(authUserId, {
                      password: tempPass,
                      user_metadata: {
                        ...authUser.user_metadata,
                        must_change_password: true,
                        employee_id: profData.employee_id,
                        workspace_id: targetWorkspaceId,
                        role: 'employee',
                      },
                    });
                  } else {
                    const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                      email: profData.email,
                      password: tempPass,
                      email_confirm: true,
                      user_metadata: {
                        account_type: 'employee',
                        workspace_id: targetWorkspaceId,
                        name: profData.name,
                        phone: profData.phone || '',
                        department: profData.department || '',
                        designation: profData.designation || '',
                        role: 'employee',
                        employee_id: profData.employee_id,
                        must_change_password: true,
                      },
                    });
                    if (createErr || !newAuth?.user) {
                      res.statusCode = 500;
                      res.setHeader('Content-Type', 'application/json');
                      return res.end(JSON.stringify({ success: false, error: createErr?.message || 'Failed to create Auth account' }));
                    }
                    authUserId = newAuth.user.id;
                  }

                  await supabaseAdmin.from('profiles').upsert({
                    ...profData,
                    id: authUserId,
                    status: 'Active',
                    must_change_password: true,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'id' });

                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(
                    JSON.stringify({
                      success: true,
                      empId: profData.employee_id,
                      tempPass,
                      name: profData.name,
                      user: {
                        id: authUserId,
                        email: profData.email,
                        name: profData.name,
                        role: 'employee',
                      },
                    })
                  );
                }
              }

              // =============================================================
              // ACTION: CREATE NEW EMPLOYEE ACCOUNT
              // =============================================================
              if (!name || !name.trim()) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'Employee name is required.' }));
              }

              const cleanEmail = (email || '').trim().toLowerCase();
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!cleanEmail || !emailRegex.test(cleanEmail)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: false, error: 'A valid email address is required.' }));
              }

              let cleanPhone = (phone || '').replace(/\D/g, '');
              if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) cleanPhone = cleanPhone.slice(2);
              if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);

              // Resolve Employee ID (Custom or Auto-generated in VST-EMP-XXX format)
              let nextEmployeeId: string;
              if (supabaseAdmin) {
                const { data: dupProf } = await supabaseAdmin
                  .from('profiles')
                  .select('id')
                  .eq('email', cleanEmail)
                  .maybeSingle();

                if (dupProf) {
                  res.statusCode = 409;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(
                    JSON.stringify({ success: false, error: 'An account with this email address already exists.' })
                  );
                }

                const rawProvidedId = String(searchEmpId || '');
              if (rawProvidedId.trim()) {
                if (rawProvidedId.startsWith(' ') || rawProvidedId.endsWith(' ') || rawProvidedId.startsWith('\t') || rawProvidedId.endsWith('\t')) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: 'Employee ID cannot have leading or trailing whitespace.' }));
                }
                const trimmed = rawProvidedId.trim();
                if (trimmed.length < 3 || trimmed.length > 30) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: 'Employee ID must be between 3 and 30 characters.' }));
                }
                if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: 'Only letters, numbers, hyphens (-), and underscores (_) are allowed.' }));
                }
                if (/^[-_]+$/.test(trimmed)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: 'Employee ID cannot consist only of hyphens or underscores.' }));
                }
                const customId = trimmed.toUpperCase();
                if (supabaseAdmin) {
                  const { data: dupEmp } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('workspace_id', targetWorkspaceId)
                    .ilike('employee_id', customId)
                    .maybeSingle();
                  if (dupEmp) {
                    res.statusCode = 409;
                    res.setHeader('Content-Type', 'application/json');
                    return res.end(JSON.stringify({ success: false, error: `Employee ID ${customId} already exists in this business. Please choose another ID.` }));
                  }
                }
                nextEmployeeId = customId;
              } else {
                const { data: rpcEmpId } = await supabaseAdmin.rpc('generate_next_employee_id', {
                  p_workspace_id: targetWorkspaceId,
                });

                if (rpcEmpId && typeof rpcEmpId === 'string' && /^VST-EMP-\d+$/i.test(rpcEmpId)) {
                  nextEmployeeId = rpcEmpId;
                } else {
                  const { data: profs } = await supabaseAdmin
                    .from('profiles')
                    .select('employee_id')
                    .eq('workspace_id', targetWorkspaceId);

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
              }

              const tempPassword = generateSecureTempPass();

                // Create Supabase Auth user via Admin API
                const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                  email: cleanEmail,
                  password: tempPassword,
                  email_confirm: true,
                  user_metadata: {
                    account_type: 'employee',
                    workspace_id: targetWorkspaceId,
                    name: name.trim(),
                    phone: cleanPhone,
                    role: 'employee',
                    department: department || '',
                    designation: designation || '',
                    employee_id: nextEmployeeId,
                    must_change_password: true,
                  },
                });

                if (authErr) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  const msg = authErr.message?.includes('already registered') || authErr.message?.includes('email_exists')
                    ? 'An account with this email address already exists.'
                    : authErr.message;
                  return res.end(JSON.stringify({ success: false, error: msg }));
                }

                const newAuthUser = authCreated.user;
                if (!newAuthUser) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify({ success: false, error: 'Authentication service did not return a user record.' }));
                }

                // Upsert Profile linked to Auth User UUID
                const { error: profErr } = await supabaseAdmin.from('profiles').upsert(
                  {
                    id: newAuthUser.id,
                    workspace_id: targetWorkspaceId,
                    employee_id: nextEmployeeId,
                    name: name.trim(),
                    email: cleanEmail,
                    phone: cleanPhone,
                    role: 'employee',
                    department: (department || '').trim() || null,
                    designation: (designation || '').trim() || null,
                    status: 'Active',
                    must_change_password: true,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'id' }
                );

                if (profErr) {
                  // Rollback auth user
                  await supabaseAdmin.auth.admin.deleteUser(newAuthUser.id);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(
                    JSON.stringify({ success: false, error: 'Failed to create employee profile record. Action was rolled back.' })
                  );
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    success: true,
                    empId: nextEmployeeId,
                    tempPass: tempPassword,
                    name: name.trim(),
                    user: {
                      id: newAuthUser.id,
                      email: cleanEmail,
                      name: name.trim(),
                      role: 'employee',
                    },
                  })
                );
              }

              // If serviceRoleKey is not configured in local dev, provide informative error
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(
                JSON.stringify({
                  success: false,
                  error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not configured on the server to provision Supabase Auth accounts.',
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: false, error: err.message || 'Internal error' }));
            }
          });
          return;
        }

        // 6. POST /api/resolve-employee-id
        if (req.url === '/api/resolve-employee-id' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { employeeId, workspaceId } = JSON.parse(body || '{}');
              const cleanId = (employeeId || '').trim();
              if (!cleanId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ found: false, error: 'employeeId is required' }));
              }

              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
              const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

              const { createClient } = await import('@supabase/supabase-js');
              const client = createClient(supabaseUrl, serviceRoleKey || publishableKey, { auth: { persistSession: false } });

              let q = client
                .from('profiles')
                .select('id, email, status, workspace_id, role, employee_id')
                .ilike('employee_id', cleanId);

              if (workspaceId) {
                q = q.eq('workspace_id', workspaceId);
              }

              const { data: profs } = await q;

              if (!profs || profs.length === 0) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ found: false, reason: 'EMPLOYEE_ID_NOT_FOUND' }));
              }

              // If multiple found across tenants without explicit workspace
              if (profs.length > 1 && !workspaceId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ found: false, reason: 'AMBIGUOUS_TENANT_MATCH' }));
              }

              const profile = profs[0];
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(
                JSON.stringify({
                  found: true,
                  id: profile.id,
                  email: profile.email,
                  status: profile.status,
                  role: profile.role,
                  workspaceId: profile.workspace_id,
                  employeeId: profile.employee_id,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ found: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}
