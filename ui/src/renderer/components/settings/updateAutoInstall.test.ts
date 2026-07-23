import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./UpdateModal.tsx', import.meta.url), 'utf8');

describe('one-click desktop update', () => {
  test('installs and restarts immediately after the Tauri download completes', () => {
    const downloadCall = source.indexOf('await ipcBridge.autoUpdate.download.invoke()');
    const installCall = source.indexOf('await installAndRestart()', downloadCall);

    expect(downloadCall).toBeGreaterThan(-1);
    expect(installCall).toBeGreaterThan(downloadCall);
    expect(source.includes('onClick={quitAndInstall}')).toBe(false);
  });

  test('shows a non-interactive installing state instead of a second approval button', () => {
    expect(source.includes("case 'installing':")).toBe(true);
    expect(source.includes("t('update.installingTitle')")).toBe(true);
    expect(source.includes("t('update.installNow')")).toBe(false);
  });
});
