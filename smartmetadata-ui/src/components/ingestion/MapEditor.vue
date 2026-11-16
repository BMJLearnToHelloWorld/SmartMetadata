<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Input } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';

/**
 * Port of official's additionalProperties map editing (RJSF object
 * field + CoreWrapIfAdditionalTemplate, pin a3012259ca): one row per
 * entry with an editable key, an `=` separator, a value input, and a
 * remove button; an Add button appends a row. Keys commit on blur
 * (pin's onKeyChange runs on blur); a blank or duplicate key is
 * ignored rather than clobbering an entry. New rows seed the RJSF
 * `newKey{n}` key and `New Value` value, matching the fork's existing
 * SchemaField map behaviour; the view's submit formatting drops
 * unfilled seed rows.
 *
 * String-valued maps only (connectionOptions / connectionArguments).
 * The title defaults to the Additional Properties label when the
 * schema gives none (pin getMapFieldTitle).
 */
const props = withDefaults(
  defineProps<{
    modelValue?: Record<string, string>;
    /** Schema title for the map field. */
    title?: string;
    disabled?: boolean;
    testId?: string;
  }>(),
  {
    modelValue: undefined,
    title: undefined,
    disabled: false,
    testId: 'map-editor',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>];
}>();

const { t } = useI18n();

const displayTitle = computed(() => props.title ?? t('forms.map.additionalProperties'));
const rows = computed(() => Object.entries(props.modelValue ?? {}));
const newKeyCounter = ref(0);
/** Draft key text per row, so typing never renames the entry mid-edit. */
const keyDrafts = ref<Record<string, string>>({});

watch(
  () => props.modelValue,
  () => {
    keyDrafts.value = {};
  },
);

function keyDraft(key: string): string {
  return keyDrafts.value[key] ?? key;
}

function addRow(): void {
  newKeyCounter.value += 1;
  const keyName = `newKey${newKeyCounter.value}`;
  emit('update:modelValue', { ...(props.modelValue ?? {}), [keyName]: 'New Value' });
}

function removeRow(key: string): void {
  const next = { ...(props.modelValue ?? {}) };
  delete next[key];
  emit('update:modelValue', next);
}

function updateValue(key: string, text: string): void {
  emit('update:modelValue', { ...(props.modelValue ?? {}), [key]: text });
}

function commitKey(oldKey: string): void {
  const draft = (keyDrafts.value[oldKey] ?? oldKey).trim();
  delete keyDrafts.value[oldKey];
  if (!draft || draft === oldKey || draft in (props.modelValue ?? {})) {
    return;
  }
  const next = { ...(props.modelValue ?? {}) };
  const value = next[oldKey];
  delete next[oldKey];
  next[draft] = value;
  emit('update:modelValue', next);
}
</script>

<template>
  <div :data-testid="testId" class="map-editor">
    <div class="map-editor-header">
      <span class="map-editor-title">{{ displayTitle }}</span>
      <Button
        type="link"
        size="small"
        :disabled="disabled"
        :data-testid="`${testId}-add`"
        :aria-label="t('forms.map.addProperty')"
        @click="addRow"
      >
        <template #icon><PlusOutlined /></template>
        {{ t('forms.map.addProperty') }}
      </Button>
    </div>
    <p v-if="rows.length === 0" class="map-editor-empty">{{ t('forms.map.noProperties') }}</p>
    <div v-else class="map-editor-rows">
      <div
        v-for="[key, value] in rows"
        :key="key"
        class="map-editor-row"
        :data-testid="`${testId}-row-${key}`"
      >
        <Input
          :value="keyDraft(key)"
          :placeholder="t('forms.map.keyPlaceholder')"
          :aria-label="t('forms.map.key')"
          :disabled="disabled"
          :data-testid="`${testId}-key-${key}`"
          @change="keyDrafts[key] = ($event.target as HTMLInputElement).value"
          @blur="commitKey(key)"
        />
        <span class="map-editor-separator">=</span>
        <Input
          :value="value"
          :disabled="disabled"
          :data-testid="`${testId}-value-${key}`"
          @change="updateValue(key, ($event.target as HTMLInputElement).value)"
        />
        <Button
          type="text"
          danger
          :disabled="disabled"
          :data-testid="`${testId}-remove-${key}`"
          :aria-label="t('crud.remove')"
          @click="removeRow(key)"
        >
          <template #icon><DeleteOutlined /></template>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-editor-header {
  display: flex;
  min-height: 24px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.map-editor-title {
  font-size: 12px;
  font-weight: 600;
}

.map-editor-empty {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.map-editor-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.map-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
}

.map-editor-separator {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-text-tertiary);
}
</style>
