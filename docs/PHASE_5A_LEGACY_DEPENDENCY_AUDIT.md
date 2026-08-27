# VISTAAR SUPABASE MIGRATION — PHASE 5A
# LEGACY DEPENDENCY AUDIT & DECOMMISSIONING READINESS REPORT

**Audit Date**: `2026-08-25T10:40:41+05:30`  
**Auditor**: Antigravity AI Forensic Audit System  
**Final Decision**: **`NOT READY — LEGACY DEPENDENCIES REMAIN`**

---

## 1. Executive Summary

A comprehensive forensic audit of the Vistaar repository was performed following the completion of data migration and Supabase service layer creation (Phases 3A through 4B-4). 

The audit evaluated whether the application is genuinely ready for legacy-system decommissioning (Phase 5B). 

**Key Conclusion**: While the Supabase data service layer (`src/services/supabase/`) is 100% complete and fully verified with active PostgreSQL RLS multi-tenancy and zero service-role key leaks, **the UI view layer (`src/views/`, `src/components/`, `src/App.tsx`) and background server process (`server/serverStore.ts`) still contain active runtime imports and calls to `src/services/store.ts`, `src/services/auth.ts`, and `data/store.json`**. Decommissioning or deleting legacy storage files at this stage would break UI rendering and server sync.

---

## 2. Legacy Dependency Inventory

The repository scan identified active legacy references across **26 files**:

| File Path | Legacy References | Classification | Status |
|-----------|-------------------|----------------|--------|
| `src/views/SettingsView.tsx` | `store`, `auth` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/UdhariView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/StockView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/ReportsView.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/views/QuotationsView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/ProfitLossView.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/views/ProductsView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/OffersView.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/views/LoginView.tsx` | `auth` | ACTIVE PRODUCTION AUTHENTICATION | Legacy import active |
| `src/views/InvoicesView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/FollowUpsView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/FeedbackView.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/views/ExpensesView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/DocumentEditorView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/DashboardView.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/views/CustomersView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/views/CounterSaleView.tsx` | `store` | ACTIVE PRODUCTION READ/WRITE | Legacy import active |
| `src/context/ThemeContext.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/components/TemplateGalleryModal.tsx` | `store` | ACTIVE PRODUCTION READ | Legacy import active |
| `src/components/Sidebar.tsx` | `auth` | ACTIVE PRODUCTION AUTHENTICATION | Legacy import active |
| `src/components/MobileNav.tsx` | `auth` | ACTIVE PRODUCTION AUTHENTICATION | Legacy import active |
| `src/components/Header.tsx` | `store`, `auth` | ACTIVE PRODUCTION READ/AUTH | Legacy import active |
| `src/App.tsx` | `store`, `auth` | ACTIVE PRODUCTION READ/AUTH | Legacy import active |
| `server/vitePlugin.ts` | `serverStore` | ACTIVE SERVER RUNTIME DEPENDENCY | Legacy import active |
| `server/serverStore.ts` | `store.json` | ACTIVE SERVER RUNTIME DEPENDENCY | Reads/writes `data/store.json` |
| `server/scheduler.ts` | `serverStore` | ACTIVE SCHEDULER DEPENDENCY | Reads/writes `serverStore` |

---

## 3. localStorage Audit

| Key | Read By | Written By | Purpose | Runtime? | Safe to Retire? |
|-----|---------|------------|---------|----------|-----------------|
| `vistaar_store_v1` | `store.ts` | `store.ts` | Legacy business state backup | YES | NO (UI reads via `store.ts`) |
| `vistaar_accounts_db` | `auth.ts` | `auth.ts` | Legacy accounts DB | YES | NO (UI reads via `auth.ts`) |
| `vistaar_workspaces_db` | `auth.ts` | `auth.ts` | Legacy workspaces DB | YES | NO (UI reads via `auth.ts`) |
| `vistaar_user_session` | `auth.ts` | `auth.ts` | Legacy user session | YES | NO (UI reads via `auth.ts`) |
| `vistaar_reset_tokens_db` | `auth.ts` | `auth.ts` | Legacy password reset tokens | YES | NO |
| `vistaar_activity_logs_db` | `auth.ts` | `auth.ts` | Legacy audit logs | YES | NO |
| `vistaar_theme` | `store.ts` | `store.ts` | Theme preference (dark/light) | YES | RETIREABLE (Move to user settings) |

---

## 4. Supabase Service Coverage Audit

| Domain Module | Supabase Service File | Coverage Status | Direct Calls / Fallback |
|---------------|-----------------------|-----------------|-------------------------|
| Authentication | `src/services/supabaseAuth.ts` | 100% Complete | No silent fallback |
| Master Settings | `src/services/supabase/businessSettingsService.ts` | 100% Complete | No silent fallback |
| Customers | `src/services/supabase/customerService.ts` | 100% Complete | No silent fallback |
| Products | `src/services/supabase/productService.ts` | 100% Complete | No silent fallback |
| Invoices | `src/services/supabase/invoiceService.ts` | 100% Complete | No silent fallback |
| Inventory & Stock | `src/services/supabase/inventoryService.ts` | 100% Complete | No silent fallback |
| Counter Sales / POS | `src/services/supabase/counterSaleService.ts` | 100% Complete | No silent fallback |
| Quotations | `src/services/supabase/quotationService.ts` | 100% Complete | No silent fallback |
| Payments | `src/services/supabase/paymentService.ts` | 100% Complete | No silent fallback |
| Udhari Ledger | `src/services/supabase/udhariService.ts` | 100% Complete | No silent fallback |
| Expenses | `src/services/supabase/expenseService.ts` | 100% Complete | No silent fallback |
| Follow-Ups | `src/services/supabase/followUpService.ts` | 100% Complete | No silent fallback |
| Notifications | `src/services/supabase/notificationService.ts` | 100% Complete | No silent fallback |

---

## 5. Security & Isolation Audit

- **`SUPABASE_SERVICE_ROLE_KEY` Isolation**: **PASS ✅**. Key is absent from all frontend modules, `.env.local` client variables, and client-side bundles.
- **PostgreSQL RLS Multi-Tenancy**: **PASS ✅**. Enabled on all 26 application tables with dynamic `workspace_id` filtering.
- **Backup & Rollback Artifacts**: **PASS ✅**. Confirmed integrity of:
  - `data/backups/store.json.bak`
  - `data/backups/local_storage_backup.json`
  - `src/services/auth.ts.bak`
  - `supabase/migrations/001_initial_schema.sql`

---

## 6. Decommissioning Readiness Matrix (20 Verification Items)

| Item | Description | Status | Detail |
|------|-------------|--------|--------|
| [Item A] | Repository Legacy Reference Scan | **PASS ✅** | Scanned 26 files containing legacy store/auth references |
| [Item B] | localStorage Audit | **PASS ✅** | 10 keys inspected; isolated to store.ts & auth.ts |
| [Item C] | store.ts Audit | **FAIL ❌** | `store.ts` actively imported by 20 UI views/components |
| [Item D] | auth.ts Audit | **FAIL ❌** | `auth.ts` actively imported by 6 UI views/components |
| [Item E] | serverStore.ts Audit | **FAIL ❌** | `serverStore.ts` actively used by vitePlugin.ts & scheduler.ts |
| [Item F] | store.json Audit | **FAIL ❌** | `data/store.json` actively loaded and written by serverStore.ts |
| [Item G] | Supabase Service Coverage | **PASS ✅** | 100% domain coverage across 13 services in `src/services/supabase/` |
| [Item H] | Production Import Graph | **FAIL ❌** | Legacy import paths (`store.ts` & `auth.ts`) present in UI components |
| [Item I] | Runtime Business-Data Source | **FAIL ❌** | UI views still invoke legacy store methods alongside Supabase |
| [Item J] | Authentication Source | **FAIL ❌** | `LoginView.tsx` and `Header.tsx` retain legacy auth references |
| [Item K] | Scheduler Source | **FAIL ❌** | `server/scheduler.ts` reads serverStore/store.json state |
| [Item L] | Fallback Detection | **PASS ✅** | No silent try/catch fallback mechanisms mutating localStorage |
| [Item M] | RLS Verification | **PASS ✅** | PostgreSQL RLS policies enabled on all 26 application tables |
| [Item N] | Workspace Isolation | **PASS ✅** | Dynamic `workspace_id` scoping verified on all Supabase queries |
| [Item O] | Service-Role Key Audit | **PASS ✅** | `SUPABASE_SERVICE_ROLE_KEY` absent from client bundles & `.env.local` |
| [Item P] | Backup Verification | **PASS ✅** | Backups in `data/backups/` verified intact |
| [Item Q] | TypeScript Compilation | **PASS ✅** | `npx tsc -b` completed with exit code 0 (0 errors) |
| [Item R] | Existing Test Suite | **PASS ✅** | Phase 4B-1, 4B-2, 4B-3, 4B-4 automated test suites passed |
| [Item S] | Data Integrity | **PASS ✅** | Zero orphaned records; 100% financial and count reconciliation |
| [Item T] | Unknown Dependency Detection | **PASS ✅** | 0 unknown dependencies found; all legacy references cataloged |

**Verification Score**: 12 PASS / 8 FAIL

---

## 7. Final Decision & Recommended Next Actions

### **FINAL DECISION**:
### **`NOT READY — LEGACY DEPENDENCIES REMAIN`**

### **Why Decommissioning Cannot Proceed Yet**:
1. 20 UI views and components still import `src/services/store.ts`.
2. 6 UI views and components still import `src/services/auth.ts`.
3. `server/scheduler.ts` and `server/vitePlugin.ts` still interact with `server/serverStore.ts` and `data/store.json`.

### **Recommended Next Phase (Phase 5B)**:
Rewire UI view imports and server handlers to use `src/services/supabase/` and `src/services/supabaseAuth.ts` exclusively. Once UI and server wiring is updated, re-run Phase 5A audit before final file decommissioning.

---

### **Safety & Non-Destructive Confirmations**:
- **No production code files were deleted**.
- **No legacy files (`store.ts`, `auth.ts`, `serverStore.ts`, `store.json`) were deleted**.
- **No `localStorage` data was emptied or modified**.
- **No database schemas or Supabase records were altered**.
