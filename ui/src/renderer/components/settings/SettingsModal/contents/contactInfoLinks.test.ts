/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const readSource = (url: URL) => readFileSync(url, 'utf8');

describe('public contact links', () => {
  test('keeps About and Contact surfaces wired to current public channels', () => {
    const aboutSource = readSource(new URL('./AboutModalContent.tsx', import.meta.url));
    const contactSource = readSource(new URL('./FeedbackReportModal.tsx', import.meta.url));
    const combined = `${aboutSource}\n${contactSource}`;

    for (const target of [
      'https://www.hsxp-hk.com/',
      'https://github.com/Alvinzero/HangCore-Agent',
      'https://github.com/Alvinzero/HangCore-Agent/issues',
      'https://github.com/Alvinzero/HangCore-Agent/releases',
    ]) {
      expect(combined.includes(target)).toBe(true);
    }

    expect(aboutSource.includes('ABOUT_LINK_TARGET')).toBe(false);
  });

  test('keeps the public contact email empty', () => {
    const aboutSource = readSource(new URL('./AboutModalContent.tsx', import.meta.url));
    const contactSource = readSource(new URL('./FeedbackReportModal.tsx', import.meta.url));
    const combined = `${aboutSource}\n${contactSource}`;

    expect(contactSource.includes("email: ''")).toBe(true);
    expect(contactSource.includes("emailHref: ''")).toBe(true);
    expect(aboutSource.includes('settings.contactEmailPending')).toBe(false);
    expect(contactSource.includes('settings.contactEmailPending')).toBe(false);
    expect(combined.includes('535526063@qq.com')).toBe(false);
    expect(combined.includes('mailto:535526063@qq.com')).toBe(false);
  });

  test('does not expose the Baidu manual installer link in update surfaces', () => {
    const aboutSource = readSource(new URL('./AboutModalContent.tsx', import.meta.url));
    const contactSource = readSource(new URL('./FeedbackReportModal.tsx', import.meta.url));
    const updateModalSource = readSource(new URL('../../UpdateModal.tsx', import.meta.url));

    for (const source of [aboutSource, contactSource, updateModalSource]) {
      expect(source.includes('pan.baidu.com')).toBe(false);
      expect(source.includes('baiduManualDownload')).toBe(false);
      expect(source.includes('baiduMirror')).toBe(false);
    }
  });

  test('keeps the Contact modal visually quiet instead of rendering chunky cards', () => {
    const contactSource = readSource(new URL('./FeedbackReportModal.tsx', import.meta.url));

    expect(contactSource.includes("import CopyIconButton from '@/renderer/components/base/CopyIconButton'")).toBe(true);
    expect(contactSource.includes("<Info theme='outline' size='28' />")).toBe(false);
    expect(contactSource.includes("bg-fill-2 px-12px py-10px")).toBe(false);
    expect(contactSource.includes('>↗<')).toBe(false);
  });
});
