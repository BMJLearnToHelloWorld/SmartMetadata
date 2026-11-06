<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Input, Typography } from 'ant-design-vue';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * R-10: the product has no QueryBuilderWidget (official's rjsf-based visual
 * query builder), so the filter sections render the raw filter string in
 * an antd TextArea with the same readOnly gating as official's
 * QueryBuilderSection: read-only in view mode or when forceReadOnly, and
 * pointer-events-none when read-only. Same data model (ES JSON / JSONLogic
 * string), editable and savable — the widget differs, the contract does not.
 */
const props = withDefaults(
  defineProps<{
    value: string;
    label?: string;
    forceReadOnly?: boolean;
    onChange: (value: string) => void;
  }>(),
  { label: '', forceReadOnly: false },
);

const builder = useWorkflowBuilderContext();
const isViewMode = builder.mode.isViewMode;
const readOnly = computed(() => isViewMode.value || props.forceReadOnly);

const internalValue = ref(props.value || '');
watch(
  () => props.value,
  (next) => {
    internalValue.value = next || '';
  },
);

function handleChange(value: string): void {
  if (readOnly.value) {
    return;
  }
  internalValue.value = value;
  props.onChange(value);
}
</script>

<template>
  <div :style="readOnly ? 'pointer-events: none' : undefined" data-testid="query-builder-section">
    <Typography.Text v-if="label" type="secondary" style="display: block; margin-bottom: 4px; font-size: 14px">
      {{ label }}
    </Typography.Text>
    <Input.TextArea
      :value="internalValue"
      data-testid="query-builder-widget"
      :disabled="readOnly"
      :rows="3"
      @update:value="handleChange"
    />
  </div>
</template>
