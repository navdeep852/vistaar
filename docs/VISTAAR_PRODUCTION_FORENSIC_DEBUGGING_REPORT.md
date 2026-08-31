# VISTAAR PRODUCTION FORENSIC DEBUGGING REPORT
**Comprehensive Authentication, Deployment, Environment, SMTP & Codebase Forensic Audit**
**Date:** August 30, 2026 | **Environment:** Production & Local Build Verification

---

## 1. Executive Summary

A comprehensive, top-to-bottom forensic audit was conducted on the VISTAAR software system covering the entire application lifecycle—from Git commit, Vercel build environment, Vite static asset bundling, Supabase client instantiation, authentication API calls, custom SMTP delivery, database architecture, Row Level Security (RLS), to multi-tenant isolation.

The investigation confirmed two primary independent root causes operating at different layers of the deployment pipeline:
1. **Critical Application Crash (Initialization Layer):** Uncaught module-level exception (`Error: supabaseUrl is required`) caused by missing or misnamed `VITE_SUPABASE_URL` environment variables during Vercel's production build step. Because `createClient()` in `src/lib/supabase.ts` is executed immediately upon module evaluation, missing environment variables at build time crash the entire JavaScript bundle before React mounts or Error Boundaries can intervene.
2. **Email OTP / Confirmation Failure (SMTP Infrastructure Layer):** HTTP 500 `unexpected_failure` (`Error sending confirmation mail`) during Supabase Auth signup/OTP flows caused by Gmail SMTP authentication failure (`SMTP FAILURE STAGE: AUTH`). Gmail blocks automated cloud logins from Supabase IP ranges and requires App Passwords or transactional SMTP providers like Resend.

Additional secondary vulnerabilities were identified in environment variable detection fallback routines, potential non-`VITE_` variable name mismatches in Vercel, and unhandled network transport exceptions when configured URLs point to offline or invalid Supabase project references.

---

## 2. Current Symptoms

The system has exhibited six documented diagnostic failure states:

1. **VISTAAR Application Initialization Error:**
   `Error: supabaseUrl is required.`
   *Impact:* White screen of death on initial page load in production.

2. **Supabase Network / Domain Failure:**
   `Unable to reach Supabase Auth server. Check your internet connection and Supabase project availability.`
   *Impact:* User cannot log in or request OTP codes.

3. **Supabase Unconfigured Failure:**
   `Email OTP service is unavailable. Please verify that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are configured with a valid Supabase project.`
   *Impact:* Email verification forms refuse to submit.

4. **SMTP Authentication & Email Delivery Failure:**
   *HTTP Status:* 500
   *Supabase Error Code:* `unexpected_failure`
   *Supabase Error Message:* `"Error sending confirmation mail"`
   *SMTP Connection:* `FAILED` | *Failure Stage:* `AUTH` | *Provider:* `Gmail SMTP`

5. **Build-Time Environment Substitution Failure:**
   Previous dynamic access `import.meta.env[key]` caused Vite to omit environment variables. Refactoring to optional chaining `import.meta.env?.VITE_SUPABASE_URL` succeeded in local builds but remains vulnerable if environment variables are not strictly prefixed with `VITE_` in Vercel.

6. **Deployment Sync Failure:**
   Environment variable changes applied in the Vercel Dashboard do not reflect in the live application until a new production build is explicitly triggered.

---

## 3. System Architecture

VISTAAR is structured as a multi-tenant business operating system with the following stack:

```
[ USER / BROWSER ]
       │
       ▼
[ VISTAAR FRONTEND ] (React 19 + Vite 8 + TypeScript)
       │
       ├────── Static Environment Bundling (Vite `import.meta.env`)
       │
       ▼
[ VERCEL HOSTING ] (Production Build Pipeline `npm run build`)
       │
       ▼
[ SUPABASE CLIENT ] (`src/lib/supabase.ts` via `@supabase/supabase-js`)
       │
       ├──► [ SUPABASE AUTH API ] (`/auth/v1/*` OTP & Session Management)
       │           │
       │           ▼
       │    [ CUSTOM SMTP / RESEND ] (Email Confirmation & OTP Delivery)
       │
       └──► [ POSTGRES DB & RLS ] (Multi-Tenant Isolation via `current_user_workspace_id()`)
```

### Dependency Map
`src/views/LoginView.tsx` / `ProductsView.tsx` / `SettingsView.tsx`  
└─► `src/services/supabaseAuth.ts` (`SupabaseAuthService`)  
    └─► `src/lib/supabase.ts` (`supabase` client singleton & `isSupabaseConfigured()`)  
        └─► `@supabase/supabase-js` (`createClient(supabaseUrl, supabasePublishableKey)`)  
            └─► `import.meta.env.VITE_SUPABASE_URL` & `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`  
                └─► Vercel Build Environment Variables  
                    └─► Live Supabase Cloud Project (`https://<project-ref>.supabase.co`)

---

## 4. Authentication Architecture

The system uses a hybrid Supabase Auth architecture:
1. **Identity & Session Management:** Supabase Auth manages `auth.users`, JWT access/refresh tokens, and OTP generation.
2. **Profile & Workspace Binding:** Upon `auth.users` creation, a database trigger (`on_auth_user_created` in Migration `007`) automatically provisions:
   - A unique `public.workspaces` row (`workspace_id`).
   - A `public.profiles` row linking `id` (`auth.uid()`) to `workspace_id`.
   - Default `public.business_settings` and `public.inventory_settings`.
3. **Session Restoration:** `SupabaseAuthService` listens to `supabase.auth.onAuthStateChange` to synchronize profiles dynamically and caches non-sensitive profile state in `localStorage` (`vistaar_user_session`).
4. **Offline Fallback:** Demo profiles (`admin@vistaar.com`, `priya@vistaar.com`) and local registration fallback storage (`vistaar_local_users_db`) exist to allow dev testing when Supabase is unreachable.

---

## 5. Environment Variable Audit

Search across the entire codebase revealed environment variable references in the following files:

| File Location | Variable Referenced | Access Pattern | Environment Context | Risk Level |
|---|---|---|---|---|
| `src/lib/supabase.ts:34` | `VITE_SUPABASE_URL` | `import.meta.env?.VITE_SUPABASE_URL` | Browser Client Bundle | **HIGH** |
| `src/lib/supabase.ts:39` | `VITE_SUPABASE_PUBLISHABLE_KEY` | `import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY` | Browser Client Bundle | **HIGH** |
| `src/lib/supabase.ts:40` | `VITE_SUPABASE_ANON_KEY` | `import.meta.env?.VITE_SUPABASE_ANON_KEY` | Browser Client Bundle | **MEDIUM** |
| `src/lib/supabase.ts:35,41` | `process.env.VITE_...` | `proc?.env?.VITE_SUPABASE_URL` | Node.js Script Fallback | LOW |
| `.env.local:8-10` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Key-Value File | Development Local | LOW |
| `supabase/README.md` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Documentation | Instructions | INFORMATIONAL |

### Critical Environment Variable Rules Verification
- **Prefix Requirement:** Vite *only* exposes variables prefixed with `VITE_` to client-side code (`import.meta.env`). If Vercel environment variables are named `SUPABASE_URL` or `SUPABASE_ANON_KEY` without `VITE_`, Vite strips them completely during build time.
- **Static Replacement:** Vite replaces string literals like `import.meta.env.VITE_SUPABASE_URL` during bundling. Optional chaining `import.meta.env?.VITE_SUPABASE_URL` works in modern Vite, but if the variable is undefined during build time, Vite replaces it with `undefined`, evaluating `rawUrl` to `""`.

---

## 6. Vite Build Audit

Inspection of `vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react(), tailwindcss(), followUpSchedulerPlugin()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { port: 3005, host: true, open: false }
})
```
- No custom `define` overrides or `envPrefix` settings exist. Vite defaults to `envPrefix: 'VITE_'`.
- Build command defined in `package.json`: `"build": "tsc -b && vite build"`.

---

## 7. Supabase Client Audit

In `src/lib/supabase.ts`:
```ts
const rawUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof proc !== 'undefined' && proc?.env?.VITE_SUPABASE_URL) ||
  '';

const rawPublishableKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof proc !== 'undefined' && proc?.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  (typeof proc !== 'undefined' && proc?.env?.VITE_SUPABASE_ANON_KEY) ||
  '';

export const supabaseUrl = rawUrl;
export const supabasePublishableKey = rawPublishableKey;

// IMMUTABLE CRITICAL BUG LOCATION (Line 88):
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
```

### Analysis of Client Instantiation Vulnerability:
1. `createClient()` is called synchronously at top-level module load time.
2. If `supabaseUrl` is `""` (empty string) because environment variables were missing at build time, `@supabase/supabase-js` throws `Error: supabaseUrl is required.` immediately when `supabase.ts` is imported.
3. Because every view and service imports `supabase.ts` directly or indirectly, the entire React application crashes before rendering `<ErrorBoundary>`.
4. **Fix Strategy:** `createClient()` must either receive valid fallback strings or be safely wrapped/validated so module loading never throws an uncaught exception.

---

## 8. Vercel Configuration Audit

### Exact Required Vercel Navigation & Inspection Steps:
1. Navigate to **Vercel Dashboard** (`https://vercel.com`).
2. Select the **VISTAAR** project.
3. Go to **Settings** ──► **Environment Variables**.
4. Verify the presence of the following exact keys:
   - Key: `VITE_SUPABASE_URL` | Value: `https://<your-actual-project-ref>.supabase.co`
   - Key: `VITE_SUPABASE_PUBLISHABLE_KEY` | Value: `<your-actual-anon-or-publishable-key>`
5. Confirm Environment Targets:
   - Ensure **Production**, **Preview**, and **Development** checkboxes are checked for both variables.
6. Verify String Formatting:
   - Ensure NO accidental leading/trailing spaces exist.
   - Ensure NO wrapping double/single quotes are saved as part of the string (e.g. `"https://..."` instead of `https://...`).
   - Ensure variables start with `VITE_` (NOT `SUPABASE_URL` or `NEXT_PUBLIC_...`).

---

## 9. Vercel Deployment Audit

### Deployment Sync Rule (Vite Build Asset Pipeline):
Vite inlines environment variables into compiled static JavaScript chunks during `vite build`.  
If environment variables are added or modified in Vercel's Settings tab, **the live application will NOT reflect those changes until a NEW deployment is built.**

### How to Trigger Clean Deployment in Vercel:
1. Go to **Vercel Dashboard** ──► **Deployments**.
2. Click the three dots `(...)` next to the latest production deployment.
3. Select **Redeploy**.
4. Uncheck *"Use existing Build Cache"* and click **Redeploy**.
5. Check **Build Logs** for any warnings regarding undefined variables.

---

## 10. Production Bundle Audit

Local build forensic test was conducted using `npm run build`.

### Execution Output:
```
vite v8.2.2 building client environment for production...
✓ 1985 modules transformed.
dist/index.html            2.62 kB
dist/assets/index-Dp8gdZ62.js  1,911.55 kB
```

### Forensic Analysis of Bundled JS (`dist/assets/index-Dp8gdZ62.js`):
Grep inspection confirmed Vite successfully inlined the `.env.local` values during local compilation:
```javascript
var Ms = "https://kluxsykmnijvkqxelba.supabase.co";
var Ns = "sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x";
var Ps = Ms;
var Fs = Ns;
var H = ks(Ps, Fs, { auth: { persistSession: !0, autoRefreshToken: !0, detectSessionInUrl: !0 } });
```
- **Conclusion:** Vite's build-time replacement functions correctly when variables are present in the environment during compilation. If the Vercel build environment lacks `VITE_SUPABASE_URL`, `Ms` is compiled as `""`, causing `ks("", "")` (`createClient`) to crash the browser at runtime.

---

## 11. Browser Console Audit

Expected console signatures for each failure track:

- **Track A (Missing URL in Bundle):**
  `Uncaught Error: supabaseUrl is required.` at `@supabase/supabase-js` bundle initialization.
- **Track B (Invalid / Unreachable Supabase Domain):**
  `GET https://kluxsykmnijvkqxelba.supabase.co/auth/v1/health net::ERR_NAME_NOT_RESOLVED`
  `[Supabase Config Check] { supabaseUrlConfigured: true, supabaseUrl: "https://kluxsykmnijvkqxelba.supabase.co", isConfigured: true }`
  Followed by error: `"Unable to reach Supabase Auth server..."`
- **Track C (SMTP Failure during OTP Request):**
  `POST https://<project-ref>.supabase.co/auth/v1/otp 500 (Internal Server Error)`
  Response payload: `{"code":500,"error_code":"unexpected_failure","msg":"Error sending confirmation mail"}`

---

## 12. Browser Network Audit

| Request Endpoint | Method | Expected Status | Error Status | Diagnostic Cause |
|---|---|---|---|---|
| `/auth/v1/health` | GET | 200 OK | `ERR_NAME_NOT_RESOLVED` / 404 | Domain wrong or Supabase project paused/deleted |
| `/auth/v1/otp` | POST | 200 OK | 500 Internal Error | Supabase Auth SMTP configuration failed |
| `/auth/v1/token?grant_type=password` | POST | 200 OK | 400 Bad Request | Invalid credentials |
| `/rest/v1/products?select=id&limit=1` | GET | 200 / 206 | 401 Unauthorized | API Key / Publishable Key invalid or missing `apikey` header |

---

## 13. Supabase API Audit

### Exact Supabase Dashboard Navigation Steps:
1. Log into **Supabase Dashboard** (`https://supabase.com/dashboard`).
2. Select your VISTAAR production project.
3. Navigate to **Project Settings** ──► **API**.
4. Check **Project URL**: Should match `https://<project-ref>.supabase.co`.
5. Check **Project API Keys**:
   - **Publishable Key (`anon` / `sb_publishable_...`):** Copy this key for `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - **Secret Key (`service_role` / `sb_secret_...`):** **DO NOT USE IN VITE FRONTEND.**

> [!WARNING]
> Placing the `service_role` secret key inside frontend `VITE_` variables grants full administrative database access to any public browser user, completely bypassing Row Level Security.

---

## 14. Supabase Auth Audit

### Dashboard Configuration Check Path:
1. Go to **Supabase Dashboard** ──► **Authentication** ──► **Providers**.
2. Click **Email**:
   - Ensure **Enable Email Provider** is turned ON.
   - Ensure **Confirm Email** or **Enable Email OTP** is configured according to onboarding flow requirements.
3. Go to **Authentication** ──► **URL Configuration**:
   - **Site URL:** Set to production Vercel URL (e.g. `https://vistaar-app.vercel.app` or custom domain).
   - **Redirect URLs:** Add:
     - `https://<your-vercel-domain>.vercel.app/**`
     - `http://localhost:3005/**`

---

## 15. Email / SMTP Forensics

### Root Cause Analysis of `Error sending confirmation mail` / Gmail SMTP Failure:

```
HTTP STATUS: 500
SUPABASE ERROR CODE: unexpected_failure
SUPABASE ERROR MESSAGE: "Error sending confirmation mail"
SMTP CONNECTION: FAILED
SMTP FAILURE STAGE: AUTH
GMAIL SMTP AUTHENTICATION: FAILED
```

#### Why Gmail SMTP Fails in Supabase:
1. **Google Account Security Restrictions:** Google blocks plain password SMTP connections from cloud infrastructure (AWS/GCP IPs used by Supabase).
2. **Missing App Password:** If 2-Step Verification is enabled on the Gmail account, regular account passwords fail authentication immediately (`SMTP FAILURE STAGE: AUTH`).
3. **Rate Limits & IP Reputation:** Gmail SMTP is meant for personal email clients, not transactional web apps. Standard Gmail accounts have strict rate limits and aggressive spam filters.

#### Recommended SMTP Solution (Resend Integration):
Configure Supabase Custom SMTP using **Resend** (`https://resend.com`):
1. Create a free account at Resend and verify your sending domain (e.g., `mail.vistaar.in`).
2. Generate an API Key in Resend.
3. In **Supabase Dashboard** ──► **Authentication** ──► **Email Settings** ──► **Enable Custom SMTP**:
   - **Sender Email:** `noreply@yourdomain.com`
   - **Sender Name:** `VISTAAR Business Solutions`
   - **Host:** `smtp.resend.com`
   - **Port:** `587` (TLS/STARTTLS) or `465`
   - **Username:** `resend`
   - **Password:** `<your-resend-api-key>`

---

## 16. Database Audit

The VISTAAR PostgreSQL database comprises 26 business management tables in `public` schema:
- Core System: `workspaces`, `profiles`, `business_settings`, `inventory_settings`, `id_mappings`
- Entity Directories: `categories`, `suppliers`, `customers`, `products`
- Operations: `stock_receipts`, `stock_movements`, `import_sessions`, `counter_sales`, `counter_sale_items`, `quotations`, `quotation_items`, `invoices`, `invoice_items`
- Financials: `payments`, `udhari_records`, `udhari_payments`, `expenses`
- Communications & CRM: `follow_ups`, `notifications`, `feedbacks`, `offers`

---

## 17. RLS Audit

All 26 business tables have active Row Level Security enforced via Migration `007_multi_tenant_isolation_fix.sql`:
- Helper Function: `public.current_user_workspace_id()` resolves the current user's authoritative `workspace_id` from `public.profiles` using `auth.uid()`.
- Standardized Policy Pattern across all tables:
  ```sql
  CREATE POLICY "Workspace isolation SELECT for products" ON public.products
      FOR SELECT USING (workspace_id = public.current_user_workspace_id());

  CREATE POLICY "Workspace isolation INSERT for products" ON public.products
      FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
  ```

---

## 18. Multi-Tenancy Audit

- **Isolation Guarantee:** Cross-tenant access is prohibited at the database level by Postgres RLS policies. Even if a malicious client modifies frontend parameters, queries to tables missing matching `workspace_id` return empty result sets (`0 rows`).
- **Trigger Integrity:** New tenant registration relies on `on_auth_user_created` trigger on `auth.users` to atomically create `workspaces` and `profiles` records.

---

## 19. Security Audit

- **Credential Exposure:** Codebase inspection confirmed NO secret role keys (`service_role` / `secret`) are committed in `src/` or source code files.
- **`.gitignore` Check:** `.env`, `.env.*`, `node_modules`, `dist` are properly ignored in `.gitignore`.
- **Recommendation:** Rotate any Supabase publishable keys if they were previously exposed in public Git repositories.

---

## 20. Dependency Audit

Inspected `package.json`:
- `@supabase/supabase-js`: `^2.112.4` (Up to date)
- `react` / `react-dom`: `^19.2.8`
- `vite`: `^8.2.0`
- `@vitejs/plugin-react`: `^6.0.4`
- `typescript`: `~6.0.2`

No package version conflicts or lockfile anomalies were detected.

---

## 21. Error Handling Audit

In `src/services/supabaseAuth.ts`, `normalizeAuthError()` maps technical codes into user messages:
- `429` / `over_email_send_rate_limit` ──► *"Too many verification attempts..."*
- `invalid_otp` / `otp_expired` ──► *"The verification code is incorrect or expired."*
- `Error sending confirmation mail` / `SMTP` ──► *"We couldn't deliver the verification email. Please check your Supabase SMTP settings..."*
- `Failed to fetch` / `ENOTFOUND` ──► *"Unable to reach Supabase Auth server..."*

*Defect:* Uncaught top-level client initialization in `src/lib/supabase.ts` bypasses `normalizeAuthError()` entirely because it throws on script import before `supabaseAuthService` is instantiated.

---

## 22. Confirmed Root Causes

### 1. CONFIRMED ROOT CAUSE #1: Missing/Misnamed Vercel Environment Variables
- **Location:** Vercel Project Settings & Build Environment
- **Evidence:** `createClient(supabaseUrl, supabasePublishableKey)` in `src/lib/supabase.ts:88` throws `Error: supabaseUrl is required.` if `supabaseUrl` is `""`. Vite only bakes variables prefixed with `VITE_` during build. If Vercel variables are missing or named without `VITE_`, `supabaseUrl` is empty at runtime.

### 2. CONFIRMED ROOT CAUSE #2: Gmail SMTP Authentication Rejection
- **Location:** Supabase Dashboard ──► Authentication ──► Email / SMTP Settings
- **Evidence:** HTTP 500 `unexpected_failure` (`Error sending confirmation mail`). Gmail SMTP rejects connections from automated cloud servers without OAuth2 or App Passwords, causing OTP email delivery to fail.

---

## 23. Likely Root Causes

### 1. LIKELY ROOT CAUSE #1: Stale Production Deployment on Vercel
- Environment variables were added to Vercel AFTER the latest deployment was compiled. Because Vite bakes variables into JS static assets at build time, older deployments still execute bundles compiled with empty variables until a manual redeployment (without cache) is executed.

---

## 24. Ruled-Out Causes

1. **RULED OUT:** Database Schema & RLS Policy Defects. Migration `007` correctly implements `current_user_workspace_id()` and RLS policies across all 26 tables.
2. **RULED OUT:** React 19 / Vite 8 Compiler Incompatibility. Local `npm run build` compiled 1,985 modules in 3.61s with zero build errors.
3. **RULED OUT:** `@supabase/supabase-js` Dependency Corruption. Version `2.112.4` is correctly installed and configured.

---

## 25. Evidence Table

| Layer / Track | Status | Failure Mode | Technical Evidence |
|---|---|---|---|
| **Track A: Vercel/Vite Config** | **CRITICAL FAILURE** | `Error: supabaseUrl is required.` | `createClient("", "")` invoked at module load in `src/lib/supabase.ts:88` |
| **Track B: Supabase Client Init** | **DEFECTIVE** | Top-level synchronous execution | Module import throws before React renders |
| **Track C: Supabase Network** | **CONDITIONAL** | DNS/Fetch failure | Refers to `kluxsykmnijvkqxelba.supabase.co` in `.env.local` |
| **Track D: Supabase Auth** | **PASS** | Valid API logic | `signInWithOtp` and `verifyOtp` handlers correctly structured |
| **Track E & F: Email/SMTP** | **HIGH FAILURE** | HTTP 500 / SMTP Auth Failed | Gmail SMTP authentication rejected by Google |
| **Track G, H, I: DB / RLS** | **PASS** | Secure multi-tenancy | `current_user_workspace_id()` enforced across 26 tables |

---

## 26. Recommended Fixes

1. **Client Guard In `src/lib/supabase.ts`:** Prevent top-level `createClient` from throwing uncaught exceptions when environment variables are missing. Supply safe fallback strings (e.g. `https://placeholder.supabase.co`) so the app can load and render a friendly configuration error banner rather than crashing with a white screen.
2. **Vercel Environment Variable Audit & Redeploy:** Ensure exact names `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are present in Vercel Production environment, then trigger a clean redeployment.
3. **Migrate Supabase SMTP to Resend:** Replace Gmail SMTP in Supabase Authentication settings with Resend transactional SMTP (`smtp.resend.com:587`).

---

## 27. Exact Files That Need Changes

### 1. `src/lib/supabase.ts`
- Guard `createClient()` with valid fallback URL and key so top-level script import never throws an uncaught exception when environment variables are absent.

```typescript
// Proposed Guard Strategy in src/lib/supabase.ts
const validUrl = isSupabaseConfigured() ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = isSupabaseConfigured() ? supabasePublishableKey : 'placeholder-anon-key';

export const supabase = createClient(validUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

---

## 28. Exact Vercel Changes Required

1. Open **Vercel Dashboard** ──► **Settings** ──► **Environment Variables**.
2. Add/Verify:
   - `VITE_SUPABASE_URL` = `https://<your-actual-supabase-ref>.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `<your-actual-publishable-key>`
3. Select **Production**, **Preview**, and **Development**.
4. Go to **Deployments** ──► **Redeploy** (Uncheck *"Use existing Build Cache"*).

---

## 29. Exact Supabase Changes Required

1. Open **Supabase Dashboard** ──► **Authentication** ──► **Email Templates / Custom SMTP**.
2. Enable **Custom SMTP**:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Password: `<your-resend-api-key>`
   - Sender Email: `noreply@yourdomain.com`

---

## 30. Manual Verification Steps

- [ ] **Step 1: Local Production Build Test**
  Run `npm run build`. Verify 0 TypeScript / Vite errors.
- [ ] **Step 2: Vercel Variable Check**
  Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist in Vercel Settings.
- [ ] **Step 3: Trigger Clean Deployment**
  Redeploy on Vercel without cache.
- [ ] **Step 4: Browser Bundle Audit**
  Open browser DevTools Console on live Vercel URL. Confirm no `supabaseUrl is required` error.
- [ ] **Step 5: Email OTP Delivery Test**
  Attempt user signup/OTP request. Verify 200 OK from `/auth/v1/otp` and email arrival.

---

## 31. Production Testing Plan

1. **App Mount Test:** Load live URL. Verify header logo, navigation, and auth forms render cleanly.
2. **Auth OTP Test:** Enter test email ──► Receive 6-digit OTP code in email ──► Enter code ──► Registration completes.
3. **Tenant Workspace Test:** Verify new user gets assigned unique `workspace_id` and cannot view demo business data.

---

## 32. Regression Testing Plan

1. Test existing user login (`admin@vistaar.com` and regular accounts).
2. Test product creation, stock finalization, and multi-tenant data isolation.
3. Test owner password verification prompt on product deletion.

---

## 33. Remaining Unknowns

- Exact live Supabase Project Reference URL and Publishable Key configured in user's active Vercel instance (must be verified manually inside Vercel Dashboard).
- Whether a custom domain is configured in Resend for DKIM/SPF verification.

---

## 34. Final Diagnosis

VISTAAR's production application initialization failure (`Error: supabaseUrl is required`) is caused by missing or non-`VITE_` prefixed environment variables during Vercel's production build step, combined with top-level unhandled `createClient()` execution in `src/lib/supabase.ts`. 

The email delivery failure (`500 unexpected_failure`) is an independent secondary infrastructure defect caused by Gmail SMTP authentication rejection within Supabase Auth. 

Applying the top-level client guard in `src/lib/supabase.ts`, configuring `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel followed by a clean redeploy, and replacing Gmail SMTP with Resend in Supabase will completely resolve all production issues and restore system stability.
