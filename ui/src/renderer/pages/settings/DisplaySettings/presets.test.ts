/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const source = readFileSync(new URL('./presets.ts', import.meta.url), 'utf8');

describe('HK AI Platform preset themes', () => {
  test('offers the five requested brand themes with blue as the default', () => {
    expect(source.includes("export const DEFAULT_THEME_ID = 'hk-blue'")).toBe(true);

    const expectedThemes = [
      ['hk-blue', '蓝色主体'],
      ['hk-white', '白色'],
      ['hk-purple', '紫色'],
      ['hk-black', '黑色'],
      ['hk-gold', '金黄色'],
    ] as const;

    for (const [id, name] of expectedThemes) {
      expect(source.includes(`id: '${id}'`)).toBe(true);
      expect(source.includes(`name: '${name}'`)).toBe(true);
      expect(source.includes(`./presets/${id}.css?raw`)).toBe(true);
    }
  });
});
