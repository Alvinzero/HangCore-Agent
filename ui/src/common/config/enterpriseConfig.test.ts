import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const readSource = (url: URL) => readFileSync(url, 'utf8');

describe('enterprise connection config contract', () => {
  test('declares enterprise desktop config keys in both config maps', () => {
    const keysSource = readSource(new URL('./configKeys.ts', import.meta.url));
    const storageSource = readSource(new URL('./storage.ts', import.meta.url));

    for (const key of [
      'enterprise.enabled',
      'enterprise.baseUrl',
      'enterprise.workspaceId',
      'enterprise.authToken',
      'enterprise.knowledgeMode',
    ]) {
      expect(keysSource.includes(`'${key}'`)).toBe(true);
      expect(storageSource.includes(`'${key}'`)).toBe(true);
    }
  });

  test('exposes enterprise settings in the settings page shell', () => {
    const settingsPage = readSource(
      new URL('../../renderer/pages/settings/SystemSettings.tsx', import.meta.url)
    );
    const settingsSider = readSource(
      new URL('../../renderer/pages/settings/components/SettingsSider.tsx', import.meta.url)
    );

    expect(settingsPage.includes('/settings/enterprise')).toBe(true);
    expect(settingsSider.includes("'enterprise'")).toBe(true);
  });
});
