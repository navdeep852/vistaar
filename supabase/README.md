# Supabase Setup & Migration Guide (Phase 2)

## 1. Configure Environment Variables
Open `.env.local` in the project root and replace the placeholders with your actual Supabase credentials from your Supabase Dashboard (**Project Settings -> API**):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi... (your anon key)
```

> ⚠️ **SECURITY WARNING**: Never put your `service_role` secret key in `.env.local` or any client-side file.

---

## 2. Execute Database Schema Migration
To apply the database schema, multi-tenant tables, indexes, triggers, RLS policies, and storage buckets:

1. Open your **Supabase Dashboard**: `https://supabase.com/dashboard/project/<your-project-ref>`
2. Navigate to the **SQL Editor** tab on the left menu.
3. Click **+ New Query**.
4. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`.
5. Paste it into the SQL Editor.
6. Click **Run** (or `Ctrl + Enter`).

---

## 3. Verify Created Objects
In your Supabase Dashboard, verify the following:

- **Database -> Tables**: 26 tables created (`workspaces`, `profiles`, `business_settings`, `customers`, `products`, `invoices`, `quotations`, `stock_receipts`, `stock_movements`, `id_mappings`, etc.).
- **Database -> Roles & Policies**: RLS is **Enabled** on all 26 tables.
- **Storage -> Buckets**: 4 buckets created (`avatars`, `business-assets`, `product-media`, `documents`).
