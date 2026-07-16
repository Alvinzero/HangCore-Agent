import { describe, expect, test } from 'bun:test';
import type { IProvider } from '@/common/config/storage';
import {
  buildKunProviderModelInfo,
  encodeKunProviderModelId,
  mergeKunProviderModelInfo,
} from './kunProviderModelInfo';

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

  test('keeps provider-detected models when Kun runtime advertises only the active model', () => {
    const flashId = encodeKunProviderModelId('deepseek', 'deepseek-v4-flash');
    const proId = encodeKunProviderModelId('deepseek', 'deepseek-v4-pro');
    const providerInfo = buildKunProviderModelInfo([
      provider({
        id: 'deepseek',
        name: 'DeepSeek',
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      }),
    ]);

    const merged = mergeKunProviderModelInfo(providerInfo, {
      current_model_id: flashId,
      current_model_label: 'DeepSeek / deepseek-v4-flash',
      available_models: [{ id: flashId, label: 'DeepSeek / deepseek-v4-flash' }],
    });

    expect(merged?.current_model_id).toBe(flashId);
    expect(merged?.available_models).toEqual([
      { id: flashId, label: 'DeepSeek / deepseek-v4-flash' },
      { id: proId, label: 'DeepSeek / deepseek-v4-pro' },
    ]);
  });
});
