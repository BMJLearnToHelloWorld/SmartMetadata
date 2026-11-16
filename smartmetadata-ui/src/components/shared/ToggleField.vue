<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Switch } from 'ant-design-vue';

/**
 * Port of official BooleanFieldTemplate (pin a3012259ca): schema
 * booleans render as a toggle, not a checkbox, with the schema title
 * as a clickable label and the schema description beneath it. The
 * toggle defaults to off when the value is absent, and changing it
 * reports focus to the doc panel, as pin's template does.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    /** Schema title for the field; rendered as the label. */
    label: string;
    /** Schema description; rendered under the label when present. */
    description?: string;
    disabled?: boolean;
    /** RJSF-style field id, reported on focus/change. */
    fieldId?: string;
    testId?: string;
  }>(),
  {
    modelValue: undefined,
    description: undefined,
    disabled: false,
    fieldId: undefined,
    testId: 'toggle-field',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  focus: [fieldId: string | undefined];
}>();

function onChange(value: boolean): void {
  emit('update:modelValue', value);
  emit('focus', props.fieldId);
}

function onLabelClick(): void {
  if (props.disabled) {
    return;
  }
  onChange(!(props.modelValue ?? false));
}
</script>

<template>
  <div class="toggle-field" :data-testid="testId">
    <Switch
      :checked="modelValue ?? false"
      :disabled="disabled"
      :data-testid="`${testId}-switch`"
      @change="onChange(Boolean($event))"
      @focus="emit('focus', fieldId)"
    />
    <div class="toggle-field-text">
      <span
        class="toggle-field-label"
        :data-testid="`${testId}-label`"
        @click="onLabelClick"
      >
        {{ label }}
      </span>
      <div v-if="description" class="toggle-field-description">{{ description }}</div>
    </div>
  </div>
</template>

<style scoped>
.toggle-field {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0;
}

.toggle-field-text {
  min-width: 0;
  flex: 1;
}

.toggle-field-label {
  display: block;
  cursor: pointer;
  font-weight: 500;
  line-height: 20px;
}

.toggle-field-description {
  margin-top: 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--sm-text-tertiary);
}
</style>
