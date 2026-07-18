import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const TAURI_CONFIG = resolve(ROOT, 'apps/desktop/tauri.conf.json');
const EXPECTED_HOOK = 'nsis/install-identity-migration.nsh';

describe('Windows install identity migration', () => {
  test('keeps HK AI Platform branding while registering the legacy NSIS migration hook', () => {
    const config = JSON.parse(readFileSync(TAURI_CONFIG, 'utf8'));

    expect(config.productName).toBe('HK AI Platform');
    expect(config.identifier).toBe('com.hangshun.hangcoreagent');
    expect(config.bundle?.windows?.nsis?.installerHooks).toBe(EXPECTED_HOOK);
  });

  test('migrates legacy shortcuts and uninstall metadata without deleting application data', () => {
    const hookPath = resolve(ROOT, 'apps/desktop', EXPECTED_HOOK);
    expect(existsSync(hookPath)).toBe(true);

    const hook = readFileSync(hookPath, 'utf8');
    expect(hook).toContain('HangCore Agent');
    expect(hook).toContain('HK AI Platform');
    expect(hook).toContain('NSIS_HOOK_PREINSTALL');
    expect(hook).toContain('NSIS_HOOK_POSTINSTALL');
    expect(hook).toContain('UninstallString');
    expect(hook).toContain('/UPDATE');
    expect(hook).toContain('!define LEGACY_PRODUCT_NAME "HangCore Agent"');
    expect(hook).toContain('!define LEGACY_INSTALL_KEY "Software\\hangshun\\${LEGACY_PRODUCT_NAME}"');
    expect(hook).toContain('$DESKTOP\\${LEGACY_PRODUCT_NAME}.lnk');
    expect(hook).toContain('$SMPROGRAMS\\${LEGACY_PRODUCT_NAME}.lnk');
    expect(hook).toContain('CurrentVersion\\Run');
    expect(hook).toContain('${AndIf} $LegacyHadDesktopShortcut == 0');
    expect(hook).toContain('${AndIf} $LegacyHadStartMenuShortcut == 0');
    expect(hook).toContain('${AndIf} $LegacyAutostartCommand == ""');

    const desktopProbe = hook.indexOf('${FileExists} "$DESKTOP\\${LEGACY_PRODUCT_NAME}.lnk"');
    const emptyMetadataExit = hook.indexOf('${AndIf} $LegacyUninstaller == ""');
    expect(desktopProbe).toBeGreaterThan(-1);
    expect(emptyMetadataExit).toBeGreaterThan(desktopProbe);
    expect(hook).not.toMatch(/\$APPDATA|RmDir\s+\/r\s+[^\n]*(NomiFun|com\.hangshun)/i);
  });
});
