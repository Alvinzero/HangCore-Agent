import { describe, expect, test } from 'bun:test';
import { buildAcpModelMenuGroups } from './acpModelMenuGroups';

describe('buildAcpModelMenuGroups', () => {
  test('groups provider-backed ACP models like the Nomi model selector', () => {
    const groups = buildAcpModelMenuGroups({
      currentModelId: 'provider:deepseek:deepseek-v4-pro',
      models: [
        { id: 'provider:deepseek:deepseek-v4-flash', label: 'DeepSeek / deepseek-v4-flash' },
        { id: 'provider:deepseek:deepseek-v4-pro', label: 'DeepSeek / deepseek-v4-pro' },
      ],
    });

    expect(groups).toEqual([
      {
        key: 'DeepSeek',
        title: 'DeepSeek',
        items: [
          {
            id: 'provider:deepseek:deepseek-v4-flash',
            label: 'deepseek-v4-flash',
            selected: false,
          },
          {
            id: 'provider:deepseek:deepseek-v4-pro',
            label: 'deepseek-v4-pro',
            selected: true,
          },
        ],
      },
    ]);
  });
});
