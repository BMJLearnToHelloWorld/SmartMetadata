<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Input, Select, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { SCHEDULAR_OPTIONS, WORKFLOW_TYPES } from '@/constants/workflowBuilder';
import {
  EXTENSION_FIELD_PREFIX,
  getFieldDisplayLabel,
  getFieldLabel,
} from '@/utils/workflowConfig';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import WorkflowFormField from './WorkflowFormField.vue';
import CronExpressionBuilder from './CronExpressionBuilder.vue';

/**
 * Official TriggerConfigSection (pin a3012259ca): trigger type, then the
 * event-based fields (event types, include/exclude field multi-selects)
 * or the periodic fields (schedule type, cron builder when Scheduled,
 * batch size). The include/exclude options are ordered common fields
 * first, then entity-specific fields (labelled with their entity type),
 * then custom properties (labelled "Custom Property"); the label shown
 * for a custom property is `Name (Custom Property)`.
 */
const props = withDefaults(
  defineProps<{
    triggerType: string;
    eventType: string[];
    availableEventTypes: string[];
    onTriggerTypeChange: (triggerType: string) => void;
    onEventTypeChange: (event: { target: { value: string[] } }) => void;
    onRemoveEventType: (eventType: string) => void;
    excludeFields?: string[];
    availableExcludeFields?: string[];
    fieldGroups?: Record<string, string>;
    onExcludeFieldsChange?: (excludeFields: string[]) => void;
    onRemoveExcludeField?: (fieldToRemove: string) => void;
    include?: string[];
    onIncludeChange?: (include: string[]) => void;
    onRemoveInclude?: (fieldToRemove: string) => void;
    scheduleType?: string;
    cronExpression?: string;
    batchSize?: number;
    onScheduleTypeChange?: (scheduleType: string) => void;
    onCronExpressionChange?: (cron: string) => void;
    onBatchSizeChange?: (batchSize: number) => void;
    lockNonIncludeExcludeFields?: boolean;
    lockPeriodicBatchFields?: boolean;
    lockScheduleTypeField?: boolean;
  }>(),
  {
    excludeFields: () => [],
    availableExcludeFields: () => [],
    fieldGroups: () => ({}),
    onExcludeFieldsChange: undefined,
    onRemoveExcludeField: undefined,
    include: () => [],
    onIncludeChange: undefined,
    onRemoveInclude: undefined,
    scheduleType: '',
    cronExpression: '',
    batchSize: 100,
    onScheduleTypeChange: undefined,
    onCronExpressionChange: undefined,
    onBatchSizeChange: undefined,
    lockNonIncludeExcludeFields: false,
    lockPeriodicBatchFields: undefined,
    lockScheduleTypeField: undefined,
  },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

const nonIncludeExcludeDisabled = computed(
  () => isFormDisabled.value || props.lockNonIncludeExcludeFields,
);
const periodicBatchDisabled = computed(
  () =>
    isFormDisabled.value ||
    (props.lockPeriodicBatchFields ?? props.lockNonIncludeExcludeFields),
);
const scheduleTypeDisabled = computed(
  () =>
    isFormDisabled.value ||
    (props.lockScheduleTypeField ??
      props.lockPeriodicBatchFields ??
      props.lockNonIncludeExcludeFields),
);
const includeExcludeDisabled = computed(() => isFormDisabled.value);

const triggerTypeOptions = [
  { label: t('workflows.builder.eventBased'), value: 'Event Based' },
  { label: t('workflows.builder.periodicBatch'), value: 'Periodic Batch' },
];
const scheduleTypeOptions = [
  { label: t('workflows.builder.onDemand'), value: 'OnDemand' },
  { label: t('workflows.builder.scheduled'), value: 'Scheduled' },
];

interface FieldItem {
  value: string;
  label: string;
  supportingText?: string;
}

const fieldItems = computed<FieldItem[]>(() => {
  const items = props.availableExcludeFields.map((v) => {
    if (v.startsWith(EXTENSION_FIELD_PREFIX)) {
      return {
        value: v,
        label: getFieldLabel(v),
        supportingText: t('workflows.builder.customProperty'),
        sortRank: 2,
        sortKey: v,
      };
    }
    const entityGroup = props.fieldGroups[v];
    if (entityGroup) {
      return {
        value: v,
        label: v,
        supportingText: entityGroup,
        sortRank: 1,
        sortKey: `${entityGroup}:${v}`,
      };
    }
    return { value: v, label: v, sortRank: 0, sortKey: v };
  });
  return items
    .sort((a, b) =>
      a.sortRank === b.sortRank
        ? a.sortKey.localeCompare(b.sortKey)
        : a.sortRank - b.sortRank,
    )
    .map(({ value, label, supportingText }) => ({ value, label, supportingText }));
});

function fieldOptionLabel(value: string): string {
  return getFieldDisplayLabel(value, (key: string) => t(key));
}
</script>

<template>
  <div style="margin-bottom: 24px" data-testid="trigger-config-section">
    <div data-testid="trigger-header">
      <Typography.Text type="secondary" style="font-size: 14px; font-weight: 500">
        {{ t('workflows.builder.trigger') }}
      </Typography.Text>
    </div>
    <Typography.Paragraph type="secondary" style="margin: 0 0 24px; font-size: 12px; font-weight: 500">
      {{ t('workflows.builder.selectWhenExecuteWorkflow') }}
    </Typography.Paragraph>

    <div style="margin-top: 8px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ t('workflows.builder.triggerType') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Select
        :value="triggerType"
        data-testid="trigger-type-select"
        :disabled="nonIncludeExcludeDisabled"
        :options="triggerTypeOptions"
        style="width: 100%"
        @change="(key) => onTriggerTypeChange(String(key ?? ''))"
      />
    </div>

    <template v-if="triggerType === WORKFLOW_TYPES.EVENT_BASED">
      <div style="margin-top: 24px">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.eventType') }}
          <span style="color: var(--sm-color-error)">*</span>
        </label>
        <Select
          mode="multiple"
          :value="eventType"
          data-testid="event-type-select"
          :disabled="nonIncludeExcludeDisabled"
          :options="availableEventTypes.map((v) => ({ value: v, label: v }))"
          :placeholder="t('workflows.builder.selectEventTypes')"
          style="width: 100%"
          @change="(values) => onEventTypeChange({ target: { value: values as string[] } })"
        />
      </div>

      <div style="margin-top: 24px">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.includeFields') }}
        </label>
        <Select
          mode="multiple"
          :value="include"
          data-testid="include-fields-select"
          :disabled="includeExcludeDisabled"
          :placeholder="t('workflows.builder.selectFieldsToInclude')"
          style="width: 100%"
          @change="(values) => onIncludeChange?.(values as string[])"
        >
          <Select.Option
            v-for="item in fieldItems"
            :key="item.value"
            :value="item.value"
            :label="fieldOptionLabel(item.value)"
          >
            <span style="display: flex; justify-content: space-between; width: 100%">
              <span>{{ fieldOptionLabel(item.value) }}</span>
              <span v-if="item.supportingText" style="color: var(--sm-text-secondary); font-size: 12px; flex-shrink: 0">
                {{ item.supportingText }}
              </span>
            </span>
          </Select.Option>
        </Select>
      </div>

      <div style="margin-top: 24px">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.excludeFields') }}
        </label>
        <Select
          mode="multiple"
          :value="excludeFields"
          data-testid="exclude-fields-select"
          :disabled="includeExcludeDisabled"
          :placeholder="t('workflows.builder.selectFieldsToExclude')"
          style="width: 100%"
          @change="(values) => onExcludeFieldsChange?.(values as string[])"
        >
          <Select.Option
            v-for="item in fieldItems"
            :key="item.value"
            :value="item.value"
            :label="fieldOptionLabel(item.value)"
          >
            <span style="display: flex; justify-content: space-between; width: 100%">
              <span>{{ fieldOptionLabel(item.value) }}</span>
              <span v-if="item.supportingText" style="color: var(--sm-text-secondary); font-size: 12px; flex-shrink: 0">
                {{ item.supportingText }}
              </span>
            </span>
          </Select.Option>
        </Select>
      </div>
    </template>

    <template v-if="triggerType === WORKFLOW_TYPES.PERIODIC_BATCH">
      <div style="margin-top: 24px">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">
          {{ t('workflows.builder.scheduleType') }}
          <span style="color: var(--sm-color-error)">*</span>
        </label>
        <Select
          :value="scheduleType"
          data-testid="schedule-type-select"
          :disabled="scheduleTypeDisabled"
          style="width: 100%"
          @change="(key) => onScheduleTypeChange?.(String(key ?? ''))"
        >
          <Select.Option
            v-for="opt in scheduleTypeOptions"
            :key="opt.value"
            :value="opt.value"
            :data-testid="opt.value === 'OnDemand' ? 'schedule-type-on-demand' : 'schedule-type-scheduled'"
          >
            {{ opt.label }}
          </Select.Option>
        </Select>
        <Typography.Text type="secondary" style="display: block; margin-top: 4px; font-size: 12px">
          {{ t('workflows.builder.chooseHowWorkflowShouldBeTriggered') }}
        </Typography.Text>

        <WorkflowFormField
          v-if="scheduleType === SCHEDULAR_OPTIONS.SCHEDULE"
          style="margin-top: 24px"
          :label="t('workflows.builder.schedule')"
          :description="t('workflows.builder.defineWhenWorkflowShouldRun')"
        >
          <div style="margin-bottom: 24px">
            <CronExpressionBuilder
              :force-disabled="periodicBatchDisabled"
              :value="cronExpression"
              :on-change="onCronExpressionChange"
            />
          </div>
        </WorkflowFormField>

        <div style="margin-top: 24px">
          <label style="display: block; margin-bottom: 4px; font-size: 14px">
            {{ t('workflows.builder.batchSize') }}
          </label>
          <Input
            data-testid="batch-size-input"
            type="number"
            :disabled="periodicBatchDisabled"
            placeholder="100"
            :value="batchSize === 0 ? '' : String(batchSize)"
            style="width: 100%"
            @update:value="(value) => onBatchSizeChange?.(value === '' ? 0 : parseInt(value as string) || 100)"
          />
          <Typography.Text type="secondary" style="display: block; margin-top: 4px; font-size: 12px">
            {{ t('workflows.builder.numberOfEntitiesPerBatch') }}
          </Typography.Text>
        </div>
      </div>
    </template>
  </div>
</template>
