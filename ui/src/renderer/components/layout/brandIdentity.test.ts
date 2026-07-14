/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const read = (url: URL) => readFileSync(url, 'utf8');

describe('HK AI Platform brand identity', () => {
  test('uses HK AI Platform in visible app chrome and metadata', () => {
    const devIndexHtml = read(new URL('../../../../index.html', import.meta.url));
    const indexHtml = read(new URL('../../index.html', import.meta.url));
    const manifest = JSON.parse(read(new URL('../../../../public/manifest.webmanifest', import.meta.url)));
    const layout = read(new URL('./Layout.tsx', import.meta.url));
    const titlebar = read(new URL('./Titlebar/index.tsx', import.meta.url));
    const tauriConfig = JSON.parse(read(new URL('../../../../../apps/desktop/tauri.conf.json', import.meta.url)));
    const desktopMain = read(new URL('../../../../../apps/desktop/src/main.rs', import.meta.url));

    expect(devIndexHtml.includes('<title>HK AI Platform</title>')).toBe(true);
    expect(devIndexHtml.includes('content="HK AI Platform"')).toBe(true);
    expect(indexHtml.includes('<title>HK AI Platform</title>')).toBe(true);
    expect(indexHtml.includes('content="HK AI Platform"')).toBe(true);
    expect(manifest.name).toBe('HK AI Platform');
    expect(manifest.short_name).toBe('HK AI');
    expect(layout.includes('HK AI Platform')).toBe(true);
    expect(titlebar.includes("useMemo(() => 'HK AI Platform'")).toBe(true);
    expect(tauriConfig.productName).toBe('HK AI Platform');
    expect(desktopMain.includes('"HK AI Platform"')).toBe(true);
  });
});
