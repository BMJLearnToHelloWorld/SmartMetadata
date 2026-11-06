<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { useI18n } from 'vue-i18n';
import { ALL_DATA_ASSETS_OPTION_VALUE } from '@/constants/workflowBuilder';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official DataAssetFormSection (pin a3012259ca): a multi-select of the
 * entity types this workflow can act on, with an `All` pseudo-option.
 * Selecting All selects every available asset (and disables the rest while
 * it is selected); the display collapses to [All] when all assets are
 * selected. Labels are upperFirst(asset).
 */
const props = withDefaults(
  defineProps<{
    availableDataAssets: string[];
    dataAssets: string[];
    lockFields?: boolean;
    onDataAssetsChange: (dataAssets: string[]) => void;
    onRemoveDataAsset: (asset: string) => void;
  }>(),
  { lockFields: false },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;
const inputsDisabled = computed(() => isFormDisabled.value || props.lockFields);

function upperFirst(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

const displayValue = computed(() => {
  const hasAllSelected =
    props.availableDataAssets.length > 0 &&
    props.dataAssets.length === props.availableDataAssets.length &&
    props.availableDataAssets.every((asset) => props.dataAssets.includes(asset));
  return hasAllSelected ? [ALL_DATA_ASSETS_OPTION_VALUE] : props.dataAssets;
});

const isAllSelected = computed(() =>
  displayValue.value.includes(ALL_DATA_ASSETS_OPTION_VALUE),
);

const options = computed(() =>
  [ALL_DATA_ASSETS_OPTION_VALUE, ...props.availableDataAssets].map((v) => ({
    value: v,
    label:
      v === ALL_DATA_ASSETS_OPTION_VALUE
        ? t('workflows.builder.all')
        : upperFirst(v),
    disabled: isAllSelected.value && v !== ALL_DATA_ASSETS_OPTION_VALUE,
  })),
);

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this multiple select only ever carries plain string values, so normalise
 * to string[] here and keep the rest of the handler in string terms.
 */
function handleChange(next: SelectValue): void {
  const values = (next === undefined ? [] : Array.isArray(next) ? next : [next]).map(
    (value) =>
      typeof value === 'object' && value !== null
        ? String(value.value)
        : String(value),
  );
  const prev = displayValue.value;
  if (values.includes(ALL_DATA_ASSETS_OPTION_VALUE) && !prev.includes(ALL_DATA_ASSETS_OPTION_VALUE)) {
    props.onDataAssetsChange([...props.availableDataAssets]);
    return;
  }
  if (prev.includes(ALL_DATA_ASSETS_OPTION_VALUE) && !values.includes(ALL_DATA_ASSETS_OPTION_VALUE)) {
    props.onDataAssetsChange([]);
    return;
  }
  props.onDataAssetsChange(
    values.filter((v) => v !== ALL_DATA_ASSETS_OPTION_VALUE),
  );
}
</script>

<template>
  <div style="margin-bottom: 24px" data-testid="data-asset-form-section">
    <label style="display: block; margin-bottom: 4px; font-size: 14px">
      {{ t('workflows.builder.dataAsset') }}
      <span style="color: var(--sm-color-error)">*</span>
    </label>
    <Select
      mode="multiple"
      :value="displayValue"
      data-testid="data-asset"
      :disabled="inputsDisabled"
      :options="options"
      :placeholder="t('workflows.builder.selectDataAssets')"
      style="width: 100%"
      @change="handleChange"
    />
  </div>
</template>
