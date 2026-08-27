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

        next();
      });
    },
  };
}
