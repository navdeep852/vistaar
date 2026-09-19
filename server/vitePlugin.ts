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

        // 5. POST /api/create-employee
        if (req.url === '/api/create-employee' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const {
                workspaceId,
                name,
                email,
                phone,
                role,
                department,
                designation,
                tempPassword = 'TempPass@2026',
              } = JSON.parse(body || '{}');

              if (!workspaceId || !name || !email) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({ success: false, error: 'workspaceId, name, and email are required.' })
                );
              }

              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';

              if (serviceRoleKey && serviceRoleKey.trim()) {
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
                  auth: { persistSession: false },
                });

                // Generate next sequential employee ID
                let nextEmployeeId = `VST-${String(Date.now()).slice(-5)}`;
                const { data: rpcEmpId } = await supabaseAdmin.rpc('generate_next_employee_id', {
                  p_workspace_id: workspaceId,
                });
                if (rpcEmpId) {
                  nextEmployeeId = rpcEmpId;
                }

                // Create Auth user
                const { data: authCreated, error: authErr } = await supabaseAdmin.auth.admin.createUser({
                  email: email.trim().toLowerCase(),
                  password: tempPassword,
                  email_confirm: true,
                  user_metadata: {
                    workspace_id: workspaceId,
                    name: name.trim(),
                    phone: phone || '',
                    role: role || 'employee',
                    department: department || '',
                    designation: designation || '',
                    employee_id: nextEmployeeId,
                    must_change_password: true,
                  },
                });

                if (authErr) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  const msg = authErr.message?.includes('already registered')
                    ? 'An account with this email address already exists in the system.'
                    : authErr.message;
                  return res.end(JSON.stringify({ success: false, error: msg }));
                }

                // Upsert Profile
                const userId = authCreated.user?.id;
                if (userId) {
                  await supabaseAdmin.from('profiles').upsert(
                    {
                      id: userId,
                      workspace_id: workspaceId,
                      employee_id: nextEmployeeId,
                      name: name.trim(),
                      email: email.trim().toLowerCase(),
                      phone: phone || '',
                      role: role || 'employee',
                      department: department || '',
                      designation: designation || '',
                      status: 'Active',
                      must_change_password: true,
                    },
                    { onConflict: 'id' }
                  );
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(
                  JSON.stringify({
                    success: true,
                    empId: nextEmployeeId,
                    tempPass: tempPassword,
                    userId,
                  })
                );
              }

              // Fallback for dev environment without service role key
              const seqEmpId = `VST-0000${Math.floor(2 + Math.random() * 8)}`;
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(
                JSON.stringify({
                  success: true,
                  empId: seqEmpId,
                  tempPass: tempPassword,
                  userId: `dev-${Date.now()}`,
                  isLocalDevMock: true,
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

        next();
      });
    },
  };
}
