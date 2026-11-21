<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Column display-name edit modal (D-2 batch 3): the product form of
  official `EntityNameModal` as used by pin SchemaTable (with the
  constraint select as `additionalFields`) and ModelTab / DatabaseSchema
  (plain display-name edit). The parent holds the edited row; this modal
  only edits the name (and, for Table columns, the constraint).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Modal, Select, Typography, message } from 'ant-design-vue';

export interface ColumnDisplayNameData {
  displayName?: string;
  constraint?: string;
  removeConstraint?: boolean;
}

/**
 * Pin `COLUMN_CONSTRAINT_TYPE_OPTIONS`
 * (`U/constants/Table.constants.ts:72`): PrimaryKey / NotNull / Null /
 * Unique, plus None (pin `NO_CONSTRAINT_KEY = 'none'`).
 */
const COLUMN_CONSTRAINT_OPTIONS = ['PRIMARY_KEY', 'NOT_NULL', 'NULL', 'UNIQUE'] as const;

const props = defineProps<{
  open: boolean;
  name: string;
  displayName?: string;
  showConstraint?: boolean;
  constraint?: string;
  onSave: (data: ColumnDisplayNameData) => Promise<unknown> | unknown;
  onCancel: () => void;
}>();

const { t } = useI18n();

const displayName = ref(props.displayName ?? '');
const constraint = ref<string | undefined>(props.constraint);
const saving = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      displayName.value = props.displayName ?? '';
      constraint.value = props.constraint;
    }
  },
);

const title = computed(
  () => `${t('label.edit-entity', { entity: t('label.column') })}: "${props.name}"`,
);

function constraintLabel(value: string): string {
  switch (value) {
    case 'PRIMARY_KEY':
      return t('label.primary-key');
    case 'NOT_NULL':
      return t('label.not-null');
    case 'NULL':
      return t('label.null');
    case 'UNIQUE':
      return t('label.unique');
    default:
      return value;
  }
}

async function saveName(): Promise<void> {
  const trimmed = displayName.value.trim();
  saving.value = true;
  try {
    if (props.showConstraint) {
      const changed = constraint.value !== props.constraint;
      await props.onSave({
        displayName: trimmed || undefined,
        ...(changed
          ? constraint.value
            ? { constraint: constraint.value }
            : { removeConstraint: true }
          : {}),
      });
    } else {
      await props.onSave({ displayName: trimmed || undefined });
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :closable="false" :mask-closable="false" :keyboard="false" :title="title" @cancel="onCancel">
    <div style="display: flex; flex-direction: column; gap: 12px">
      <div>
        <Typography.Text>{{ t('label.display-name') }}</Typography.Text>
        <Input
          v-model:value="displayName"
          data-testid="column-display-name-input"
          :placeholder="t('label.enter-entity', { entity: t('label.display-name') })"
        />
      </div>
      <div v-if="showConstraint">
        <Typography.Text>{{ t('label.constraint') }}</Typography.Text>
        <Select
          v-model:value="constraint"
          data-testid="constraint-type-select"
          style="width: 100%"
          :placeholder="t('label.please-select-entity', { entity: t('label.constraint') })"
          allow-clear
        >
          <Select.Option
            v-for="option in COLUMN_CONSTRAINT_OPTIONS"
            :key="option"
            :value="option"
          >
            {{ constraintLabel(option) }}
          </Select.Option>
        </Select>
      </div>
    </div>
    <template #footer>
      <Button data-testid="cancel" @click="onCancel">{{ t('label.cancel') }}</Button>
      <Button type="primary" data-testid="save" :loading="saving" @click="saveName">
        {{ t('label.save') }}
      </Button>
    </template>
  </Modal>
</template>
