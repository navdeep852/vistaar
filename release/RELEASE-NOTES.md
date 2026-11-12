# VISTAAR Desktop — Production Release Notes

**Product**: VISTAAR Desktop (Business OS)  
**Latest Version**: 1.0.1  
**Build Architecture**: Windows x64 (`x86_64-pc-windows-msvc`)  
**Package Format**: NSIS Windows Installer (`VISTAAR-Setup.exe` & `VISTAAR_1.0.1_x64-setup.exe`)  
**Release Date**: November 2026  
**Publisher**: GROVYX  
**Tagline**: *Run Better. Grow Wider.*  

---

## 1. Release Highlights & Changelog

### Version 1.0.1 (November 2026) — Complete Financial Analytics Reconciliation & Parity Release
- **Authoritative Financial Analytics Engine (`src/services/analytics/`)**: Introduced pure, deterministic financial analytics calculation engine operating in integer paise arithmetic with zero floating-point drift. Accurately formulates Total Sales, Collections, Cash/UPI/Bank/Card/Cheque breakdowns, Gross Profit (using item historical buy price COGS), and Outstanding Udhari (as-of date reconstruction).
- **Cross-Device Parity & LocalStorage Decoupling**: Eliminated local storage merges (`localStorage`, `safeGetTenantStorage`, `store.getInvoices()`, `store.getCounterSales()`, `store.getPayments()`) from financial metrics retrieval in `enterpriseAnalyticsService`, `salesAnalyticsService`, and `financialStatementService`. Supabase PostgreSQL is established as the sole authoritative source of truth.
- **Collections Logic & Payment Deduplication**: Repaired Collections calculation to aggregate strictly genuine payment transaction records (`public.payments`, `public.udhari_payments`, and upfront cash receipts on completed counter sales). Completely eliminated the invoice `paid_amount` unverified fallback that caused collections to artificially match total sales on desktop.
- **Counter Sale Deduplication**: Guaranteed converted counter sales are counted exactly once under finalized invoices, preventing double-counting across commercial sales channels.
- **Automated Verification Suite**: Authored 11 comprehensive unit test scenarios covering Test Cases A through K (`tests/financialAnalytics.test.ts`), passing with 100% success in 15ms.
- **Cross-Platform Verification Suite**: Verified 9/9 cross-platform synchronization checks across Web, Desktop (Tauri), and Mobile (Capacitor/Android).
- **Header Interaction & Functional Controls Fix**: Resolved all non-responsive header controls across Web, Desktop, and Mobile. Removed vertical container clipping (`overflow-x-hidden`) to allow all dropdowns and popovers (Quick Create, Notifications, User Menu, Branch Switcher, Global Search) to render freely without truncation.
- **Header Action Restorations**: Restored the Refresh button with active `animate-spin` loading states, cross-view event dispatching (`vistaar:refresh-dashboard` and `vistaar:branch_changed`), notification syncing, and toast feedback. Secured the Analytics shortcut with role permissions (`analytics.view`). Linked "Record Payment" to unpaid invoice filtering. Integrated "VISTAAR Website" with native system browser launching via Tauri and Capacitor. Normalized notification database mapping (`created_at` -> `date`, `route_link` -> `linkRoute`) for proper timestamps and route navigation.
- **Desktop Header Search Bar Width & Profile Protection**: Optimized desktop header flex distribution by placing responsive width boundaries on the global search input (`min-w-[180px]`, default `280px–320px`, `max-w-[360px]`). Strictly protected all 8 right-side action controls with `shrink-0` bounds—ensuring that the user profile section (avatar and username) is never pushed off-screen or clipped across all supported desktop window dimensions (1024x768 to 1920x1080+).
- **Header UI Overlap Resolution**: Completely eliminated horizontal collision between the desktop search bar and adjacent sidebar navigation toggle (`PanelLeft`). Anchored search bar with fixed bounds, standard `h-9` height, and responsive middle breadcrumbs.
- **Workspace Authorization Schema Parity**: Aligned database workspace resolution queries with authoritative PostgreSQL `deleted_at` soft-delete architecture (eliminating runtime failures regarding nonexistent `is_active` / `suspension_reason` columns).
- **Accounting & Daybook Deduplication**: Atomic database transaction locking prevents duplicate entries across counter sales and tax invoices.

### Version 1.0.0 (October 2026) — Initial General Availability
- **Integrated Business OS**: Real-time sales invoicing, quotation lifecycle, udhari ledger, daybook, cashbook, counter sales, and financial statement generation.
- **Authoritative Cloud Synchronization**: Real-time synchronization with Supabase backend ensuring mathematical equivalence across Invoices, Udhari, Daybook, Cashbook, and Dashboard KPIs.
- **Real-Time Inventory Synchronization**: Multi-category inventory management with automated stock deduction upon finalized invoice creation, low-stock warnings, and barcode scanner compatibility.
- **Enterprise Document Generation**: High-fidelity PDF generation and native OS printing for GST invoices, delivery challans, quotations, and financial reports.
- **Native Windows Desktop Integration**: Native system dialogs for file save/open, system clipboard integration, native notifications, and external browser link opening.
- **Optimized Desktop Footprint**:
  - Installer Size: **4.53 MB** (`VISTAAR-Setup.exe`)
  - Standalone Binary: **5.08 MB** (`vistaar.exe`)

---

## 2. Desktop System Requirements & Distribution

| Requirement | Specification |
| :--- | :--- |
| **Operating System** | Windows 10 (1809+) or Windows 11 (64-bit x64 architecture) |
| **Runtime Engine** | Microsoft Edge WebView2 Runtime (pre-installed on Windows 10/11) |
| **Memory (RAM)** | Minimum 2 GB RAM (Recommended 4 GB+ RAM) |
| **Disk Space** | ~20 MB free disk space for installer and application payload |
| **Network** | Active internet connection for cloud synchronization with Supabase backend |

### WebView2 Prerequisite Note
VISTAAR uses the native Microsoft Edge WebView2 runtime provided out-of-the-box by Windows 10 and Windows 11. If installing on an older or enterprise LTSC system where WebView2 has been stripped, download the evergreen runtime from [Microsoft Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

---

## 3. Installation, Upgrade & Data Safety

### Fresh Installation
1. Download `VISTAAR-Setup.exe`.
2. Run the installer. By default, VISTAAR installs into the current user's profile (`%LOCALAPPDATA%\Programs\VISTAAR`) requiring no administrative elevation.
3. The installer creates a Start Menu entry and desktop shortcut for instant access.
4. Launch **VISTAAR** from the Start Menu or Desktop.

### In-Place Upgrade Path
Running the v1.0.1 installer over an existing v1.0.0 installation automatically upgrades application binaries and web assets in-place:
- **Authentication Session Preserved**: User login sessions stored in local storage and secure credential storage remain active.
- **Preferences Preserved**: Branch selection, active theme (Dark/Light), and client settings remain intact.
- **Cloud Database Untouched**: Cloud records, transactions, ledgers, and inventory in Supabase remain 100% authoritative and unaffected.

### Clean Uninstallation
1. Open **Windows Settings** → **Apps** → **Installed Apps** (or **Control Panel** → **Programs and Features**).
2. Select **VISTAAR** and click **Uninstall**.
3. All application files, binaries, shortcuts, and registry entries are cleanly removed.
4. *Data Safety*: Uninstalling the desktop application does **not** delete or reset business records or invoices stored in your secure Supabase cloud workspace.

---

## 4. Cryptographic Verification & Checksums

You can verify the authenticity and integrity of the installer before running by checking its SHA-256 hash against `checksums.txt`:

```powershell
certutil -hashfile VISTAAR-Setup.exe SHA256
# Expected: D90086D922D3E1E5B876BEB6769325362A7F3955086FCC3AF7978C94290A1B99
```

| File Name | Version | Architecture | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| `VISTAAR-Setup.exe` | 1.0.1 | x86_64 | `d90086d922d3e1e5b876beb6769325362a7f3955086fcc3af7978c94290a1b99` |
| `VISTAAR_1.0.1_x64-setup.exe` | 1.0.1 | x86_64 | `d90086d922d3e1e5b876beb6769325362a7f3955086fcc3af7978c94290a1b99` |
| `VISTAAR-Mobile.apk` | 1.0.1 | Android ARM64/x86_64 | `93d081edc69ac12d4149acc1bbee2f4d458df55fe1d0b9b01d2f9c3e0564e0cc` |
| `VISTAAR_1.0.1_mobile-debug.apk` | 1.0.1 | Android ARM64/x86_64 | `93d081edc69ac12d4149acc1bbee2f4d458df55fe1d0b9b01d2f9c3e0564e0cc` |

---

## 5. Security Audit Summary

- **Zero Elevated Keys**: Rigorous repository audit confirms zero Supabase `service_role` keys, master tokens, or administrative credentials are included in frontend or binary builds. Only client-safe public anonymous tokens are packaged.
- **Least Privilege Tauri Capabilities**: Configured strictly with granular capabilities (`core`, `dialog`, `fs`, `opener`, `clipboard-manager`, `notification`). Arbitrary shell execution and unrestricted OS commands are strictly disabled.
- **Multi-Tenant RLS**: Row Level Security and workspace isolation enforced on every database query.

---

## 6. Known Limitations

1. **Windows x64 Only**: This package targets Windows 64-bit systems (`x86_64`). 32-bit (`x86`) and ARM64-native binaries are not included in this release.
2. **Offline-First Mode**: While local caching provides rapid UI responsiveness, an active internet connection is required for persistent synchronization of transactions and cloud backups.
3. **SmartScreen Prompt**: Because the installer is distributed without an EV code-signing certificate, users may need to click "More info -> Run anyway" until publisher reputation is built.
