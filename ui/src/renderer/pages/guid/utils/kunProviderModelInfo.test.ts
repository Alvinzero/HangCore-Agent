import { describe, expect, test } from 'bun:test';
import type { IProvider } from '@/common/config/storage';
import { buildKunProviderModelInfo, encodeKunProviderModelId } from './kunProviderModelInfo';

const provider = (overrides: Partial<IProvider> = {}): IProvider =>
  ({
    id: 'deepseek',
    platform: 'openai',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    api_key: 'sk-test',
    models: ['deepseek-chat'],
    enabled: true,
    capabilities: [],
    ...overrides,
  }) as IProvider;

describe('buildKunProviderModelInfo', () => {
  test('exposes enabled user-configured provider models for 8bit MCU Profile', () => {
    const info = buildKunProviderModelInfo([
      provider({ id: 'disabled', enabled: false, models: ['off-model'] }),
      provider({
        id: 'deepseek',
        name: 'DeepSeek',
        models: ['disabled-model', 'deepseek-chat'],
        model_enabled: { 'disabled-model': false },
      }),
    ]);

    const expectedId = encodeKunProviderModelId('deepseek', 'deepseek-chat');
    expect(info?.current_model_id).toBe(expectedId);
    expect(info?.available_models).toEqual([{ id: expectedId, label: 'DeepSeek / deepseek-chat' }]);
  });
});
