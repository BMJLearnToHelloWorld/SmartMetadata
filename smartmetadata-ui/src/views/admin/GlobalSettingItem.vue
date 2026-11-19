<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official GlobalSettingsItem: a labelled number with an edit
  affordance. The editor clamps on save, treats a cleared input as a
  cancelled edit, reverts to the prop value when the update rejects,
  and restores focus to the edit button on close.
-->
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditOutlined } from '@ant-design/icons-vue';
import { Button, InputNumber, Typography } from 'ant-design-vue';

const props = defineProps<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onUpdate: (value: number) => Promise<void>;
}>();
const { t } = useI18n();

const isEditing = ref(false);
const updatedValue = ref<number>(props.value);
const isUpdating = ref(false);
const valueContainerRef = ref<HTMLElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const restoreFocusRef = ref(false);

function clamp(value: number): number {
  return Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, value));
}

// Opening the editor removes the focused edit button and closing it
// removes the focused input: move focus to the control that replaces
// each, instead of letting it fall to <body>.
function closeEditor(): void {
  const focused = document.activeElement;
  restoreFocusRef.value =
    !focused ||
    focused === document.body ||
    Boolean(editorRef.value?.contains(focused));
  isEditing.value = false;
}

watch(isEditing, async (editing) => {
  await nextTick();
  if (editing) {
    editorRef.value?.querySelector('input')?.focus();
  } else if (restoreFocusRef.value) {
    restoreFocusRef.value = false;
    valueContainerRef.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
});

function handleCancel(): void {
  updatedValue.value = props.value;
  closeEditor();
}

async function handleSave(): Promise<void> {
  // A cleared input parses to NaN; treat it as a cancelled edit.
  if (Number.isNaN(updatedValue.value)) {
    handleCancel();
    return;
  }
  try {
    isUpdating.value = true;
    await props.onUpdate(clamp(updatedValue.value));
  } catch (error) {
    updatedValue.value = props.value;
    throw error;
  } finally {
    isUpdating.value = false;
    closeEditor();
  }
}

function onInputChange(value: number | string | null): void {
  const numeric = value === null ? Number.NaN : Number(value);
  if (Number.isNaN(numeric)) {
    updatedValue.value = Number.NaN;
    return;
  }
  updatedValue.value = props.step ? numeric : Math.trunc(numeric);
}
</script>

<template>
  <div class="global-setting-item">
    <Typography data-testid="global-setting-label">{{ label }}</Typography>
    <div v-if="isEditing" ref="editorRef" class="global-setting-item__editor">
      <InputNumber
        :value="Number.isNaN(updatedValue) ? undefined : updatedValue"
        :aria-label="label"
        :step="step"
        :disabled="isUpdating"
        :placeholder="t('settings.searchPrefs.value')"
        data-testid="value-input"
        @update:value="onInputChange"
      />
      <span data-testid="inline-edit-container" class="global-setting-item__actions">
        <Button
          data-testid="inline-cancel-btn"
          :aria-label="t('settings.searchPrefs.cancel')"
          :disabled="isUpdating"
          @click="handleCancel"
        >
          {{ t('settings.searchPrefs.cancel') }}
        </Button>
        <Button
          type="primary"
          data-testid="inline-save-btn"
          :aria-label="t('settings.searchPrefs.save')"
          :loading="isUpdating"
          @click="handleSave"
        >
          {{ t('settings.searchPrefs.save') }}
        </Button>
      </span>
    </div>
    <div v-else ref="valueContainerRef" class="global-setting-item__value">
      <span
        class="global-setting-item__value-text"
        :data-testid="`global-setting-value-${label}`"
      >
        {{ value }}
      </span>
      <Button
        type="text"
        size="small"
        :data-testid="`global-setting-edit-icon-${label}`"
        :aria-label="t('settings.searchPrefs.editField', { field: label })"
        @click="isEditing = true"
      >
        <EditOutlined />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.global-setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.global-setting-item__editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-left: 16px;
}

.global-setting-item__actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.global-setting-item__value {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
}

.global-setting-item__value-text {
  margin-left: 16px;
  font-weight: 600;
}
</style>
