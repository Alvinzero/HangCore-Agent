/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 * Based on AionUi (https://github.com/iOfficeAI/AionUi)
 */

import type { IProvider } from '@/common/config/storage';
import type { UpdateProviderRequest } from '@/common/types/provider/providerApi';

export type ProviderUpdateRequestWithId = { id: string } & UpdateProviderRequest;

type BuildProviderUpdateOptions = {
  /** Set only from explicit add/edit/remove model flows. */
  includeModels?: boolean;
};

export function buildProviderUpdateRequest(
  platform: IProvider,
  existing?: IProvider,
  options: BuildProviderUpdateOptions = {}
): ProviderUpdateRequestWithId {
  const { id, ...body } = platform;
  const payload: ProviderUpdateRequestWithId = { id, ...body };

  if (!shouldIncludeModels(platform, existing, options)) {
    delete payload.models;
  }

  return payload;
}

function shouldIncludeModels(
  platform: IProvider,
  existing: IProvider | undefined,
  options: BuildProviderUpdateOptions
): boolean {
  if (options.includeModels === true) return true;
  if (!Array.isArray(platform.models)) return false;

  // A stale renderer cache can briefly carry `models: []` while credentials or
  // status fields are being saved. Treat that as "models not part of this
  // update" unless a model-editing flow explicitly opted in.
  if ((platform.models?.length ?? 0) === 0 && (existing?.models?.length ?? 0) > 0) {
    return false;
  }

  return false;
}
