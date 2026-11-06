<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Input, Select, Switch } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type {
  WorkflowConditionBuilderOption,
  WorkflowConditionFieldDefinition,
} from '@/types/governance';

/**
 * The ConditionBuilder's per-row value control (pin a3012259ca): boolean
 * → switch; text → comma-separated input; dropdown → async multi-select
 * (300ms debounced search, latest request wins). Certification does not
 * support search — its options load once and filter client-side. Glossary
 * fields use the same dropdown path (R-11: no GlossaryTermPicker).
 */
const props = withDefaults(
  defineProps<{
    dataTestid: string;
    disabled?: boolean;
    fieldDef?: WorkflowConditionFieldDefinition;
    placeholder: string;
    values: string[];
  }>(),
  { disabled: false, fieldDef: undefined },
);
const emit = defineEmits<{ change: [values: string[]] }>();

const { t } = useI18n();
const asyncOptions = ref<WorkflowConditionBuilderOption[]>([]);
const loading = ref(false);
const fetchRef = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const isBoolean = computed(() => props.fieldDef?.valueType === 'boolean');
const isText = computed(
  () => !props.fieldDef || props.fieldDef.valueType === 'text',
);
const hasFetchOptions = computed(() => Boolean(props.fieldDef?.fetchOptions));
const staticOptions = computed<WorkflowConditionBuilderOption[]>(() => {
  if (!props.fieldDef) {
    return [];
  }
  return props.fieldDef.values.map((opt) => ({
    value: opt.value,
    label: t(opt.label),
  }));
});
const supportsSearch = computed(
  () => hasFetchOptions.value && props.fieldDef?.supportsSearch !== false,
);

async function loadAsyncOptions(search: string): Promise<void> {
  if (!props.fieldDef?.fetchOptions) {
    return;
  }
  const id = ++fetchRef.value;
  loading.value = true;
  try {
    const options = await props.fieldDef.fetchOptions(search || '');
    if (id === fetchRef.value) {
      asyncOptions.value = options;
    }
  } finally {
    if (id === fetchRef.value) {
      loading.value = false;
    }
  }
}

function onSearch(search: string): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void loadAsyncOptions(search);
  }, 300);
}

onMounted(() => {
  if (hasFetchOptions.value) {
    asyncOptions.value = [];
    void loadAsyncOptions('');
  }
});
onUnmounted(() => {
  clearTimeout(searchTimer);
});

// A field change reuses the same control instance — reload its options.
watch(
  () => props.fieldDef?.value,
  () => {
    if (hasFetchOptions.value) {
      asyncOptions.value = [];
      void loadAsyncOptions('');
    }
  },
);

const options = computed(() =>
  hasFetchOptions.value ? asyncOptions.value : staticOptions.value,
);

function chipLabel(option: WorkflowConditionBuilderOption | undefined): string {
  if (!option) {
    return '';
  }
  return option.supportingText
    ? `${option.supportingText}.${option.label}`
    : option.label;
}
</script>

<template>
  <div
    v-if="isBoolean"
    style="display: flex; align-items: center; min-height: 40px"
    :data-testid="dataTestid"
  >
    <Switch
      :data-testid="`${dataTestid}-switch`"
      :disabled="disabled"
      :checked="values[0] === 'true'"
      @change="(checked) => emit('change', [checked ? 'true' : 'false'])"
    />
  </div>
  <Input
    v-else-if="isText"
    :data-testid="dataTestid"
    :disabled="disabled"
    :placeholder="placeholder"
    :value="values.join(', ')"
    @update:value="
      (value) =>
        emit(
          'change',
          String(value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
    "
  />
  <Select
    v-else
    mode="multiple"
    :data-testid="dataTestid"
    :disabled="disabled"
    :loading="loading"
    :options="options.map((o) => ({ value: o.value, label: chipLabel(o) }))"
    :value="values"
    :placeholder="placeholder"
    :filter-option="supportsSearch ? () => true : undefined"
    style="width: 100%"
    @change="(values) => emit('change', values as string[])"
    @search="supportsSearch ? onSearch : undefined"
  />
</template>
