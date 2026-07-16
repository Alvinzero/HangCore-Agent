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

function decodeKunProviderModelId(modelId: string): { providerId: string; modelName: string } | null {
  const raw = modelId.trim().startsWith(KUN_PROVIDER_MODEL_PREFIX)
    ? modelId.trim().slice(KUN_PROVIDER_MODEL_PREFIX.length)
    : '';
  const separator = raw.indexOf(':');
  if (separator <= 0) return null;

  const providerId = raw.slice(0, separator).trim();
  const modelName = raw.slice(separator + 1).trim();
  if (!providerId || !modelName) return null;
  return { providerId, modelName };
}

function findKunProviderModel(info: AcpModelInfo, modelId?: string | null) {
  const normalized = typeof modelId === 'string' ? modelId.trim() : '';
  if (!normalized) return undefined;

  const exact = info.available_models.find((model) => model.id === normalized);
  if (exact) return exact;

  return info.available_models.find((model) => decodeKunProviderModelId(model.id)?.modelName === normalized);
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

export function mergeKunProviderModelInfo(
  providerModelInfo: AcpModelInfo | null,
  runtimeModelInfo?: AcpModelInfo | null,
  fallbackModelId?: string | null
): AcpModelInfo | null {
  if (!providerModelInfo) return runtimeModelInfo ?? null;

  const current =
    findKunProviderModel(providerModelInfo, runtimeModelInfo?.current_model_id) ??
    findKunProviderModel(providerModelInfo, fallbackModelId) ??
    findKunProviderModel(providerModelInfo, providerModelInfo.current_model_id) ??
    providerModelInfo.available_models[0];

  return {
    ...providerModelInfo,
    current_model_id: current?.id ?? providerModelInfo.current_model_id,
    current_model_label: current?.label ?? current?.id ?? providerModelInfo.current_model_label,
  };
}
