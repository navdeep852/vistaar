# VISTAAR BUSINESS OS — SUPABASE DATA SERVICE LAYER ARCHITECTURE

## 1. Service Architecture & Overview
The Supabase data service layer resides cleanly in `src/services/supabase/`. It acts as a strongly-typed, modular gateway between the Vistaar application UI and the Supabase PostgreSQL database/Storage infrastructure.

```
UI Components (POS, Billing, Customers, Products, Inventory)
               │
               ▼
┌──────────────────────────────────────────────────┐
│  src/services/supabase/                          │
│    ├── index.ts               (Central Hub)      │
│    ├── types.ts               (DB Models & Maps) │
│    ├── storageService.ts      (Private Media)    │
│    ├── customerService.ts     (Customers CRUD)   │
│    ├── productService.ts     (Products/Cats)    │
│    ├── invoiceService.ts      (Invoices/Items)   │
│    ├── inventoryService.ts    (Receipts/Movements│
│    └── followUpService.ts     (Follow-ups/Logs)  │
└──────────────────────────────────────────────────┘
               │
               ▼
Supabase Client (anon/publishable key) + RLS Policy Boundary
               │
               ▼
Supabase PostgreSQL & Private Storage Buckets
```

---

## 2. Service Files & Responsibilities

| File Path | Description |
|-----------|-------------|
| `src/services/supabase/types.ts` | Strongly typed DB interface definitions and bidirectional adapters (`fromDbCustomer`, `toDbCustomer`, `fromDbProduct`, `toDbProduct`) |
| `src/services/supabase/storageService.ts` | Uploads files to workspace-scoped private paths (`{workspace_id}/{folder}/{file_name}`) and generates timed signed URLs |
| `src/services/supabase/customerService.ts` | Customer CRUD operations, server-side pagination, and ILIKE search |
| `src/services/supabase/productService.ts` | Product, Category, and Supplier operations with FK relational joins |
| `src/services/supabase/invoiceService.ts` | Invoice and Invoice Line Item reads/writes |
| `src/services/supabase/inventoryService.ts` | Stock Receipts (GRN) and Stock Movement tracking |
| `src/services/supabase/followUpService.ts` | Follow-up action engine records and JSONB execution logs |
| `src/services/supabase/index.ts` | Central export hub |

---

## 3. Entity → Supabase Table Mapping

| Application Model | Supabase PostgreSQL Table | Foreign Keys / Dependencies |
|-------------------|--------------------------|-----------------------------|
| `CompanyWorkspace` | `public.workspaces` | Primary Tenant Parent |
| `UserProfile` | `public.profiles` | `workspace_id` ➔ `workspaces.id` |
| `BusinessSettings` | `public.business_settings` | `workspace_id` ➔ `workspaces.id` |
| `Category` | `public.categories` | `workspace_id` ➔ `workspaces.id` |
| `Supplier` | `public.suppliers` | `workspace_id` ➔ `workspaces.id` |
| `Customer` | `public.customers` | `workspace_id` ➔ `workspaces.id` |
| `Product` | `public.products` | `category_id`, `supplier_id` |
| `StockReceipt` | `public.stock_receipts` | `product_id`, `supplier_id` |
| `StockMovement` | `public.stock_movements` | `product_id`, `stock_receipt_id` |
| `CounterSale` | `public.counter_sales` | `customer_id` |
| `CounterSaleItem` | `public.counter_sale_items` | `counter_sale_id`, `product_id` |
| `Quotation` | `public.quotations` | `customer_id` |
| `QuotationItem` | `public.quotation_items` | `quotation_id`, `product_id` |
| `Invoice` | `public.invoices` | `customer_id`, `quotation_id` |
| `InvoiceItem` | `public.invoice_items` | `invoice_id`, `product_id` |
| `Payment` | `public.payments` | `customer_id`, `invoice_id` |
| `UdhariRecord` | `public.udhari_records` | `customer_id` |
| `UdhariPaymentRecord` | `public.udhari_payments` | `udhari_id`, `customer_id` |
| `Expense` | `public.expenses` | `workspace_id` |
| `FollowUp` | `public.follow_ups` | `customer_id` |
| `AppNotification` | `public.notifications` | `workspace_id` |

---

## 4. Legacy ID → UUID Strategy
Legacy string IDs (e.g. `cust-1`, `prod-1`, `ws-default-vistaar`) are mapped deterministically to PostgreSQL RFC 4122 v4 UUIDs using SHA-256 namespace hashing. All legacy mapping cross-references are stored in `public.id_mappings` for full auditability during cutover.

---

## 5 & 6. Workspace Security Model & RLS Dependency
Security is enforced at the database level using Row-Level Security (RLS):
- Every query automatically injects `workspace_id = public.current_user_workspace_id()`.
- Unauthenticated requests or cross-workspace access attempts are rejected by PostgreSQL.

---

## 7 & 8. Storage Strategy & Signed URLs
- All 4 storage buckets (`avatars`, `business-assets`, `product-media`, `documents`) are **PRIVATE** (`public = false`).
- Files are saved under workspace-scoped paths: `{workspace_id}/{folder}/{filename}`.
- Private files are rendered using timed Signed URLs (`storageService.getSignedUrl(bucket, path, 3600)`).

---

## 9. Error Handling Strategy
Database errors are caught and converted into user-friendly application error objects without exposing internal database schemas or credentials.

---

## 10 & 11. Transaction / RPC & Server-Side Operations
Multi-table financial transactions (such as creating an invoice with line items and stock deduction) are designed for Database RPC functions:
- Recommended RPC: `public.create_invoice_transaction(p_invoice jsonb, p_items jsonb)`

---

## 12. Known Limitations
- Server-side background jobs (e.g. Meta Cloud API WhatsApp webhooks) currently run on `serverStore.ts` / `store.json`. They will be updated to query Supabase directly during Phase 4B-2.

---

## 13. Recommended Migration Order for Phase 4B-2
When cutover approval is given for Phase 4B-2, UI components will be switched in safe entity groups:
1. **Group 1**: Master Settings & Profiles (`businessSettingsService`, `profileService`)
2. **Group 2**: Master Data (`customerService`, `productService`, `categoryService`, `supplierService`)
3. **Group 3**: Inventory & Stock (`inventoryService`)
4. **Group 4**: Transactions & Billing (`invoiceService`, `quotationService`, `counterSaleService`, `udhariService`, `expenseService`)
5. **Group 5**: Communications & Actions (`followUpService`, `notificationService`)
