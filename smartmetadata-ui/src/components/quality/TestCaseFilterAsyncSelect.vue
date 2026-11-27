<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official searchable test-case filter select (useTestCaseFilterOptions
  + FilterChip searchable). Vue3 + ant-design-vue. No CCL copy.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import type { TestCaseFilterOption } from '@/quality/testCaseFilterOptions';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    testId?: string;
    /** Official debounceFetch* uses 1000ms. */
    debounceMs?: number;
    width?: string;
    /**
     * Official table/service/dataProduct search remotely.
     * Official tier fetches once and filters the loaded options locally.
     */
    remote?: boolean;
    fetchOptions: (term: string) => Promise<TestCaseFilterOption[]>;
  }>(),
  {
    placeholder: '',
    testId: undefined,
    debounceMs: 1000,
    width: '200px',
    remote: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
}>();

const loading = ref(false);
const fetched = ref<TestCaseFilterOption[]>([]);
const generation = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const options = computed(() => {
  const seen = new Set<string>();
  const merged: TestCaseFilterOption[] = [];
  if (props.modelValue && !fetched.value.some((option) => option.value === props.modelValue)) {
    merged.push({ value: props.modelValue, label: props.modelValue });
    seen.add(props.modelValue);
  }
  for (const option of fetched.value) {
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
    if (request === generation.value) {
      fetched.value = [];
    }
  } finally {
    if (request === generation.value) {
      loading.value = false;
    }
  }
}

function onSearch(term: string): void {
  if (!props.remote) {
    return;
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void search(term);
  }, props.debounceMs);
}

function onChange(value: SelectValue): void {
  const next =
    value === undefined || value === null
      ? ''
      : typeof value === 'object'
        ? String((value as { value?: string }).value ?? '')
        : String(value);
  emit('update:modelValue', next);
  emit('change', next);
}

onMounted(() => {
  void search('');
});

onUnmounted(() => {
  clearTimeout(searchTimer);
});
</script>

<template>
  <Select
    :value="modelValue || undefined"
    show-search
    allow-clear
    :placeholder="placeholder"
    :loading="loading"
    :filter-option="remote ? false : true"
    :option-filter-prop="remote ? undefined : 'label'"
    :data-testid="testId"
    :style="{ width }"
    @change="onChange"
    @search="onSearch"
    @dropdown-visible-change="(open: boolean) => open && remote && search('')"
  >
    <Select.Option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    >
      <div class="tc-filter-option" :data-testid="`tc-filter-option-${option.value}`">
        <div v-if="option.subLabel" class="tc-filter-option__sub">{{ option.subLabel }}</div>
        <div>{{ option.label }}</div>
      </div>
    </Select.Option>
  </Select>
</template>

<style scoped>
.tc-filter-option__sub {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
</style>
