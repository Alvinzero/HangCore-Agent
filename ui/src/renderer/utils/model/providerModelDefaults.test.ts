import { describe, expect, test } from 'bun:test';
import { buildProviderModelList, modelOptionValues } from './providerModelDefaults';

describe('buildProviderModelList', () => {
  test('keeps the selected model as default and appends all detected provider models', () => {
    expect(
      buildProviderModelList({
        defaultModel: 'deepseek-v4-flash',
        detectedModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
      })
    ).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
  });

  test('preserves existing models when live detection is unavailable', () => {
    expect(
      buildProviderModelList({
        defaultModel: 'model-b',
        detectedModels: [],
        existingModels: ['model-a', 'model-b'],
      })
    ).toEqual(['model-b', 'model-a']);
  });

  test('normalizes empty and duplicate option values', () => {
    expect(modelOptionValues([{ value: ' a ' }, { value: 'a' }, { label: 'b' }, { value: '' }])).toEqual(['a', 'b']);
  });
});
