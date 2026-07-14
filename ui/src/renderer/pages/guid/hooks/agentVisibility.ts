/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 * Based on AionUi (https://github.com/iOfficeAI/AionUi)
 */

import { getAgentKey } from './agentSelectionUtils';
import type { AgentSource } from '@/renderer/utils/model/agentTypes';

type AgentKeyLike = {
  agent_type: string;
  agent_source?: AgentSource;
  backend?: string;
  id?: string;
  is_preset?: boolean;
};

export function normalizeHiddenAgentKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const key = item.trim();
    if (key) keys.add(key);
  });
  return [...keys];
}

export function toggleHiddenAgentKey(keys: readonly string[], key: string, hidden: boolean): string[] {
  const normalizedKey = key.trim();
  const normalizedKeys = normalizeHiddenAgentKeys([...keys]);
  if (!normalizedKey) return normalizedKeys;
  return hidden
    ? normalizeHiddenAgentKeys([...normalizedKeys, normalizedKey])
    : normalizedKeys.filter((item) => item !== normalizedKey);
}

export function filterVisibleAgents<T extends AgentKeyLike>(agents: readonly T[], hiddenKeys: readonly string[]): T[] {
  const hidden = new Set(normalizeHiddenAgentKeys([...hiddenKeys]));
  return agents.filter((agent) => !hidden.has(getAgentKey(agent)));
}
