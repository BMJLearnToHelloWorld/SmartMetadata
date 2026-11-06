<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';
import QueryBuilderSection from './QueryBuilderSection.vue';

/**
 * Official CheckConditionForm (pin a3012259ca): name + description + the
 * rules to check (a QueryBuilderSection with JSONLogic output over the
 * workflow's first entity type, 'all' when unset). The stored rules are a
 * string; an empty stored string leaves the editor empty.
 */
const props = defineProps<{
  entityTypes: string[];
  node: WorkflowFlowNode;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}>();

const { t } = useI18n();
const displayName = ref('');
const description = ref('');
const rules = ref<string | undefined>(undefined);

function syncFromNode(): void {
  const nodeConfig = (props.node.data?.config ?? {}) as Record<string, unknown>;
  displayName.value = props.node.data?.displayName || props.node.data?.label || '';
  description.value = props.node.data?.description || '';
  const existingRules = nodeConfig.rules;
  if (typeof existingRules === 'string' && existingRules.trim() !== '') {
    rules.value = existingRules;
  }
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function handleSave(): void {
  props.onSave(
    props.node.id,
    createNodeConfig({
      config: { rules: rules.value },
      description: description.value,
      displayName: displayName.value,
      subType: 'checkEntityAttributesTask',
      type: 'automatedTask',
    }),
  );
  props.onClose();
}

function handleDeleteNode(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="displayName"
      :description="description"
      :on-name-change="(value) => { displayName = value; }"
      :on-description-change="(value) => { description = value; }"
    />
    <QueryBuilderSection
      :label="t('workflows.builder.rulesToCheck')"
      :value="rules ?? ''"
      :on-change="(query) => { rules = query; }"
    />
    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="!isValidString(displayName)"
      :on-cancel="onClose"
      :on-delete="handleDeleteNode"
      :on-save="handleSave"
    />
  </div>
</template>
