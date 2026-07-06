import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const source = () => readFileSync(new URL('./KnowledgeControl.tsx', import.meta.url), 'utf8');

describe('KnowledgeControl enterprise workbench boundary', () => {
  test('does not expose desktop knowledge management entry points', () => {
    const text = source();

    expect(text.includes("navigate('/knowledge')")).toBe(false);
    expect(text.includes('knowledge.mount.manage')).toBe(false);
    expect(text.includes('knowledge.mount.createFirst')).toBe(false);
  });

  test('gates writeback controls to personal knowledge mode', () => {
    const text = source();

    expect(text.includes('enterprise.knowledgeMode')).toBe(true);
    expect(text.includes("knowledgeMode === 'personal'")).toBe(true);
  });
});
