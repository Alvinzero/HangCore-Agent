/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import { normalizeMarkdownForRendering } from './normalizeMarkdown';

describe('normalizeMarkdownForRendering', () => {
  test('repairs headings and table headers emitted on the same line', () => {
    const input = [
      '## Kun架构总览|层级 |组件 |职责 |',
      '|------|------|------|',
      '| GUI层 | Electron渲染进程 | HTTP + SSE通信 |',
      '',
      '###关键架构约束（表格）',
      '',
      '|约束 |规则 |',
      '|------|------|',
      '| **领域隔离** |领域逻辑不进入 React组件 |',
    ].join('\n');

    expect(normalizeMarkdownForRendering(input)).toBe(
      [
        '## Kun架构总览',
        '',
        '|层级 |组件 |职责 |',
        '|------|------|------|',
        '| GUI层 | Electron渲染进程 | HTTP + SSE通信 |',
        '',
        '### 关键架构约束（表格）',
        '',
        '|约束 |规则 |',
        '|------|------|',
        '| **领域隔离** |领域逻辑不进入 React组件 |',
      ].join('\n')
    );
  });

  test('repairs Mermaid fences with the diagram keyword glued to the language', () => {
    const input = '```mermaidflowchart LR User --> GUI GUI --> Loop```';

    expect(normalizeMarkdownForRendering(input)).toBe(
      ['```mermaid', 'flowchart LR', 'User --> GUI', 'GUI --> Loop', '```'].join('\n')
    );
  });

  test('does not rewrite headings or tables inside regular fenced code blocks', () => {
    const input = ['```text', '###不要改', '## Title|A|B|', '|---|---|', '```'].join('\n');

    expect(normalizeMarkdownForRendering(input)).toBe(input);
  });
});
