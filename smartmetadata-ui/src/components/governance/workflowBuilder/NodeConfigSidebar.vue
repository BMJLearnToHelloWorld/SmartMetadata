<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Drawer } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_QUALITY_BANDS } from '@/constants/workflowBuilder';
import { listCustomProperties } from '@/api/customProperties';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import type { WorkflowNodeConfig } from '@/types/governance';
import {
  buildEntityFieldGroups,
  getGitSinkTriggerNodeConfig,
  getTriggerDataAssets,
  validateWorkflowConfig,
  withExtensionPrefix,
} from '@/utils/workflowConfig';
import {
  convertDisplayToBackendTriggerType,
  getInitialNodeConfig,
  isStartNode,
} from '@/utils/workflowNodeUtils';
import {
  reconcileDataAssetFilters,
  serializeDataAssetFilters,
  serializeEventBasedFilters,
  serializePeriodicBatchFilters,
} from '@/utils/workflowSerialization';
import FormActionButtons from './forms/FormActionButtons.vue';
import WorkflowConfigFormV1 from './forms/WorkflowConfigFormV1.vue';

/**
 * Official NodeConfigSidebar (pin a3012259ca): the 640px slideout for the
 * start node — WorkflowConfigFormV1 with the trigger-fields registry and
 * the workflow's custom properties as exclude-field options, git-sink
 * trigger narrowing, and a Save gated by validateWorkflowConfig. The
 * sidebar keeps its own local config (localName / localDescription /
 * localConfig); saving merges the backend defaults in (rules,
 * ruleTemplate 'hasDescription', fieldName 'tier', fieldValue
 * 'Tier.Tier1', qualityBands, fieldsToCheck ['columns.description'],
 * thresholds 1 — official's getBackendConfig, carried verbatim) and
 * stamps lastSaved / userModified.
 */
const builder = useWorkflowBuilderContext();
const { state, actions, mode, triggerFieldsConfig, hasGitSinkNode } = builder;
const { t } = useI18n();

const AVAILABLE_EVENT_TYPES = ['Created', 'Updated'];

const node = computed(() => state.state.selectedNode);
const isOpen = computed(() => state.state.isConfigSidebarOpen);
const workflowDefinition = computed(() => state.state.workflowDefinition);
const workflowMetadata = computed(() => state.state.workflowMetadata);

const isUpdating = ref(false);
const localName = ref<string | null>(null);
const localDescription = ref<string | null>(null);
const localConfig = ref<WorkflowNodeConfig | null>(null);
const customPropertyFields = ref<string[]>([]);

interface BackendConfig {
  rules?: unknown;
  ruleTemplate?: string;
  fieldName?: string;
  fieldValue?: string;
  qualityBands?: unknown;
  fieldsToCheck?: string[];
  approvalThreshold?: number;
  rejectionThreshold?: number;
}

function getBackendConfig(): BackendConfig {
  const nodeConfig = (node.value?.data?.config ?? {}) as Record<string, unknown>;
  return {
    rules: nodeConfig.rules,
    ruleTemplate: 'hasDescription',
    fieldName: (nodeConfig.fieldName as string) || 'tier',
    fieldValue: (nodeConfig.fieldValue as string) || 'Tier.Tier1',
    qualityBands: nodeConfig.qualityBands || DEFAULT_QUALITY_BANDS,
    fieldsToCheck: (nodeConfig.fieldsToCheck as string[]) || ['columns.description'],
    approvalThreshold: (nodeConfig.approvalThreshold as number) || 1,
    rejectionThreshold: (nodeConfig.rejectionThreshold as number) || 1,
  };
}

const backendConfig = ref<BackendConfig>(getBackendConfig());

const config = computed<WorkflowNodeConfig>(() => {
  const currentNode = node.value;
  if (!currentNode) {
    return getInitialNodeConfig(
      { id: '', type: 'startEvent', position: { x: 0, y: 0 }, data: {} },
      workflowDefinition.value,
      workflowMetadata.value,
    );
  }
  const base = getInitialNodeConfig(
    currentNode,
    workflowDefinition.value,
    workflowMetadata.value,
  );
  return {
    ...base,
    name: localName.value !== null ? localName.value : base.name,
    description:
      localDescription.value !== null ? localDescription.value : base.description,
  };
});

// A Git sink workflow's trigger keeps only the entity types the sink syncs,
// whichever order the trigger and the sink were configured in.
const effectiveConfig = computed<WorkflowNodeConfig>(() => {
  const current = localConfig.value || config.value;
  return hasGitSinkNode.value && isStartNode(node.value)
    ? getGitSinkTriggerNodeConfig(current)
    : current;
});

watch(
  () => effectiveConfig.value.dataAssets,
  (assets) => {
    if (!assets || assets.length === 0) {
      customPropertyFields.value = [];
      return;
    }
    void Promise.all(assets.map((asset) => listCustomProperties(asset)))
      .then((results) => {
        customPropertyFields.value = [
          ...new Set(results.flat().map((p) => withExtensionPrefix(p.name))),
        ];
      })
      .catch(() => {
        customPropertyFields.value = [];
      });
  },
  { immediate: true },
);

const availableExcludeFields = computed(() => {
  const assets = effectiveConfig.value.dataAssets ?? [];
  const entitySpecificFields = assets.flatMap(
    (asset) => triggerFieldsConfig.value.entitySpecific[asset] ?? [],
  );
  return [
    ...new Set([
      ...triggerFieldsConfig.value.common,
      ...entitySpecificFields,
      ...customPropertyFields.value,
    ]),
  ];
});

const workflowEntityTypes = computed(() =>
  getTriggerDataAssets(
    Object.keys(triggerFieldsConfig.value.entitySpecific),
    hasGitSinkNode.value,
  ),
);

const excludeFieldGroups = computed(() =>
  buildEntityFieldGroups(
    triggerFieldsConfig.value.entitySpecific,
    effectiveConfig.value.dataAssets ?? [],
  ),
);

watch(
  () => [
    node.value?.id,
    workflowDefinition.value?.id,
    workflowMetadata.value?.displayName,
    workflowMetadata.value?.description,
  ],
  () => {
    // A new node gets a fresh form: local edits belong to the previous node.
    localConfig.value = null;
    if (isStartNode(node.value)) {
      localName.value = null;
      localDescription.value = null;
    }
  },
);

// Closing the sidebar discards un-saved local edits (official's slideout
// unmounts on close, which resets the same state).
watch(isOpen, (open) => {
  if (!open) {
    localConfig.value = null;
    localName.value = null;
    localDescription.value = null;
  }
});

watch(
  () => node.value?.id,
  () => {
    backendConfig.value = getBackendConfig();
  },
);

function updateConfig<K extends keyof WorkflowNodeConfig>(
  key: K,
  value: WorkflowNodeConfig[K],
): void {
  const base = localConfig.value || effectiveConfig.value;
  if (key !== 'dataAssets') {
    localConfig.value = { ...base, [key]: value };
  } else {
    // Each filter is bound to the asset type it was created for.
    const assets = (value as string[]) ?? [];
    localConfig.value = {
      ...base,
      dataAssets: assets,
      dataAssetFilters: reconcileDataAssetFilters(
        base.dataAssetFilters,
        assets,
      ),
    };
  }
  if (key === 'name') {
    localName.value = value as string;
    return;
  }
  if (key === 'description') {
    localDescription.value = value as string;
  }
}

function removeFromArray<K extends keyof WorkflowNodeConfig>(
  key: K,
  itemToRemove: string,
): void {
  const currentArray = (effectiveConfig.value[key] as string[]) || [];
  localConfig.value = {
    ...(localConfig.value || effectiveConfig.value),
    [key]: currentArray.filter((item) => item !== itemToRemove),
  };
}

function addDataAssetFilter(dataAsset?: string): void {
  const existingDataAssets = effectiveConfig.value.dataAssetFilters.map(
    (df) => df.dataAsset,
  );
  const availableDataAssets = effectiveConfig.value.dataAssets.filter(
    (asset) => !existingDataAssets.includes(asset),
  );
  if (availableDataAssets.length === 0) {
    return;
  }
  const targetDataAsset =
    dataAsset && availableDataAssets.includes(dataAsset)
      ? dataAsset
      : availableDataAssets[0];
  const newId =
    effectiveConfig.value.dataAssetFilters.length > 0
      ? Math.max(
          ...effectiveConfig.value.dataAssetFilters.map((df) => df.id),
        ) + 1
      : 1;
  localConfig.value = {
    ...(localConfig.value || effectiveConfig.value),
    dataAssetFilters: [
      ...effectiveConfig.value.dataAssetFilters,
      { id: newId, dataAsset: targetDataAsset, filters: '' },
    ],
  };
}

function updateDataAssetFilter(dataAssetId: number, value: string): void {
  localConfig.value = {
    ...(localConfig.value || effectiveConfig.value),
    dataAssetFilters: effectiveConfig.value.dataAssetFilters.map((df) =>
      df.id === dataAssetId ? { ...df, filters: value } : df,
    ),
  };
}

function removeDataAssetFilter(filterId: number): void {
  localConfig.value = {
    ...(localConfig.value || effectiveConfig.value),
    dataAssetFilters: effectiveConfig.value.dataAssetFilters.filter(
      (df) => df.id !== filterId,
    ),
  };
}

function handleEventTypeChange(event: { target: { value: string[] } }): void {
  updateConfig('eventType', event.target.value);
}

function updateWorkflowMetadata(): void {
  const backendTriggerType = convertDisplayToBackendTriggerType(
    effectiveConfig.value.triggerType,
  );
  actions.handleWorkflowMetadataUpdate({
    displayName:
      localName.value !== null ? localName.value : effectiveConfig.value.name,
    description:
      (localDescription.value !== null
        ? localDescription.value
        : effectiveConfig.value.description) ?? '',
    triggerType: backendTriggerType,
  });
}

function buildTriggerConfiguration(): Record<string, unknown> {
  const isEventBased = effectiveConfig.value.triggerType === 'Event Based';
  const isPeriodicBatch = effectiveConfig.value.triggerType === 'Periodic Batch';
  let filterConfig: Record<string, unknown> = {};
  if (isEventBased) {
    // Always set filter — even when empty — so clearing the exclude filter
    // overwrites the stale value instead of leaving the old filter in place.
    filterConfig = {
      filter: serializeEventBasedFilters(
        effectiveConfig.value.triggerFilter || '',
        effectiveConfig.value.dataAssets,
      ),
    };
  } else if (isPeriodicBatch) {
    const periodicFilters = serializePeriodicBatchFilters(
      effectiveConfig.value.dataAssetFilters,
    );
    if (Object.keys(periodicFilters).length > 0) {
      filterConfig = { filters: periodicFilters };
    }
  }
  return {
    ...effectiveConfig.value,
    ...backendConfig.value,
    ...filterConfig,
  };
}

function buildTaskConfiguration(): Record<string, unknown> {
  return {
    ...effectiveConfig.value,
    ...backendConfig.value,
    displayName: effectiveConfig.value.name,
    filters: serializeDataAssetFilters(effectiveConfig.value.dataAssetFilters),
  };
}

async function handleSave(): Promise<void> {
  const currentNode = node.value;
  if (!currentNode) {
    return;
  }
  isUpdating.value = true;
  try {
    const isTriggerNode = isStartNode(currentNode);
    // OSS keeps the description editable; name and trigger type are locked in the form.
    if (isTriggerNode) {
      updateWorkflowMetadata();
    }
    const configToSave = isTriggerNode
      ? buildTriggerConfiguration()
      : buildTaskConfiguration();
    builder.handleNodeConfigSave(currentNode.id, {
      ...configToSave,
      lastSaved: new Date().toISOString(),
      userModified: true,
    });
    actions.handleConfigSidebarClose();
  } finally {
    isUpdating.value = false;
  }
}

const isWorkflowConfigValid = computed(() =>
  validateWorkflowConfig(effectiveConfig.value, isStartNode(node.value)),
);
</script>

<template>
  <Drawer
    :open="isOpen"
    placement="right"
    :width="640"
    :destroy-on-close="false"
    @close="actions.handleConfigSidebarClose"
  >
    <template #title>
      <span data-testid="node-config-title">{{ t('workflows.builder.startNodeConfiguration') }}</span>
    </template>
    <template v-if="node && isStartNode(node)">
      <div data-testid="node-config-content">
        <WorkflowConfigFormV1
          :config="effectiveConfig"
          :available-data-assets="workflowEntityTypes"
          :available-event-types="AVAILABLE_EVENT_TYPES"
          :available-exclude-fields="availableExcludeFields"
          :field-groups="excludeFieldGroups"
          :allow-full-start-node-configuration="mode.allowFullStartNodeConfiguration.value"
          :allow-start-node-filter-schedule-and-batch-edit="mode.allowStartNodeFilterScheduleAndBatchEdit.value"
          :allow-scheduled-trigger="mode.allowScheduledTrigger.value"
          :update-config="updateConfig"
          :remove-from-array="removeFromArray"
          :handle-event-type-change="handleEventTypeChange"
          :add-data-asset-filter="addDataAssetFilter"
          :on-update-data-asset-filter="updateDataAssetFilter"
          :remove-data-asset-filter="removeDataAssetFilter"
        />
      </div>
    </template>
    <template #footer>
      <FormActionButtons
        :show-save="true"
        :is-disabled="!isWorkflowConfigValid"
        :is-loading="isUpdating"
        :show-delete="false"
        :on-cancel="actions.handleConfigSidebarClose"
        :on-save="() => void handleSave()"
      />
    </template>
  </Drawer>
</template>
