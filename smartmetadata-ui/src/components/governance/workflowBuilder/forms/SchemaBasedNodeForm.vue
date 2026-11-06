<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Input, Switch, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import { getWorkflowNodeConfigSchema } from '@/utils/workflowNodeSchemas';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official SchemaBasedNodeForm (pin a3012259ca): the READ-ONLY fallback
 * for the 8 subtypes without a dedicated form (runAppTask,
 * setGlossaryTermStatusTask, setEntityCertificationTask,
 * applyRecognizerFeedbackTask, rejectRecognizerFeedbackTask,
 * createAndRunIngestionPipelineTask, policyAgentTask,
 * createRecognizerFeedbackApprovalTask). Every stored config entry renders
 * with its schema title (or the key when the schema has none): boolean →
 * disabled switch, object → disabled JSON textarea, else disabled input.
 * No save — Cancel reads 'Close'.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onClose: () => void;
}>();

const { t } = useI18n();

const subType = computed(
  () => props.node.data?.subType ?? props.node.data?.nodeSubType ?? '',
);
const schemaProperties = computed(() =>
  getWorkflowNodeConfigSchema(subType.value),
);
const configData = computed<Record<string, unknown>>(
  () => (props.node.data?.config as Record<string, unknown>) ?? {},
);
const configEntries = computed(() =>
  Object.keys(configData.value).map((key) => ({
    key,
    title: schemaProperties.value[key]?.title ?? key,
    type: schemaProperties.value[key]?.type,
    value: configData.value[key],
  })),
);

function isBooleanEntry(entry: { type?: string; value: unknown }): boolean {
  return entry.type === 'boolean' || typeof entry.value === 'boolean';
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :lock-fields="true"
      :is-start-node="false"
      :name="node.data?.displayName ?? node.data?.label ?? ''"
      :description="node.data?.description ?? ''"
      :on-name-change="() => {}"
      :on-description-change="() => {}"
    />
    <div v-for="entry in configEntries" :key="entry.key" style="margin-bottom: 24px">
      <div v-if="isBooleanEntry(entry)" style="display: flex; flex-direction: column; gap: 8px">
        <Typography.Text type="secondary" style="font-size: 12px; font-weight: 500">
          {{ entry.title }}
        </Typography.Text>
        <Switch :checked="Boolean(entry.value)" disabled @change="() => {}" />
      </div>
      <div v-else-if="typeof entry.value === 'object' && entry.value !== null">
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ entry.title }}</label>
        <Input.TextArea
          :rows="3"
          disabled
          :value="JSON.stringify(entry.value, null, 2)"
          @update:value="() => {}"
        />
      </div>
      <div v-else>
        <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ entry.title }}</label>
        <Input disabled :value="String(entry.value ?? '')" @update:value="() => {}" />
      </div>
    </div>
    <div style="flex: 1" />
    <FormActionButtons
      :cancel-label="t('crud.close')"
      :show-save="false"
      :on-cancel="onClose"
      :on-save="() => {}"
    />
  </div>
</template>
