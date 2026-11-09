<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';

export interface AsyncSelectOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | string[] | null;
    multiple?: boolean;
    placeholder?: string;
    fetchOptions: (term: string) => Promise<AsyncSelectOption[]>;
    seedOptions?: AsyncSelectOption[];
    testId?: string;
    disabled?: boolean;
    allowClear?: boolean;
  }>(),
  {
    multiple: false,
    placeholder: '',
    seedOptions: () => [],
    testId: undefined,
    disabled: false,
    allowClear: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | string[] | null];
}>();

const loading = ref(false);
const fetched = ref<AsyncSelectOption[]>([]);
const generation = ref(0);

const options = computed(() => {
  const seen = new Set<string>();
  const merged: AsyncSelectOption[] = [];
  for (const option of [...props.seedOptions, ...fetched.value]) {
    if (!seen.has(option.value)) {
      seen.add(option.value);
      merged.push(option);
    }
  }
  return merged;
});

async function search(term: string): Promise<void> {
  const request = ++generation.value;
  loading.value = true;
  try {
    const result = await props.fetchOptions(term);
    if (request === generation.value) {
      fetched.value = result;
    }
  } catch {
    // A failed remote search leaves the mounted options in place.
    if (request === generation.value) {
      fetched.value = [];
    }
  } finally {
    if (request === generation.value) {
      loading.value = false;
    }
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearch(term: string): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void search(term);
  }, 300);
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this select only ever carries plain string values, so normalise to
 * string | string[] | null here and keep the rest in string terms.
 */
function onChange(value: SelectValue): void {
  if (value === undefined) {
    emit('update:modelValue', null);
    return;
  }
  const values = (Array.isArray(value) ? value : [value]).map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
  emit('update:modelValue', props.multiple ? values : (values[0] ?? null));
}

// Opening the menu searches '' and typing searches the text, so both can
// be in flight; only the latest may write.
onMounted(() => {
  void search('');
});

watch(
  () => props.seedOptions,
  (seeds) => {
    if (seeds.length > 0 && fetched.value.length === 0) {
      void search('');
    }
  },
);
</script>

<template>
  <Select
    :value="modelValue ?? undefined"
    :mode="multiple ? 'multiple' : undefined"
    show-search
    :disabled="disabled"
    :placeholder="placeholder"
    :options="options"
    :loading="loading"
    :allow-clear="allowClear"
    :data-testid="testId"
    style="width: 100%"
    :filter-option="false"
    @change="onChange"
    @search="onSearch"
    @dropdown-visible-change="(open: boolean) => open && search('')"
  />
</template>
