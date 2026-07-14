/**
 * @license
 * Copyright 2025-2026 NomiFun (nomifun.com)
 * SPDX-License-Identifier: Apache-2.0
 * Based on AionUi (https://github.com/iOfficeAI/AionUi)
 */

export type ModelOptionLike = {
  value?: string;
  label?: string;
};

export function normalizeModelName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function modelOptionValues(options: readonly ModelOptionLike[] | undefined): string[] {
  return dedupeModelNames((options ?? []).map((option) => option.value ?? option.label ?? ''));
}

export function dedupeModelNames(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const name = normalizeModelName(value);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }

  return result;
}

export function buildProviderModelList({
  defaultModel,
  detectedModels = [],
  existingModels = [],
}: {
  defaultModel?: string;
  detectedModels?: Iterable<unknown>;
  existingModels?: Iterable<unknown>;
}): string[] {
  const preferred = normalizeModelName(defaultModel);
  const candidates = dedupeModelNames([...(detectedModels ?? []), ...(existingModels ?? [])]);

  if (!preferred) return candidates;
  return [preferred, ...candidates.filter((model) => model !== preferred)];
}
