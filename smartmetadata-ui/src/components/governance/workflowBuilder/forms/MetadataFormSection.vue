<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Input } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official MetadataFormSection (pin a3012259ca): the name + description
 * pair at the top of every node form. The name capitalizes its first
 * letter on change. The name is locked when lockFields (in OSS the start
 * node's name is locked: allowFullStartNodeConfiguration false); the
 * description is locked only by lockDescriptionField ?? lockFields —
 * WorkflowConfigFormV1 passes lockDescriptionField=false, so the start
 * node's description stays editable in OSS.
 */
const props = withDefaults(
  defineProps<{
    name: string;
    description: string;
    isStartNode: boolean;
    lockFields?: boolean;
    lockDescriptionField?: boolean;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
  }>(),
  { lockFields: false, lockDescriptionField: undefined },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

const nameDisabled = computed(() => isFormDisabled.value || props.lockFields);
const descriptionDisabled = computed(
  () => isFormDisabled.value || (props.lockDescriptionField ?? props.lockFields),
);

function onNameInput(value: string): void {
  const capitalized =
    value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  props.onNameChange(capitalized);
}
</script>

<template>
  <div data-testid="metadata-form-section">
    <div style="margin-bottom: 24px" data-testid="workflow-name-section">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ isStartNode ? t('workflows.builder.workflowName') : t('workflows.builder.displayName') }}
        <span style="color: var(--sm-color-error)">*</span>
      </label>
      <Input
        :value="name"
        data-testid="workflow-name-input"
        :disabled="nameDisabled"
        @update:value="onNameInput"
      />
    </div>
    <div style="margin-bottom: 24px" data-testid="workflow-description-section">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">
        {{ isStartNode ? t('workflows.builder.workflowDescription') : t('workflows.builder.description') }}
      </label>
      <Input.TextArea
        :value="description"
        data-testid="workflow-description-input"
        :disabled="descriptionDisabled"
        :placeholder="t('workflows.builder.description')"
        :rows="3"
        @update:value="onDescriptionChange"
      />
    </div>
  </div>
</template>
