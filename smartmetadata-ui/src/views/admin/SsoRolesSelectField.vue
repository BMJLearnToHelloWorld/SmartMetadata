<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { searchSsoRoles } from '@/api/ssoRoles';
import { showSsoErrorToast } from '@/admin/ssoToasts';

const props = withDefaults(
  defineProps<{
    fieldId: string;
    name: string;
    label: string;
    required?: boolean;
    modelValue?: string[];
    placeholder?: string;
    disabled?: boolean;
    hasFieldError?: boolean;
  }>(),
  {
    required: false,
    modelValue: () => [],
    placeholder: '',
    disabled: false,
    hasFieldError: false,
  },
);

const emit = defineEmits<{
  change: [value: string[]];
  'clear-error': [fieldId: string];
}>();

const { t } = useI18n();

interface RoleOption {
  label: string;
  value: string;
}

const roleOptions = ref<RoleOption[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function toOptions(
  roles: Array<{ displayName?: string; name: string }>,
): RoleOption[] {
  return roles.map((role) => ({
    label: role.displayName || role.name,
    value: role.name,
  }));
}

async function loadInitialRoles(): Promise<void> {
  try {
    roleOptions.value = toOptions(await searchSsoRoles(''));
  } catch (error) {
    showSsoErrorToast(error, t('sso.unexpectedError'), 'GET');
  }
}

onMounted(() => {
  void loadInitialRoles();
});

// Pin's debounced search reads the latest options and selection when it
// fires: selected options stay first, then fresh results excluding the
// selected ones.
async function runSearch(searchText: string): Promise<void> {
  try {
    const searchOpts = toOptions(await searchSsoRoles(searchText));
    const selectedSet = new Set(props.modelValue);
    const kept = roleOptions.value.filter((option) =>
      selectedSet.has(option.value),
    );
    roleOptions.value = [
      ...kept,
      ...searchOpts.filter((option) => !selectedSet.has(option.value)),
    ];
  } catch (error) {
    showSsoErrorToast(error, t('sso.unexpectedError'), 'GET');
  }
}

function handleSearch(searchText: string): void {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void runSearch(searchText);
  }, 300);
}

onBeforeUnmount(() => {
  if (searchTimer !== undefined) {
    clearTimeout(searchTimer);
  }
});

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or
 * array); this multiple select only ever carries plain string values,
 * so normalise to string[] here (same shape as UserTeamPicker).
 */
function handleChange(value: SelectValue): void {
  const newValue = (
    value === undefined ? [] : Array.isArray(value) ? value : [value]
  ).map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
  emit('change', newValue);
  emit('clear-error', props.fieldId);
}
</script>

<template>
  <div :class="['field-error', { 'has-error': hasFieldError }]">
    <div
      :class="['sso-array-field-label', { 'required-field': required }]"
    >
      {{ label }}
    </div>
    <div :data-testid="`sso-configuration-form-array-field-template-${name}`">
      <Select
        :id="fieldId"
        mode="multiple"
        show-search
        :disabled="disabled"
        :filter-option="() => true"
        :options="roleOptions"
        :placeholder="placeholder"
        :value="modelValue"
        @change="handleChange"
        @search="handleSearch"
      />
    </div>
  </div>
</template>
