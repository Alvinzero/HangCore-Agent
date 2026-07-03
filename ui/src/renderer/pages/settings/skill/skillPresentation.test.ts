/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import type { AssistantTag } from '@/common/types/agent/assistantTypes';
import type { SkillInfo } from '@/renderer/pages/settings/AssistantSettings/types';
import { filterSkillsByTags } from './skillFilter';
import {
  getSkillDisplayDescription,
  getSkillDisplayName,
  getSkillSearchText,
  getSkillTagLabel,
} from './skillPresentation';

const zhTags = new Map<string, AssistantTag>([
  [
    'general',
    {
      key: 'general',
      dimension: 'audience',
      label: 'General',
      label_i18n: { 'zh-CN': '通用', 'en-US': 'General' },
      sort_order: 1,
      builtin: true,
    },
  ],
  [
    'setup',
    {
      key: 'setup',
      dimension: 'scenario',
      label: 'Setup',
      label_i18n: { 'zh-CN': '工具配置', 'en-US': 'Tooling/Setup' },
      sort_order: 2,
      builtin: true,
    },
  ],
]);

const cronSkill: SkillInfo = {
  name: 'cron',
  description: 'Scheduled task management - create, query, update scheduled tasks.',
  location: '/builtin/cron/SKILL.md',
  is_custom: false,
  source: 'builtin',
  audience_tags: ['general'],
  scenario_tags: ['setup'],
};

describe('skill presentation helpers', () => {
  test('localizes builtin skill names, descriptions, and tags for Chinese users', () => {
    expect(getSkillDisplayName(cronSkill, 'zh-CN')).toBe('定时任务');
    expect(getSkillDisplayDescription(cronSkill, 'zh-CN').includes('创建、查询和更新定时任务')).toBe(true);
    expect(getSkillTagLabel('general', zhTags, 'zh-CN')).toBe('通用');
    expect(getSkillTagLabel('setup', zhTags, 'zh-CN')).toBe('工具配置');
  });

  test('keeps the original builtin id searchable while adding Chinese search text', () => {
    const searchText = getSkillSearchText(cronSkill, zhTags, 'zh-CN');

    expect(searchText.includes('cron')).toBe(true);
    expect(searchText.includes('Scheduled task management')).toBe(true);
    expect(searchText.includes('定时任务')).toBe(true);
    expect(searchText.includes('工具配置')).toBe(true);

    expect(filterSkillsByTags([cronSkill], '定时', { audience: [], scenario: [] }, (skill) =>
      getSkillSearchText(skill, zhTags, 'zh-CN')
    )).toEqual([cronSkill]);
  });

  test('does not force-translate custom or unknown skills', () => {
    const customSkill: SkillInfo = {
      name: 'internal-workflow',
      description: 'Team-specific workflow',
      location: '/skills/internal-workflow/SKILL.md',
      is_custom: true,
      source: 'custom',
    };

    expect(getSkillDisplayName(customSkill, 'zh-CN')).toBe('internal-workflow');
    expect(getSkillDisplayDescription(customSkill, 'zh-CN')).toBe('Team-specific workflow');
  });
});
