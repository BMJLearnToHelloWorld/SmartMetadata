<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Card, Input, Select } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type {
  WorkflowCheckChangeDescConditionPayload,
  WorkflowConditionFieldDefinition,
  WorkflowConditionRow,
  WorkflowConditionType,
} from '@/types/governance';
import { CONDITION_BUILDER_WORKFLOW_TRIGGER_FIELDS } from '@/utils/conditionBuilderFields';
import {
  buildConditionBuilderPayload,
  generateRowId,
  parseConditionBuilderPayload,
} from '@/utils/conditionBuilderTransformer';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import ConditionBuilderValueControl from './ConditionBuilderValueControl.vue';

/**
 * Official ConditionBuilder (pin a3012259ca), ported 1:1: AND/OR toggle +
 * rows of (field select, value control, add/remove). Emits the payload on
 * every change, with echo suppression (lastEmittedRef) so the parent's
 * round-trip does not reset the rows. R-11: glossary-term fields use the
 * same async multi-select as the other dropdown fields (the product has
 * no GlossaryTermPicker); text fields are comma-separated inputs.
 */
const props = withDefaults(
  defineProps<{
    showCondition?: boolean;
    value: WorkflowCheckChangeDescConditionPayload | null | undefined;
    onChange: (value: WorkflowCheckChangeDescConditionPayload) => void;
    fieldDefinitions?: WorkflowConditionFieldDefinition[];
    disabled?: boolean;
    dataTestid?: string;
  }>(),
  {
    showCondition: false,
    fieldDefinitions: () => CONDITION_BUILDER_WORKFLOW_TRIGGER_FIELDS,
    disabled: false,
    dataTestid: 'condition-builder',
  },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;
const isDisabled = computed(() => props.disabled || isFormDisabled.value);

const parsed = parseConditionBuilderPayload(props.value);
const condition = ref<WorkflowConditionType>(parsed.condition);
const rows = ref<WorkflowConditionRow[]>(
  parsed.rows.length > 0
    ? parsed.rows
    : [{ id: generateRowId(), field: '', values: [] }],
);
const lastEmittedRef = ref<string | null>(null);

watch(
  () => props.value,
  (next) => {
    const valueSerialized =
      next !== null && next !== undefined ? JSON.stringify(next) : null;
    if (lastEmittedRef.value && valueSerialized === lastEmittedRef.value) {
      lastEmittedRef.value = null;
      return;
    }
    if (next === null || next === undefined) {
      lastEmittedRef.value = null;
    }
    const nextParsed = parseConditionBuilderPayload(next);
    condition.value = nextParsed.condition;
    rows.value =
      nextParsed.rows.length > 0
        ? nextParsed.rows
        : [{ id: generateRowId(), field: '', values: [] }];
  },
);

function emitChange(
  newRows: WorkflowConditionRow[],
  newCondition: WorkflowConditionType,
): void {
  const payload = buildConditionBuilderPayload(newCondition, newRows);
  lastEmittedRef.value = JSON.stringify(payload);
  props.onChange(payload);
}

const fieldOptions = computed(() =>
  props.fieldDefinitions.map((def) => ({
    value: def.value,
    label: t(def.label),
  })),
);

function getFieldDef(field: string): WorkflowConditionFieldDefinition | undefined {
  return props.fieldDefinitions.find((d) => d.value === field);
}

function handleAddRow(): void {
  const newRows = [...rows.value, { id: generateRowId(), field: '', values: [] }];
  rows.value = newRows;
  emitChange(newRows, condition.value);
}

function handleRemoveRow(id: string): void {
  const newRows = rows.value.filter((r) => r.id !== id);
  rows.value = newRows;
  emitChange(newRows, condition.value);
}

function handleRowFieldChange(rowId: string, field: string): void {
  const newRows = rows.value.map((r) =>
    r.id === rowId ? { ...r, field, values: [] } : r,
  );
  rows.value = newRows;
  emitChange(newRows, condition.value);
}

function handleRowValuesChange(rowId: string, newValues: string[]): void {
  const newRows = rows.value.map((r) =>
    r.id === rowId ? { ...r, values: newValues } : r,
  );
  rows.value = newRows;
  emitChange(newRows, condition.value);
}

const fieldSelectOptions = computed(() => [
  { label: t('workflows.builder.conditionBuilderSelectField'), value: '' },
  ...fieldOptions.value,
]);
</script>

<template>
  <Card style="display: flex; flex-direction: column; gap: 16px; padding: 16px" :data-testid="dataTestid">
    <div v-if="showCondition" style="display: flex; justify-content: flex-start; margin-bottom: 4px" :data-testid="`${dataTestid}-condition-radio`">
      <div style="display: flex; border: 1px solid var(--sm-border-color); border-radius: 8px; overflow: hidden">
        <Button
          :type="condition === 'AND' ? 'primary' : 'text'"
          size="small"
          :data-testid="`${dataTestid}-condition-and`"
          :disabled="isDisabled"
          @click="() => { if (condition !== 'AND') { condition = 'AND'; emitChange(rows, 'AND'); } }"
        >
          {{ t('workflows.builder.conditionAnd') }}
        </Button>
        <Button
          :type="condition === 'OR' ? 'primary' : 'text'"
          size="small"
          :data-testid="`${dataTestid}-condition-or`"
          :disabled="isDisabled"
          @click="() => { if (condition !== 'OR') { condition = 'OR'; emitChange(rows, 'OR'); } }"
        >
          {{ t('workflows.builder.conditionOr') }}
        </Button>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 16px">
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        style="display: flex; align-items: center; gap: 16px; flex-wrap: nowrap"
        data-testid="advanced-search-field-select"
      >
        <div style="width: 176px; flex-shrink: 0">
          <Select
            :value="row.field"
            :data-testid="`${dataTestid}-row-${index}-field`"
            :disabled="isDisabled"
            :options="fieldSelectOptions"
            style="width: 100%"
            @change="(key) => handleRowFieldChange(row.id, String(key ?? ''))"
          />
        </div>
        <div style="flex: 1; min-width: 0; overflow: hidden">
          <ConditionBuilderValueControl
            v-if="row.field"
            :data-testid="`${dataTestid}-row-${index}-value`"
            :disabled="isDisabled"
            :field-def="getFieldDef(row.field)"
            :placeholder="t('workflows.builder.conditionBuilderSelectValue')"
            :values="row.values"
            @change="(v: string[]) => handleRowValuesChange(row.id, v)"
          />
        </div>
        <div style="display: flex; align-items: center; flex-shrink: 0; gap: 4px">
          <Button
            type="text"
            :data-testid="`${dataTestid}-add-row`"
            :disabled="isDisabled"
            :aria-label="t('workflows.builder.add')"
            @click="handleAddRow"
          >
            <PlusOutlined />
          </Button>
          <Button
            v-if="rows.length > 1"
            type="text"
            danger
            :data-testid="`${dataTestid}-remove-row-${index}`"
            :disabled="isDisabled"
            :aria-label="t('workflows.builder.remove')"
            @click="handleRemoveRow(row.id)"
          >
            <DeleteOutlined />
          </Button>
        </div>
      </div>
    </div>
  </Card>
</template>

