<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Divider, Space } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official FormActionButtons (pin a3012259ca): the sidebar footer — a
 * delete button on the left (only when showDelete + onDelete + canSave +
 * allowStructuralGraphEdits, so never in the OSS build), Cancel + Save on
 * the right. Save shows only when showSave + canSave, and is disabled
 * while isDisabled / isLoading / !canSave. `canSave` comes from the mode
 * context, not from props.
 */
const props = withDefaults(
  defineProps<{
    onCancel: () => void;
    onSave: () => void;
    onDelete?: () => void;
    showDelete?: boolean;
    showSave?: boolean;
    isDisabled?: boolean;
    isLoading?: boolean;
    saveLabel?: string;
    cancelLabel?: string;
    deleteLabel?: string;
  }>(),
  {
    onDelete: undefined,
    showDelete: false,
    showSave: true,
    isDisabled: false,
    isLoading: false,
    saveLabel: undefined,
    cancelLabel: undefined,
    deleteLabel: undefined,
  },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const canSave = builder.mode.canSave;
const allowStructuralGraphEdits = builder.mode.allowStructuralGraphEdits;
</script>

<template>
  <div>
    <Divider style="margin: 0" />
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 16px 16px 16px 0">
      <Button
        v-if="showDelete && onDelete && canSave && allowStructuralGraphEdits"
        danger
        type="text"
        size="small"
        data-testid="delete-node-button"
        @click="onDelete"
      >
        {{ deleteLabel ?? t('workflows.builder.deleteNode') }}
      </Button>
      <div v-else />
      <Space :size="12">
        <Button size="small" data-testid="cancel-workflow-button" @click="onCancel">
          {{ cancelLabel ?? t('crud.cancel') }}
        </Button>
        <Button
          v-if="showSave && canSave"
          type="primary"
          size="small"
          data-testid="save-node-configuration-button"
          :disabled="isDisabled || isLoading || !canSave"
          :loading="isLoading"
          @click="onSave"
        >
          {{ isLoading ? `${t('workflows.builder.saving')}...` : (saveLabel ?? t('crud.save')) }}
        </Button>
      </Space>
    </div>
  </div>
</template>
