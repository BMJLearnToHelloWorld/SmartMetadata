/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * Metric definition card — the pin `MetricDefinitionCard.tsx` equivalent
 * (D-2 batch 5b). Expression panel first, then the type / unit /
 * granularity fields; the Edit button opens the pin-width (720) edit
 * dialog. The edit dialog mirrors the pin's `MetricDefinitionEditDialog`
 * (same file): `__none__` empty options, custom unit required only when
 * the unit is Other, expression optional (an existing expression keeps
 * its language when the code is cleared), failure keeps the dialog open
 * with the `server.entity-updating-error` alert.
 *
 * Permissions: `canEdit` is computed by the view as the
 * `getDerivedPermissionFlags` `canEditAll` WITHOUT the `deleted` flag,
 * OR `isAdminUser` (P1 dual line); the Edit button additionally hides
 * when the metric is deleted, exactly as the pin does. The view's
 * `onSave` patches the metric and reloads; a thrown failure keeps the
 * dialog open.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Card, Descriptions, Input, Select, Tag, Typography } from 'ant-design-vue';
import { FunctionOutlined } from '@ant-design/icons-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { diffJsonPatch } from '@/admin/jsonPatch';
import type { JsonPatchOp } from '@/admin/jsonPatch';
import FormModal from '@/components/shared/FormModal.vue';
import { METRIC_GRANULARITY_VALUES, METRIC_LANGUAGE_VALUES, METRIC_TYPE_VALUES, METRIC_UNIT_VALUES } from '@/features/metrics/metricForm';
import type { AssetDetail } from '@/types/api';

const { t, te } = useI18n();

const props = defineProps<{
  metric: AssetDetail;
  canEdit: boolean;
  onSave: (ops: JsonPatchOp[]) => Promise<void>;
}>();

/** Pin `EMPTY_DEFINITION_VALUE` (`MetricDefinitionCard.tsx:64`). */
const EMPTY_DEFINITION_VALUE = '__none__';

/** Missing value renders the pin `label.empty-dash` dash. */
const EMPTY_DASH = '—';

/** Pin `getMetricEnumLabel`: Title-Case fallback when the enum key is absent. */
const toTitleCase = (value: string): string =>
  value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());

const enumLabelFor = (section: string, value: string): string => {
  const key = `metrics.enums.${section}.${value}`;
  return te(key) ? t(key) : toTitleCase(value);
};

const languageLabel = (language?: string): string =>
  language ? enumLabelFor('language', language) : EMPTY_DASH;

const enumLabel = (section: 'metricType' | 'granularity' | 'unitOfMeasurement', value?: string): string =>
  value ? enumLabelFor(section, value) : EMPTY_DASH;

/** Pin `getMetricUnitLabel`: a present custom unit wins over the enum value. */
const unitLabel = computed(() => {
  const custom = props.metric.customUnitOfMeasurement?.trim();
  return custom || enumLabel('unitOfMeasurement', props.metric.unitOfMeasurement);
});

const expressionCode = computed(() => props.metric.storedProcedureCode?.code ?? '');
const expressionLanguage = computed(() => props.metric.storedProcedureCode?.language);

// ---- Edit dialog (pin MetricDefinitionEditDialog) ----

const dialogOpen = ref(false);
const saving = ref(false);
const saveError = ref(false);
const customUnitError = ref<string | undefined>(undefined);

const formType = ref<string | undefined>(undefined);
const formGranularity = ref<string | undefined>(undefined);
const formUnit = ref<string | undefined>(undefined);
const formCustomUnit = ref('');
const formLanguage = ref('SQL');
const formCode = ref('');

function resetForm(): void {
  formType.value = props.metric.metricType;
  formGranularity.value = props.metric.granularity;
  formUnit.value = props.metric.unitOfMeasurement;
  formCustomUnit.value = props.metric.customUnitOfMeasurement ?? '';
  formLanguage.value = props.metric.storedProcedureCode?.language ?? 'SQL';
  formCode.value = props.metric.storedProcedureCode?.code ?? '';
  customUnitError.value = undefined;
  saveError.value = false;
}

watch(dialogOpen, (open) => {
  if (open) {
    resetForm();
  }
});

function openDialog(): void {
  dialogOpen.value = true;
}

function closeDialog(): void {
  // Pin: dismiss is disabled while saving.
  if (saving.value) {
    return;
  }
  dialogOpen.value = false;
}

function asSingleString(value: SelectValue): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function selectValue(current: string | undefined): string {
  return current ?? EMPTY_DEFINITION_VALUE;
}

function enumOptions(values: readonly string[], section: 'metricType' | 'granularity' | 'unitOfMeasurement' | 'language'): { value: string; label: string }[] {
  return [
    { value: EMPTY_DEFINITION_VALUE, label: t('label.none') },
    ...values.map((value) => ({ value, label: enumLabelFor(section, value) })),
  ];
}

const typeOptions = computed(() => enumOptions(METRIC_TYPE_VALUES, 'metricType'));
const granularityOptions = computed(() => enumOptions(METRIC_GRANULARITY_VALUES, 'granularity'));
const unitOptions = computed(() => enumOptions(METRIC_UNIT_VALUES, 'unitOfMeasurement'));
const languageOptions = computed(() =>
  METRIC_LANGUAGE_VALUES.map((value) => ({ value, label: enumLabelFor('language', value) })),
);

function handleSelectChange(value: SelectValue, apply: (next: string | undefined) => void): void {
  const next = asSingleString(value);
  if (next === undefined) {
    return;
  }
  apply(next === EMPTY_DEFINITION_VALUE ? undefined : next);
}

async function handleSave(): Promise<void> {
  // Pin: the field-required error names the unit field, not the custom input.
  const requiredCustomUnitError =
    formUnit.value === 'OTHER' && !formCustomUnit.value.trim()
      ? t('label.field-required', { field: t('metrics.unit') })
      : undefined;
  customUnitError.value = requiredCustomUnitError;
  if (requiredCustomUnitError) {
    return;
  }

  saving.value = true;
  saveError.value = false;
  try {
    // Pin save payload, top-level only: `diffJsonPatch` turns an absent
    // key into `remove` and a changed value into `replace`, so undefined
    // fields are omitted rather than sent as null. Patch paths use the
    // API field names (`metricExpression`, not the view model's
    // `storedProcedureCode` display alias).
    const original: Record<string, unknown> = {};
    if (props.metric.metricType !== undefined) original.metricType = props.metric.metricType;
    if (props.metric.granularity !== undefined) original.granularity = props.metric.granularity;
    if (props.metric.unitOfMeasurement !== undefined) original.unitOfMeasurement = props.metric.unitOfMeasurement;
    if (props.metric.customUnitOfMeasurement !== undefined) {
      original.customUnitOfMeasurement = props.metric.customUnitOfMeasurement;
    }
    if (props.metric.storedProcedureCode !== undefined) {
      original.metricExpression = props.metric.storedProcedureCode;
    }

    const updated: Record<string, unknown> = {};
    if (formType.value !== undefined) updated.metricType = formType.value;
    if (formGranularity.value !== undefined) updated.granularity = formGranularity.value;
    if (formUnit.value !== undefined) updated.unitOfMeasurement = formUnit.value;
    if (formUnit.value === 'OTHER' && formCustomUnit.value.trim()) {
      updated.customUnitOfMeasurement = formCustomUnit.value.trim();
    }
    // Pin: the expression is optional; an empty code must not block
    // editing the other fields. An existing expression keeps its language
    // when the code is cleared; with no code and no existing expression
    // there is no expression at all.
    const code = formCode.value.trim();
    if (code || props.metric.storedProcedureCode) {
      const expression: Record<string, unknown> = { ...(props.metric.storedProcedureCode ?? {}) };
      if (code) {
        expression.code = code;
      } else {
        delete expression.code;
      }
      expression.language = formLanguage.value;
      updated.metricExpression = expression;
    }

    await props.onSave(diffJsonPatch(original, updated));
    dialogOpen.value = false;
  } catch {
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Card data-testid="metric-definition-card">
    <template #title>
      <span class="metric-definition__title">
        <FunctionOutlined aria-hidden="true" />
        {{ t('metrics.definition') }}
      </span>
    </template>
    <template v-if="canEdit && !metric.deleted" #extra>
      <Button size="small" data-testid="metric-definition-edit" @click="openDialog">
        {{ t('label.edit') }}
      </Button>
    </template>

    <div class="metric-definition__expression">
      <Tag v-if="expressionLanguage">{{ languageLabel(expressionLanguage) }}</Tag>
      <pre data-testid="metric-expression-code">{{ expressionCode || EMPTY_DASH }}</pre>
    </div>

    <Descriptions :column="3" layout="vertical" size="small" data-testid="metric-definition-fields">
      <Descriptions.Item :label="t('metrics.type')">
        <Typography.Text class="metric-definition__value" data-testid="metric-definition-type">
          {{ enumLabel('metricType', metric.metricType) }}
        </Typography.Text>
      </Descriptions.Item>
      <Descriptions.Item :label="t('metrics.unit')">
        <Typography.Text class="metric-definition__value" data-testid="metric-definition-unit">
          {{ unitLabel }}
        </Typography.Text>
      </Descriptions.Item>
      <Descriptions.Item :label="t('metrics.granularity')">
        <Typography.Text class="metric-definition__value" data-testid="metric-definition-granularity">
          {{ enumLabel('granularity', metric.granularity) }}
        </Typography.Text>
      </Descriptions.Item>
    </Descriptions>
  </Card>

  <FormModal
    :open="dialogOpen"
    :title="t('label.edit-entity', { entity: t('metrics.definition') })"
    size="wide"
    test-id="metric-definition-edit-dialog"
    :confirm-loading="saving"
    @ok="handleSave"
    @cancel="closeDialog"
  >
    <div class="metric-definition__form">
      <Alert
        v-if="saveError"
        type="error"
        show-icon
        :message="t('server.entity-updating-error', { entity: metric.displayName || metric.name })"
      />
      <div class="metric-definition__grid">
        <label>
          <span class="metric-definition__label">{{ t('metrics.type') }}</span>
          <Select
            :value="selectValue(formType)"
            :options="typeOptions"
            :disabled="saving"
            data-testid="metric-definition-type-select"
            @change="(value: SelectValue) => handleSelectChange(value, (next) => { formType = next; })"
          />
        </label>
        <label>
          <span class="metric-definition__label">{{ t('metrics.granularity') }}</span>
          <Select
            :value="selectValue(formGranularity)"
            :options="granularityOptions"
            :disabled="saving"
            data-testid="metric-definition-granularity-select"
            @change="(value: SelectValue) => handleSelectChange(value, (next) => { formGranularity = next; })"
          />
        </label>
        <label>
          <span class="metric-definition__label">{{ t('metrics.unit') }}</span>
          <Select
            :value="selectValue(formUnit)"
            :options="unitOptions"
            :disabled="saving"
            data-testid="metric-definition-unit-select"
            @change="(value: SelectValue) => { handleSelectChange(value, (next) => { formUnit = next; }); customUnitError = undefined; }"
          />
        </label>
        <label v-if="formUnit === 'OTHER'">
          <span class="metric-definition__label">{{ t('metrics.form.customUnitOfMeasurement') }}</span>
          <Input
            :value="formCustomUnit"
            :disabled="saving"
            :status="customUnitError ? 'error' : ''"
            data-testid="metric-definition-custom-unit"
            @update:value="(value: string) => { formCustomUnit = value; customUnitError = undefined; }"
          />
          <span v-if="customUnitError" class="metric-definition__error">{{ customUnitError }}</span>
        </label>
      </div>
      <label>
        <span class="metric-definition__label">{{ t('metrics.form.language') }}</span>
        <Select
          :value="formLanguage"
          :options="languageOptions"
          :disabled="saving"
          data-testid="metric-definition-language-select"
          @change="(value: SelectValue) => { const next = asSingleString(value); if (next !== undefined) formLanguage = next; }"
        />
      </label>
      <label>
        <span class="metric-definition__label">{{ t('metrics.form.code') }}</span>
        <Input.TextArea
          :value="formCode"
          :rows="8"
          :disabled="saving"
          data-testid="metric-definition-code"
          @update:value="(value: string) => { formCode = value; }"
        />
      </label>
    </div>
  </FormModal>
</template>

<style scoped>
.metric-definition__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.metric-definition__expression {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
}

.metric-definition__expression pre {
  margin: 0;
  width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--sm-font-mono, monospace);
}

.metric-definition__value {
  font-family: var(--sm-font-mono, monospace);
  text-transform: uppercase;
  font-weight: 600;
}

.metric-definition__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.metric-definition__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.metric-definition__label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.metric-definition__error {
  display: block;
  margin-top: 4px;
  color: var(--ant-error-color, #ff4d4f);
}
</style>
