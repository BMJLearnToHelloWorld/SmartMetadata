<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official RevertBackForm (pin a3012259ca): name + description plus an
 * info banner — this node restores the entity to its last approved version.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}>();

const { t } = useI18n();
const displayName = ref('');
const description = ref('');

function syncFromNode(): void {
  displayName.value = props.node.data?.displayName || props.node.data?.label || '';
  description.value = props.node.data?.description || '';
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function handleSave(): void {
  props.onSave(
    props.node.id,
    createNodeConfig({
      description: description.value,
      displayName: displayName.value,
      subType: 'rollbackEntityTask',
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
    <div
      style="
        background: var(--sm-color-primary-bg);
        border-radius: 6px;
        padding: 6px;
      "
    >
      <Typography.Paragraph
        style="
          margin: 0 0 6px;
          padding: 10px 12px;
          color: var(--sm-color-primary);
          background: var(--sm-color-primary-bg);
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        "
      >
        {{ t('workflows.builder.revertChanges') }}
      </Typography.Paragraph>
      <Typography.Paragraph style="margin: 0; padding: 6px 12px 12px; font-size: 12px">
        {{ t('workflows.builder.revertChangesMessage') }}
      </Typography.Paragraph>
    </div>
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
