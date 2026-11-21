<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Column custom-property cell (D-2 batch 3): the product form of pin
  `ColumnCustomPropertyCell` (SchemaTable): one custom property of the
  `column` type rendered in its own table column. The value renders as
  plain text; an editable cell offers a hover edit button (or a `+`
  add button when empty), opening a small editor modal for the new
  value. Pin renders per-type viewers via `getPropertyRenderer`; the
  product has no per-type renderer, so values render as their text
  form and edit through a generic input matched to the property type
  (text / number / boolean / enum options from `customPropertyConfig`).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { Button, Checkbox, Input, InputNumber, Modal, Select, Typography, message } from 'ant-design-vue';
import type { SchemaRow } from '@/types/api';
import type { CustomPropertyDef } from '@/types/collaboration';

const props = defineProps<{
  property: CustomPropertyDef;
  record: SchemaRow;
  hasEditPermissions: boolean;
  onExtensionUpdate: (record: SchemaRow, extension: Record<string, unknown>) => Promise<unknown> | unknown;
}>();

const { t } = useI18n();

const editing = ref(false);
const saving = ref(false);
const draftText = ref('');
const draftNumber = ref<number | undefined>(undefined);
const draftBool = ref(false);
const draftEnum = ref<string | undefined>(undefined);

const value = computed(() => (props.record.extension ?? {})[props.property.name]);

const isEmptyValue = computed(
  () => value.value === undefined || value.value === null || value.value === '',
);

const typeName = computed(() => (props.property.propertyType ?? '').toLowerCase());

const enumOptions = computed(() => {
  const config = props.property.customPropertyConfig?.config;
  if (Array.isArray(config)) {
    return config.map(String);
  }
  if (config && typeof config === 'object' && Array.isArray(config.values)) {
    return config.values.map(String);
  }
  return [];
});

const displayText = computed(() => {
  if (isEmptyValue.value) {
    return '—';
  }
  if (typeof value.value === 'boolean') {
    return value.value ? t('label.yes') : t('label.no');
  }
  if (Array.isArray(value.value)) {
    return value.value.map(String).join(', ');
  }
  return String(value.value);
});

function openEditor(): void {
  const current = value.value;
  draftText.value = current === undefined || current === null ? '' : String(current);
  draftNumber.value = typeof current === 'number' ? current : undefined;
  draftBool.value = current === true;
  draftEnum.value = typeof current === 'string' ? current : undefined;
  editing.value = true;
}

async function saveValue(): Promise<void> {
  let next: unknown;
  if (typeName.value === 'boolean') {
    next = draftBool.value;
  } else if (typeName.value === 'integer' || typeName.value === 'number') {
    next = draftNumber.value;
  } else if (typeName.value === 'enum' && enumOptions.value.length > 0) {
    next = draftEnum.value ?? '';
  } else {
    next = draftText.value.trim();
  }
  const extension = { ...(props.record.extension ?? {}) };
  if (next === '' || next === undefined) {
    delete extension[props.property.name];
  } else {
    extension[props.property.name] = next;
  }
  saving.value = true;
  try {
    await props.onExtensionUpdate(props.record, extension);
    editing.value = false;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div :data-testid="`column-custom-property-${property.name}`">
    <div style="display: flex; align-items: center; gap: 4px">
      <Typography.Text>{{ displayText }}</Typography.Text>
      <Button
        v-if="hasEditPermissions && !isEmptyValue"
        type="text"
        size="small"
        data-testid="edit-icon"
        :title="t('label.edit-entity', { entity: property.displayName || property.name })"
        @click="openEditor"
      >
        <template #icon><EditOutlined /></template>
      </Button>
      <Button
        v-if="hasEditPermissions && isEmptyValue"
        type="text"
        size="small"
        data-testid="add-icon"
        :title="t('label.add-entity', { entity: property.displayName || property.name })"
        @click="openEditor"
      >
        <template #icon><PlusOutlined /></template>
      </Button>
    </div>
    <Modal
      :open="editing"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('label.edit-entity', { entity: property.displayName || property.name })"
      @cancel="editing = false"
    >
      <InputNumber
        v-if="typeName === 'integer' || typeName === 'number'"
        v-model:value="draftNumber"
        style="width: 100%"
        data-testid="custom-property-number-input"
      />
      <Checkbox v-else-if="typeName === 'boolean'" v-model:checked="draftBool">
        {{ property.displayName || property.name }}
      </Checkbox>
      <Select
        v-else-if="typeName === 'enum' && enumOptions.length > 0"
        v-model:value="draftEnum"
        style="width: 100%"
        data-testid="custom-property-enum-select"
        allow-clear
      >
        <Select.Option v-for="option in enumOptions" :key="option" :value="option">
          {{ option }}
        </Select.Option>
      </Select>
      <Input.TextArea
        v-else-if="typeName === 'markdown'"
        v-model:value="draftText"
        :rows="4"
        data-testid="custom-property-text-input"
      />
      <Input
        v-else
        v-model:value="draftText"
        data-testid="custom-property-text-input"
      />
      <template #footer>
        <Button data-testid="cancel" @click="editing = false">{{ t('label.cancel') }}</Button>
        <Button type="primary" data-testid="save" :loading="saving" @click="saveValue">
          {{ t('label.save') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
