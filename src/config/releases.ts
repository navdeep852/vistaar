/**
 * VISTAAR BUSINESS OS — CENTRALIZED RELEASE MANIFEST
 * 
 * Authoritative release metadata for Web, Windows Desktop, and Android APK downloads.
 */

export interface PlatformReleaseInfo {
  platform: 'web' | 'android' | 'windows';
  name: string;
  version: string;
  releaseDate: string;
  status: 'released' | 'preview' | 'pipeline';
  fileSize: string;
  downloadUrl?: string;
  minOsVersion: string;
  architecture: string;
  sha256?: string;
  changelog: string[];
  installSteps: string[];
  systemRequirements: string[];
}

export const RELEASE_MANIFEST: Record<'web' | 'android' | 'windows', PlatformReleaseInfo> = {
  web: {
    platform: 'web',
    name: 'VISTAAR Web Cloud OS',
    version: '1.0.1',
    releaseDate: 'November 2026',
    status: 'released',
    fileSize: '0 MB (Zero Install)',
    downloadUrl: '/login',
    minOsVersion: 'Any Modern Browser (Chrome 90+, Edge 90+, Safari 15+, Firefox 90+)',
    architecture: 'WebAssembly & Universal JavaScript',
    changelog: [
      'Resolved header search bar and sidebar navigation icon layout overlap with dedicated shrink-0 anchoring',
      'Harmonized workspace resolution query with authoritative deleted_at soft-delete schema',
      'Established permanent cross-platform synchronization standard and automated health suite',
      'Real-time multi-branch inventory synchronization',
      'High-speed GST and non-GST invoicing with thermal receipt support',
      'Customer Udhari ledger and WhatsApp payment reminders',
    ],
    installSteps: [
      'No installation required. Click "Launch Web App".',
      'Log in with your verified VISTAAR business account.',
      'Bookmark https://vistaarone.com/login for 1-click access.',
    ],
    systemRequirements: [
      'Internet connection for initial sync',
      'Modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari)',
      '1024x768 minimum display resolution',
    ],
  },
  android: {
    platform: 'android',
    name: 'VISTAAR for Android (APK)',
    version: '1.0.0',
    releaseDate: 'October 2026',
    status: 'released',
    fileSize: '11.1 MB',
    // In production, downloads are served via verified release storage (CDN/Bucket)
    downloadUrl: '/downloads/vistaar-v1.0.0.apk',
    minOsVersion: 'Android 8.0 (Oreo / API 26) or higher',
    architecture: 'Universal APK (arm64-v8a, armeabi-v7a, x86_64)',
    sha256: '9f82d1c4b78a9103e62f012c49b06a8e31295b772098d5c41e8fa291b402801e',
    changelog: [
      'Optimized mobile counter checkout with instant barcode lookup',
      'Camera-based barcode and QR code scanner for fast inventory audits',
      'Direct thermal Bluetooth 58mm / 80mm ESC/POS receipt printing',
      'Customer WhatsApp payment collection reminders on the go',
    ],
    installSteps: [
      'Click "Download APK" to download the installer file to your phone.',
      'Open the downloaded APK file from your Notifications or Downloads folder.',
      'If prompted, allow "Install unknown apps" for your browser in Android Settings.',
      'Tap "Install" and open VISTAAR. Sign in with your business credentials.',
    ],
    systemRequirements: [
      'Android 8.0 (API 26) or newer',
      '2 GB RAM minimum (4 GB recommended)',
      'Camera permission for barcode scanning',
      'Bluetooth permission for portable thermal printing',
    ],
  },
  windows: {
    platform: 'windows',
    name: 'VISTAAR Desktop for Windows',
    version: '1.0.1',
    releaseDate: 'November 2026',
    status: 'released',
    fileSize: '4.8 MB (NSIS Installer)',
    downloadUrl: '/release/VISTAAR-Setup.exe',
    minOsVersion: 'Windows 10 / Windows 11 (64-bit)',
    architecture: 'x64 (Native Windows Executable)',
    changelog: [
      'Synchronized with v1.0.1 core: eliminated header search bar and sidebar icon overlap',
      'Harmonized workspace resolution query with authoritative deleted_at soft-delete schema',
      'Dedicated desktop window with hardware-accelerated rendering and native WebView2',
      'Full keyboard shortcut integration (Ctrl+K for omni-search, Ctrl+B for sidebar toggle)',
      'Native USB / Serial COM port ESC/POS thermal printing with cash drawer trigger',
      'Local background cache for uninterrupted trade during connectivity drops',
    ],
    installSteps: [
      'Download the official VISTAAR Windows Setup (.exe) installer.',
      'Double-click the installer and follow the lightweight installation wizard.',
      'Launch VISTAAR from your Start Menu or Desktop shortcut.',
      'Sign in to sync your company data and hardware printers.',
    ],
    systemRequirements: [
      'Windows 10 (Version 1809+) or Windows 11 64-bit',
      '4 GB RAM minimum (8 GB recommended for multi-lane counters)',
      '200 MB free disk space',
      'Standard thermal printer (USB/LAN/COM) supported',
    ],
  },
};
