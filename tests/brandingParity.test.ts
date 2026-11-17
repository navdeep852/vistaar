import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('VISTAAR — Official Branding & Asset Verification', () => {
  const rootDir = process.cwd();

  it('1. Official brand source and web image assets exist', () => {
    const assets = [
      'public/assets/vistaar-logo.jpg',
      'public/assets/vistaar-logo.png',
      'public/vistaar-logo.jpg',
      'public/vistaar-logo.png',
      'public/Vistaar_Icon_logo.png',
      'public/favicon.ico',
      'public/favicon-512x512.png',
      'public/favicon-192x192.png',
      'public/favicon-96x96.png',
      'public/favicon-48x48.png',
      'public/apple-touch-icon.png',
      'public/site.webmanifest',
    ];

    for (const relPath of assets) {
      const fullPath = path.resolve(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Asset must exist: ${relPath}`);
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 0, `Asset must not be empty: ${relPath}`);
    }
  });

  it('2. Android native launcher mipmap icons exist across all densities', () => {
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    const variants = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

    for (const density of densities) {
      for (const variant of variants) {
        const iconPath = path.resolve(
          rootDir,
          `android/app/src/main/res/mipmap-${density}/${variant}`
        );
        assert.ok(fs.existsSync(iconPath), `Android icon must exist: mipmap-${density}/${variant}`);
        assert.ok(fs.statSync(iconPath).size > 0, `Android icon must not be empty: ${variant}`);
      }
    }
  });

  it('3. Android native splash screen drawables exist for portrait and landscape', () => {
    const splashPaths = [
      'android/app/src/main/res/drawable/splash.png',
      'android/app/src/main/res/drawable-port-mdpi/splash.png',
      'android/app/src/main/res/drawable-port-hdpi/splash.png',
      'android/app/src/main/res/drawable-port-xhdpi/splash.png',
      'android/app/src/main/res/drawable-port-xxhdpi/splash.png',
      'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
      'android/app/src/main/res/drawable-land-mdpi/splash.png',
      'android/app/src/main/res/drawable-land-hdpi/splash.png',
      'android/app/src/main/res/drawable-land-xhdpi/splash.png',
      'android/app/src/main/res/drawable-land-xxhdpi/splash.png',
      'android/app/src/main/res/drawable-land-xxxhdpi/splash.png',
    ];

    for (const relPath of splashPaths) {
      const fullPath = path.resolve(rootDir, relPath);
      assert.ok(fs.existsSync(fullPath), `Android splash drawable must exist: ${relPath}`);
      assert.ok(fs.statSync(fullPath).size > 0, `Android splash drawable must not be empty: ${relPath}`);
    }
  });

  it('4. Centralized BrandLogo component exists with required variants', () => {
    const brandLogoPath = path.resolve(rootDir, 'src/components/BrandLogo.tsx');
    assert.ok(fs.existsSync(brandLogoPath), 'BrandLogo.tsx must exist');

    const content = fs.readFileSync(brandLogoPath, 'utf-8');
    assert.ok(content.includes('export const BrandLogo'), 'Must export BrandLogo');
    assert.ok(content.includes("variant === 'splash'"), 'Must handle splash variant');
    assert.ok(content.includes("variant === 'auth'"), 'Must handle auth variant');
    assert.ok(content.includes("variant === 'header'"), 'Must handle header variant');
    assert.ok(content.includes("variant === 'drawer'"), 'Must handle drawer variant');
    assert.ok(content.includes("variant === 'compact'"), 'Must handle compact variant');
    assert.ok(content.includes('/vistaar-logo.png'), 'Must reference official logo path');
  });

  it('5. index.html bootloader displays official VISTAAR brand logo', () => {
    const indexPath = path.resolve(rootDir, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(content.includes('/vistaar-logo.png'), 'index.html must display /vistaar-logo.png');
    assert.ok(content.includes('VISTAAR'), 'index.html must contain brand name VISTAAR');
    assert.ok(content.includes('Run Better. Grow Wider.'), 'index.html must contain brand tagline');
  });

  it('6. src/App.tsx uses BrandLogo for app loading and splash states', () => {
    const appPath = path.resolve(rootDir, 'src/App.tsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    assert.ok(content.includes("import { BrandLogo } from './components/BrandLogo'"), 'App.tsx must import BrandLogo');
    assert.ok(content.includes('<BrandLogo variant="splash"'), 'App.tsx must render BrandLogo splash variant');
  });

  it('7. src/views/LoginView.tsx uses BrandLogo for authentication screens', () => {
    const loginPath = path.resolve(rootDir, 'src/views/LoginView.tsx');
    const content = fs.readFileSync(loginPath, 'utf-8');

    assert.ok(content.includes("import { BrandLogo } from '../components/BrandLogo'"), 'LoginView.tsx must import BrandLogo');
    assert.ok(content.includes('variant="auth"'), 'LoginView.tsx must render BrandLogo auth variant');
  });

  it('8. src/components/MobileNav.tsx integrates BrandLogo across header, drawer, and tabs', () => {
    const mobileNavPath = path.resolve(rootDir, 'src/components/MobileNav.tsx');
    const content = fs.readFileSync(mobileNavPath, 'utf-8');

    assert.ok(content.includes("import { BrandLogo } from './BrandLogo'"), 'MobileNav.tsx must import BrandLogo');
    assert.ok(content.includes('<BrandLogo variant="header"'), 'MobileNav.tsx must render BrandLogo header variant');
    assert.ok(content.includes('<BrandLogo variant="icon"'), 'MobileNav.tsx must render BrandLogo on secondary tabs');
    assert.ok(content.includes('<BrandLogo variant="compact"'), 'MobileNav.tsx must render BrandLogo in drawer');
  });

  it('9. Desktop Header and ScreenLockOverlay integrate BrandLogo', () => {
    const headerPath = path.resolve(rootDir, 'src/components/Header.tsx');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    assert.ok(headerContent.includes("import { BrandLogo } from './BrandLogo'"), 'Header.tsx must import BrandLogo');
    assert.ok(headerContent.includes('<BrandLogo variant="compact" />'), 'Header.tsx must render BrandLogo');

    const lockPath = path.resolve(rootDir, 'src/components/ScreenLockOverlay.tsx');
    const lockContent = fs.readFileSync(lockPath, 'utf-8');
    assert.ok(lockContent.includes("import { BrandLogo } from './BrandLogo'"), 'ScreenLockOverlay.tsx must import BrandLogo');
    assert.ok(lockContent.includes('<BrandLogo variant="compact" />'), 'ScreenLockOverlay.tsx must render BrandLogo');
  });
});
