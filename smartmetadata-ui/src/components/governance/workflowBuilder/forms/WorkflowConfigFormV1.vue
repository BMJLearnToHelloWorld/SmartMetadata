<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { WorkflowNodeConfig } from '@/types/governance';
import { WORKFLOW_TYPES } from '@/constants/workflowBuilder';
import MetadataFormSection from './MetadataFormSection.vue';
import DataAssetFormSection from './DataAssetFormSection.vue';
import DataAssetFiltersSection from './DataAssetFiltersSection.vue';
import TriggerConfigSection from './TriggerConfigSection.vue';
import EventTriggerFilterSection from './EventTriggerFilterSection.vue';
import ApprovalModeSection from './ApprovalModeSection.vue';

/**
 * Official WorkflowConfigFormV1 (pin a3012259ca): the start-node form —
 * metadata, data assets, per-asset filters (periodic only), trigger
 * config, event exclude filter + approval mode (event-based only).
 * Locking: core start fields lock unless allowFullStartNodeConfiguration
 * (false in OSS — name, trigger type, data assets are locked); filter and
 * periodic-batch fields lock unless either allowFullStartNodeConfiguration
 * or allowStartNodeFilterScheduleAndBatchEdit (true in OSS — filters,
 * schedule type is locked by allowScheduledTrigger=false, but cron +
 * batch size stay editable).
 */
const props = defineProps<{
  config: WorkflowNodeConfig;
  availableDataAssets: string[];
  availableEventTypes: string[];
  availableExcludeFields: string[];
  fieldGroups?: Record<string, string>;
  allowFullStartNodeConfiguration: boolean;
  allowStartNodeFilterScheduleAndBatchEdit: boolean;
  allowScheduledTrigger: boolean;
  updateConfig: <K extends keyof WorkflowNodeConfig>(
    key: K,
    value: WorkflowNodeConfig[K],
  ) => void;
  removeFromArray: <K extends keyof WorkflowNodeConfig>(
    key: K,
    itemToRemove: string,
  ) => void;
  handleEventTypeChange: (event: { target: { value: string[] } }) => void;
  addDataAssetFilter: (dataAsset?: string) => void;
  onUpdateDataAssetFilter: (dataAssetId: number, value: string) => void;
  removeDataAssetFilter: (filterId: number) => void;
}>();

const lockCoreStartFields = !props.allowFullStartNodeConfiguration;
const canEditFiltersAndPeriodicSchedule =
  props.allowFullStartNodeConfiguration ||
  props.allowStartNodeFilterScheduleAndBatchEdit;
const lockFilterSections = !canEditFiltersAndPeriodicSchedule;

function getEventTriggerEntityType(dataAssets: string[] | undefined): string {
  if (dataAssets?.length === 1) {
    return dataAssets[0];
  }
  return 'all';
}
</script>

<template>
  <div data-testid="workflow-config-form-v1">
    <MetadataFormSection
      is-start-node
      :name="config.name"
      :description="config.description"
      :lock-fields="lockCoreStartFields"
      :lock-description-field="false"
      :on-name-change="(name) => updateConfig('name', name)"
      :on-description-change="(description) => updateConfig('description', description)"
    />

    <DataAssetFormSection
      :available-data-assets="availableDataAssets"
      :data-assets="config.dataAssets"
      :lock-fields="lockCoreStartFields"
      :on-data-assets-change="(dataAssets) => updateConfig('dataAssets', dataAssets)"
      :on-remove-data-asset="(asset) => removeFromArray('dataAssets', asset)"
    />

    <DataAssetFiltersSection
      v-if="config.triggerType === WORKFLOW_TYPES.PERIODIC_BATCH"
      :data-asset-filters="config.dataAssetFilters || []"
      :data-assets="config.dataAssets || []"
      :lock-fields="lockFilterSections"
      :on-add-data-asset-filter="addDataAssetFilter"
      :on-remove-data-asset-filter="removeDataAssetFilter"
      :on-update-data-asset-filter="onUpdateDataAssetFilter"
    />

    <TriggerConfigSection
      :trigger-type="config.triggerType"
      :event-type="config.eventType"
      :available-event-types="availableEventTypes"
      :exclude-fields="config.excludeFields"
      :available-exclude-fields="availableExcludeFields"
      :field-groups="fieldGroups"
      :include="config.include"
      :schedule-type="config.scheduleType"
      :cron-expression="config.cronExpression"
      :batch-size="config.batchSize"
      :lock-non-include-exclude-fields="lockCoreStartFields"
      :lock-periodic-batch-fields="lockFilterSections"
      :lock-schedule-type-field="!allowScheduledTrigger"
      :on-trigger-type-change="(triggerType) => updateConfig('triggerType', triggerType)"
      :on-event-type-change="handleEventTypeChange"
      :on-remove-event-type="(eventType) => removeFromArray('eventType', eventType)"
      :on-exclude-fields-change="(excludeFields) => updateConfig('excludeFields', excludeFields)"
      :on-remove-exclude-field="(fieldToRemove) => removeFromArray('excludeFields', fieldToRemove)"
      :on-include-change="(include) => updateConfig('include', include)"
      :on-remove-include="(fieldToRemove) => removeFromArray('include', fieldToRemove)"
      :on-schedule-type-change="(scheduleType) => updateConfig('scheduleType', scheduleType)"
      :on-cron-expression-change="(cron) => updateConfig('cronExpression', cron)"
      :on-batch-size-change="(batchSize) => updateConfig('batchSize', batchSize)"
    />

    <EventTriggerFilterSection
      v-if="config.triggerType === WORKFLOW_TYPES.EVENT_BASED"
      :entity-type="getEventTriggerEntityType(config.dataAssets)"
      :lock-fields="lockFilterSections"
      :trigger-filter="config.triggerFilter"
      :on-trigger-filter-change="(filter) => updateConfig('triggerFilter', filter)"
    />

    <ApprovalModeSection
      v-if="config.triggerType === WORKFLOW_TYPES.EVENT_BASED"
      :approval-mode="config.approvalMode"
      :lock-fields="lockFilterSections"
      :on-approval-mode-change="(approvalMode) => updateConfig('approvalMode', approvalMode)"
    />
  </div>
</template>
