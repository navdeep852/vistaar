# VISTAAR Desktop — Production Release Notes

**Product**: VISTAAR Desktop (Business OS)  
**Version**: 1.0.0  
**Build Architecture**: Windows x64 (`x86_64-pc-windows-msvc`)  
**Package Format**: NSIS Windows Installer (`VISTAAR-Setup.exe`)  
**Release Date**: October 2026  
**Publisher**: GROVYX  
**Tagline**: *Run Better. Grow Wider.*  

---

## 1. Highlights & Production Capabilities

VISTAAR Desktop v1.0.0 delivers the enterprise-grade VISTAAR Business OS as a high-performance Windows desktop application, combining instant native startup, low memory footprint, and complete business workflow execution.

### Key Capabilities
- **Integrated Business Management**: Real-time sales invoicing, quotation lifecycle, udhari ledger, daybook, cashbook, counter sales, and financial statement generation.
- **Unified Authoritative Accounting**: Real-time synchronization with Supabase backend ensuring mathematical equivalence across Invoices, Udhari, Daybook, Cashbook, and Dashboard KPIs.
- **Real-Time Inventory Synchronization**: Multi-category inventory management with automated stock deduction upon finalized invoice creation, low-stock warnings, and barcode scanner compatibility.
- **Enterprise Document Generation**: High-fidelity PDF generation and native OS printing for GST invoices, delivery challans, quotations, and financial reports.
- **Native Windows Desktop Integration**: Native system dialogs for file save/open, system clipboard integration, native notifications, and external browser link opening.
- **Optimized Desktop Footprint**:
  - Installer Size: **3.07 MB** (`VISTAAR-Setup.exe`)
  - Installed Payload: **5.22 MB** (including native uninstaller)
  - Standalone Binary: **5.07 MB** (`vistaar.exe`)

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

## 3. Installation, Upgrade & Uninstallation

### Installation
1. Download `VISTAAR-Setup.exe`.
2. Run the installer. By default, VISTAAR installs into the current user's profile (`%LOCALAPPDATA%\Programs\VISTAAR`) requiring no administrative elevation.
3. The installer creates a Start Menu entry and desktop shortcut for instant access.
4. Launch **VISTAAR** from the Start Menu or Desktop.

### Upgrade Path
Running a newer installer over an existing installation automatically updates the binaries and assets in-place. User authentication session tokens and local workspace preferences are preserved. Cloud data in Supabase is completely unaffected.

### Clean Uninstallation
1. Open **Windows Settings** → **Apps** → **Installed Apps** (or **Control Panel** → **Programs and Features**).
2. Select **VISTAAR** and click **Uninstall**.
3. All application files, binaries, shortcuts, and registry entries are completely removed.
4. *Data Safety*: Uninstalling the desktop application does **not** delete or reset business records, invoices, or customer ledgers stored in your secure Supabase cloud workspace.

---

## 4. Code Signing & Windows SmartScreen Notice

- **Signature Status**: Unsigned (`NotSigned`) in this initial community distribution build.
- **Windows SmartScreen**: When running `VISTAAR-Setup.exe` on a fresh Windows system, Windows Defender SmartScreen may display an informational prompt (*"Windows protected your PC"* / Unknown Publisher).
  - To proceed with installation: Click **More info** → **Run anyway**.
- **Security & Integrity**: You can verify the integrity and authenticity of the installer before running by checking its SHA-256 hash against `checksums.txt`:
  ```powershell
  certutil -hashfile VISTAAR-Setup.exe SHA256
  # Expected: 9d9a9ad8f06480134451c839f278130d0369a91540eb39bfb4e91beaca7f5fef
  ```

---

## 5. Security Audit Summary

- **Zero Elevated Keys**: Rigorous repository audit confirms zero Supabase `service_role` keys, master tokens, or administrative credentials are included in frontend or binary builds. Only client-safe public anonymous tokens are packaged.
- **Least Privilege Tauri Capabilities**: Configured strictly with granular capabilities (`core`, `dialog`, `fs`, `opener`, `clipboard-manager`, `notification`). Arbitrary shell execution and unrestricted OS commands are strictly disabled.
- **Multi-Tenant RLS**: Row Level Security and workspace isolation enforced on every database query.

---

## 6. Known Limitations

1. **Windows x64 Only**: This package targets Windows 64-bit systems (`x86_64`). 32-bit (`x86`) and ARM64-native binaries are not included in this release.
2. **Offline-First Mode**: While local caching provides rapid UI responsiveness, an active internet connection is required for persistent synchronization of transactions and cloud backups.
3. **SmartScreen Prompt**: Because the installer is distributed without an EV code-signing certificate, users must click "More info -> Run anyway" until certificate reputation builds.
