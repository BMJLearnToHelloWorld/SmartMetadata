<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import type { DefaultOptionType, SelectValue } from 'ant-design-vue/es/select';
import { useI18n } from 'vue-i18n';
import { Select } from 'ant-design-vue';
import type { EntityRef } from '@/types/api';
import { getEntityName } from '@/components/shared/profilePictureUtils';

/**
 * Official IncidentManager filter assignee: UserTeamSelectableList with
 * `options={assignees}` from useIncidentAssignees — client search within the
 * aggregate list only, no global user/team search.
 * ADR:2026-10-29-incident-assignee-filter-lists-aggregated-assignees
 */
const props = withDefaults(
  defineProps<{
    modelValue: EntityRef[];
    options: EntityRef[];
    testId?: string;
  }>(),
  { testId: 'incident-filter-assignee' },
);

const emit = defineEmits<{ 'update:modelValue': [value: EntityRef[]] }>();

const { t } = useI18n();

interface PickerOption {
  value: string;
  label: string;
  ref: EntityRef;
}

const refByValue = new Map<string, EntityRef>();

function optionKey(ref: EntityRef): string | undefined {
  if (!ref.name || !ref.type) {
    return undefined;
  }
  return `${ref.type}:${ref.name}`;
}

function upsertRef(ref: EntityRef): void {
  const key = optionKey(ref);
  if (key) {
    refByValue.set(key, ref);
  }
}

function buildOptions(refs: EntityRef[]): PickerOption[] {
  refByValue.clear();
  const seen = new Set<string>();
  const rows: PickerOption[] = [];
  for (const ref of refs) {
    const key = optionKey(ref);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    upsertRef(ref);
    rows.push({
      value: key,
      label: getEntityName(ref),
      ref,
    });
  }
  return rows;
}

const selectOptions = computed(() => {
  const merged = [...props.options];
  for (const ref of props.modelValue) {
    const key = optionKey(ref);
    if (key && !merged.some((row) => optionKey(row) === key)) {
      merged.push(ref);
    }
  }
  return buildOptions(merged);
});

const selected = computed<string | undefined>(() => {
  const ref = props.modelValue[0];
  const key = ref ? optionKey(ref) : undefined;
  return key;
});

function filterOption(input: string, option?: DefaultOptionType): boolean {
  const haystack = `${String(option?.label ?? '')}`.toLowerCase();
  return haystack.includes(input.toLowerCase());
}

function onSelectChange(values: SelectValue): void {
  if (values === undefined || values === null || values === '') {
    emit('update:modelValue', []);
    return;
  }
  const key = typeof values === 'object' && values !== null ? String(values.value) : String(values);
  const ref = refByValue.get(key);
  emit('update:modelValue', ref ? [ref] : []);
}

watch(
  () => props.options,
  () => {
    buildOptions([...props.options, ...props.modelValue]);
  },
  { immediate: true },
);
</script>

<template>
  <Select
    :value="selected"
    show-search
    allow-clear
    :placeholder="t('label.assignee')"
    :options="selectOptions"
    :data-testid="testId"
    style="width: 100%"
    :filter-option="filterOption"
    @change="onSelectChange"
  />
</template>