import { ipcBridge } from '@/common';
import { GOOGLE_AUTH_PROVIDER_ID } from '@/common/config/constants';
import type { IProvider } from '@/common/config/storage';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';
import { useGoogleAuthModels } from './useGoogleAuthModels';
import { hasSpecificModelCapability } from '@/renderer/utils/model/modelCapabilities';
import { buildProviderModelList, dedupeModelNames } from '@/renderer/utils/model/providerModelDefaults';

export interface ModelProviderListResult {
  providers: IProvider[];
  isGoogleAuth: boolean;
  getAvailableModels: (provider: IProvider) => string[];
  formatModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
}

export const PROVIDERS_SWR_KEY = 'providers';

// Provider config is local application state. Keep it stable after the initial
// load and refresh only through explicit mutate() calls after CRUD operations.
export const PROVIDERS_SWR_OPTIONS: SWRConfiguration<IProvider[], Error> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

export const fetchProviders = async (): Promise<IProvider[]> => {
  return (await ipcBridge.mode.listProviders.invoke()) ?? [];
};

export const useProvidersQuery = (enabled = true) => {
  return useSWR<IProvider[]>(enabled ? PROVIDERS_SWR_KEY : null, fetchProviders, PROVIDERS_SWR_OPTIONS);
};

type DetectedProviderModels = Record<string, string[]>;

const PROVIDER_MODEL_DISCOVERY_SWR_OPTIONS: SWRConfiguration<DetectedProviderModels, Error> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
};

const providerRefreshFingerprint = (provider: IProvider): string => {
  const updatedAt = (provider as IProvider & { updated_at?: number | string }).updated_at ?? '';
  const keyMarker = provider.api_key ? `${provider.api_key.length}:${provider.api_key.slice(0, 2)}:${provider.api_key.slice(-2)}` : 'no-key';
  return [
    provider.id,
    provider.platform,
    provider.base_url,
    provider.is_full_url ? 'full' : 'base',
    updatedAt,
    keyMarker,
    (provider.models ?? []).join(','),
  ].join(':');
};

const modelIdsFromFetchResponse = (models: Array<string | { id: string; name: string }>): string[] =>
  dedupeModelNames(models.map((model) => (typeof model === 'string' ? model : model.id)));

/**
 * Shared hook that builds the provider list (including Google Auth)
 * and exposes helpers consumed by both conversation and channel settings.
 */
export const useModelProviderList = ({ enabled = true }: { enabled?: boolean } = {}): ModelProviderListResult => {
  const { isGoogleAuth } = useGoogleAuthModels({ enabled });

  const { data: modelConfig } = useProvidersQuery(enabled);

  const modelDiscoveryKey = useMemo(() => {
    if (!enabled) return null;
    const configured = (modelConfig ?? []).filter((provider) => provider.enabled !== false);
    if (configured.length === 0) return null;
    return ['providers:auto-detected-models', configured.map(providerRefreshFingerprint).join('|')] as const;
  }, [enabled, modelConfig]);

  const { data: detectedModelsByProvider } = useSWR<DetectedProviderModels>(
    modelDiscoveryKey,
    async () => {
      const entries = await Promise.all(
        (modelConfig ?? []).map(async (provider): Promise<[string, string[]]> => {
          if (provider.enabled === false || provider.is_full_url) return [provider.id, []];

          const hasCredentials = provider.platform === 'bedrock' ? !!provider.bedrock_config : !!provider.api_key;
          if (!hasCredentials) return [provider.id, []];

          try {
            const response = await ipcBridge.mode.fetchModelList.invoke({
              platform: provider.platform,
              base_url: provider.base_url,
              api_key: provider.platform === 'bedrock' ? '' : provider.api_key,
              bedrock_config: provider.bedrock_config,
              try_fix: true,
            });
            return [provider.id, modelIdsFromFetchResponse(response.models ?? [])];
          } catch (error) {
            console.warn('[useModelProviderList] failed to auto-detect provider models', provider.id, error);
            return [provider.id, []];
          }
        })
      );

      return Object.fromEntries(entries);
    },
    PROVIDER_MODEL_DISCOVERY_SWR_OPTIONS
  );

  // Mutable cache for available-model filtering
  const available_modelsCacheRef = useRef(new Map<string, string[]>());

  // 当 modelConfig 变化时清除缓存
  useEffect(() => {
    available_modelsCacheRef.current.clear();
  }, [modelConfig]);

  const getAvailableModels = useCallback((provider: IProvider): string[] => {
    // 包含 model_enabled 状态到缓存 key 中
    const model_enabledKey = provider.model_enabled ? JSON.stringify(provider.model_enabled) : 'all-enabled';
    const cacheKey = `${provider.id}-${(provider.models || []).join(',')}-${model_enabledKey}`;
    const cache = available_modelsCacheRef.current;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }
    const result: string[] = [];
    for (const modelName of provider.models || []) {
      // 检查模型是否被禁用（默认为启用）
      const isModelEnabled = provider.model_enabled?.[modelName] !== false;
      if (!isModelEnabled) continue;

      const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
      const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');
      if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
        result.push(modelName);
      }
    }
    cache.set(cacheKey, result);
    return result;
  }, []);

  const providers = useMemo(() => {
    if (!enabled) return [];
    let list: IProvider[] = Array.isArray(modelConfig) ? modelConfig : [];
    // 过滤掉被禁用的 provider（默认为启用）
    list = list.filter((p) => p.enabled !== false);
    list = list.map((provider) => {
      const detectedModels = detectedModelsByProvider?.[provider.id] ?? [];
      if (detectedModels.length === 0) return provider;

      return {
        ...provider,
        models: buildProviderModelList({
          defaultModel: provider.models?.[0],
          detectedModels,
          existingModels: provider.models,
        }),
      };
    });

    if (isGoogleAuth) {
      const googleProvider: IProvider = {
        id: GOOGLE_AUTH_PROVIDER_ID,
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        base_url: '',
        api_key: '',
        model: [],
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
        enabled: true, // Google Auth provider 始终启用
      } as unknown as IProvider;
      list = [googleProvider, ...list];
    }
    // 过滤掉没有可用模型的 provider
    return list.filter((p) => getAvailableModels(p).length > 0);
  }, [detectedModelsByProvider, enabled, getAvailableModels, isGoogleAuth, modelConfig]);

  const formatModelLabel = useCallback((_provider: { platform?: string } | undefined, modelName?: string) => {
    if (!modelName) return '';
    return modelName;
  }, []);

  return { providers, isGoogleAuth, getAvailableModels, formatModelLabel };
};
