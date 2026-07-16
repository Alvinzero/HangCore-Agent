import type { AcpModelInfo } from '@/common/types/platform/acpTypes';

export type AcpModelMenuItem = {
  id: string;
  label: string;
  selected: boolean;
};

export type AcpModelMenuGroup = {
  key: string;
  title: string;
  items: AcpModelMenuItem[];
};

type AcpModelEntry = AcpModelInfo['available_models'][number];

function splitProviderModelLabel(model: AcpModelEntry): { providerTitle: string; modelLabel: string } {
  const label = (model.label || model.id).trim();
  const separator = label.indexOf(' / ');
  if (separator > 0) {
    const providerTitle = label.slice(0, separator).trim();
    const modelLabel = label.slice(separator + 3).trim();
    if (providerTitle && modelLabel) return { providerTitle, modelLabel };
  }

  return { providerTitle: '', modelLabel: label };
}

export function buildAcpModelMenuGroups({
  currentModelId,
  models,
}: {
  currentModelId?: string | null;
  models: AcpModelEntry[];
}): AcpModelMenuGroup[] {
  const groups: AcpModelMenuGroup[] = [];
  const groupIndex = new Map<string, AcpModelMenuGroup>();

  for (const model of models) {
    const { providerTitle, modelLabel } = splitProviderModelLabel(model);
    const groupKey = providerTitle || '__ungrouped__';
    let group = groupIndex.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        title: providerTitle,
        items: [],
      };
      groupIndex.set(groupKey, group);
      groups.push(group);
    }

    group.items.push({
      id: model.id,
      label: modelLabel,
      selected: model.id === currentModelId,
    });
  }

  return groups;
}
