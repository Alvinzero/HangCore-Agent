import { describe, expect, test } from 'bun:test';
import {
  filterVisibleAgents,
  normalizeHiddenAgentKeys,
  toggleHiddenAgentKey,
} from './agentVisibility';

describe('agentVisibility', () => {
  test('filters hidden local agents by their selection key', () => {
    const agents = [
      { agent_type: 'nomi', backend: 'nomi', name: 'Nomi' },
      { agent_type: 'acp', backend: 'codex', name: 'Codex CLI' },
      { agent_type: 'acp', backend: 'kun', name: '8位MCU Profile' },
    ];

    const visible = filterVisibleAgents(agents, ['kun']);

    expect(visible.map((agent) => agent.backend)).toEqual(['nomi', 'codex']);
  });

  test('normalizes persisted hidden keys and ignores invalid values', () => {
    expect(normalizeHiddenAgentKeys(['kun', '', 'kun', ' codex ', 42, null])).toEqual(['kun', 'codex']);
    expect(normalizeHiddenAgentKeys('kun')).toEqual([]);
  });

  test('toggles hidden keys without duplicates', () => {
    expect(toggleHiddenAgentKey(['kun'], 'codex', true)).toEqual(['kun', 'codex']);
    expect(toggleHiddenAgentKey(['kun', 'kun'], 'kun', true)).toEqual(['kun']);
    expect(toggleHiddenAgentKey(['kun', 'codex'], 'kun', false)).toEqual(['codex']);
    expect(toggleHiddenAgentKey(['kun'], '', true)).toEqual(['kun']);
  });
});
