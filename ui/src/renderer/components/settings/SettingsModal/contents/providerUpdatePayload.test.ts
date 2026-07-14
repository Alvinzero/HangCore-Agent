import { describe, expect, test } from 'bun:test';
import type { IProvider } from '@/common/config/storage';
import { buildProviderUpdateRequest } from './providerUpdatePayload';

const provider = (overrides: Partial<IProvider> = {}): IProvider =>
  ({
    id: 'deepseek',
    platform: 'openai',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    api_key: 'sk-old',
    models: ['deepseek-chat'],
    enabled: true,
    capabilities: [],
    ...overrides,
  }) as IProvider;

describe('buildProviderUpdateRequest', () => {
  test('does not clear existing models when a stale form saves only credentials', () => {
    const existing = provider();
    const staleDraft = provider({
      api_key: 'sk-new',
      models: [],
    });

    const payload = buildProviderUpdateRequest(staleDraft, existing);

    expect(payload.id).toBe('deepseek');
    expect(payload.api_key).toBe('sk-new');
    expect('models' in payload).toBe(false);
  });

  test('includes models for explicit model-list changes', () => {
    const existing = provider();
    const changed = provider({
      models: ['deepseek-chat', 'deepseek-reasoner'],
    });

    const payload = buildProviderUpdateRequest(changed, existing, { includeModels: true });

    expect(payload.models).toEqual(['deepseek-chat', 'deepseek-reasoner']);
  });
});
