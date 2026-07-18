/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const readSource = (url: URL) => readFileSync(url, 'utf8');

describe('update disclaimer', () => {
  test('does not render the disclaimer in the update modal', () => {
    const updateModalSource = readSource(new URL('./UpdateModal.tsx', import.meta.url));
    const renderDisclaimerCalls = updateModalSource.match(/renderDisclaimer\(/g) ?? [];

    expect(renderDisclaimerCalls).toHaveLength(0);
    expect(updateModalSource.includes('update.disclaimer')).toBe(false);
  });
});
