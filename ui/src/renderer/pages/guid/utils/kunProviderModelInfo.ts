/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 * Based on AionUi (https://github.com/iOfficeAI/AionUi)
 */

import type { IProvider } from '@/common/config/storage';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from './modelUtils';

const KUN_PROVIDER_MODEL_PREFIX = 'provider:';

export function encodeKunProviderModelId(providerId: string, modelName: string): string {
  return `${KUN_PROVIDER_MODEL_PREFIX}${providerId}:${modelName}`;
}

export function buildKunProviderModelInfo(modelList: IProvider[]): AcpModelInfo | null {
  const available_models = modelList
    .filter((provider) => provider.enabled !== false)
    .flatMap((provider) =>
      getAvailableModels(provider).map((modelName) => ({
        id: encodeKunProviderModelId(provider.id, modelName),
        label: `${provider.name} / ${modelName}`,
      }))
    );

  if (available_models.length === 0) return null;
  const current = available_models[0];
  return {
    current_model_id: current.id,
    current_model_label: current.label,
    available_models,
  };
}
