<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { WorkflowFlowNode } from '@/types/governance';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official EndNodeForm (pin a3012259ca): name (default 'End') +
 * description; saves a node config with subType/type 'endEvent'.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}>();

const displayName = ref('End');
const description = ref('');

function syncFromNode(): void {
  displayName.value =
    props.node.data?.displayName || props.node.data?.label || 'End';
  description.value = props.node.data?.description || '';
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function handleSave(): void {
  props.onSave(
    props.node.id,
    createNodeConfig({
      description: description.value,
      displayName: displayName.value,
      subType: 'endEvent',
      type: 'endEvent',
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
  <div style="display: flex; flex-direction: column; height: 100%">
    <MetadataFormSection
      :is-start-node="false"
      :name="displayName"
      :description="description"
      :on-name-change="(value) => { displayName = value; }"
      :on-description-change="(value) => { description = value; }"
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
