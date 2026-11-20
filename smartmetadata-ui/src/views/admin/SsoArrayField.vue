<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { isSsoValidUrl, splitSsoCsv } from '@/admin/ssoProviders';
import { startCase } from '@/utils/text';

const props = withDefaults(
  defineProps<{
    fieldId: string;
    name: string;
    label: string;
    required?: boolean;
    deprecated?: boolean;
    modelValue?: string | string[];
    placeholder?: string;
    disabled?: boolean;
    hasFieldError?: boolean;
    isUrlField?: boolean;
    isScopeField?: boolean;
    options?: string[];
  }>(),
  {
    required: false,
    deprecated: false,
    modelValue: undefined,
    placeholder: '',
    disabled: false,
    hasFieldError: false,
    isUrlField: false,
    isScopeField: false,
    options: () => [],
  },
);

const emit = defineEmits<{
  change: [value: string | string[]];
  'clear-error': [fieldId: string];
}>();

const { t } = useI18n();
const inputText = ref('');

// Pin `getArrayFieldValue`: scope splits a stored string on spaces;
// a non-string scope value passes through; other fields default to [].
const value = computed<string[]>(() => {
  if (props.isScopeField) {
    return typeof props.modelValue === 'string'
      ? props.modelValue.split(' ').filter(Boolean)
      : ((props.modelValue ?? []) as string[]);
  }
  return ((props.modelValue ?? []) as string[]).slice();
});

const hasInvalidUrls = computed(
  () =>
    props.isUrlField &&
    value.value.some((url) => !isSsoValidUrl(url)),
);
// Pin `getArrayFieldErrorState`: validation errors OR invalid URLs.
const hasError = computed(
  () => props.hasFieldError || hasInvalidUrls.value,
);

function toStored(items: string[]): string | string[] {
  return props.isScopeField ? items.join(' ') : items;
}

// Pin `handleChange`: onChange plus clearing this field's own error.
// Used by chip removal and option insertion only.
function handleChange(items: string[]): void {
  emit('change', toStored(items));
  emit('clear-error', props.fieldId);
}

// Pin `handleInputSplit`: whole input for URL fields, CSV split for
// others, deduplicated; onChange only, no error clearing.
function handleInputSplit(inputValue: string): void {
  if (!inputValue) {
    return;
  }
  const additions = props.isUrlField
    ? [inputValue]
    : splitSsoCsv(inputValue);
  const unique = [...new Set([...value.value, ...additions])];
  emit('change', toStored(unique));
}

function handleEnter(): void {
  if (!inputText.value) {
    return;
  }
  handleInputSplit(inputText.value);
  inputText.value = '';
}

// Pin `handlePaste`: JSON-array parse first (String() per item); only a
// parse failure falls back to CSV splitting. A JSON value that is not
// an array yields nothing. Dedupe-merge, onChange only.
async function handlePaste(): Promise<void> {
  const text = await navigator.clipboard.readText().catch(() => '');
  if (!text) {
    return;
  }
  let processed: string[] = [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      processed = parsed.map((item) => String(item));
    }
  } catch {
    processed = splitSsoCsv(text);
  }
  if (processed.length > 0) {
    emit('change', toStored([...new Set([...value.value, ...processed])]));
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'v' && props.options.length === 0) {
    event.preventDefault();
    void handlePaste();
  }
}

function handleRemove(item: string): void {
  handleChange(value.value.filter((entry) => entry !== item));
}

function handleOptionSelect(event: Event): void {
  const selected = (event.target as HTMLSelectElement).value;
  (event.target as HTMLSelectElement).value = '';
  if (selected) {
    handleChange([...value.value, selected]);
  }
}

const unselectedOptions = computed(() =>
  props.options.filter((option) => !value.value.includes(option)),
);
</script>

<template>
  <div :class="['field-error', { 'has-error': hasError }]">
    <div
      :class="[
        'sso-array-field-label',
        { 'required-field': required, 'sso-deprecated-field-label': deprecated },
      ]"
    >
      {{ label }}
      <span v-if="deprecated" class="sso-deprecated-tag">{{
        t('sso.deprecated')
      }}</span>
    </div>
    <div
      :data-testid="`sso-configuration-form-array-field-template-${name}`"
      role="combobox"
    >
      <!-- role="combobox" matches pin's Autocomplete: the form-level Enter
           guard exempts combobox inputs so Enter inserts a tag here. -->
      <span
        v-for="item in value"
        :key="item"
        class="sso-array-chip"
        data-testid="sso-array-chip"
      >
        {{ item }}
        <button
          type="button"
          :disabled="disabled"
          @click="handleRemove(item)"
        >
          ×
        </button>
      </span>
      <select
        v-if="options.length > 0"
        :id="fieldId"
        :aria-label="startCase(name)"
        :disabled="disabled"
        @change="handleOptionSelect"
      >
        <option value="">{{ placeholder }}</option>
        <option
          v-for="option in unselectedOptions"
          :key="option"
          :value="option"
        >
          {{ option }}
        </option>
      </select>
      <input
        v-else
        :id="fieldId"
        v-model="inputText"
        :aria-label="startCase(name)"
        :disabled="disabled"
        :placeholder="placeholder"
        type="text"
        @keydown="handleKeyDown"
        @keydown.enter="handleEnter"
      />
      <div v-if="hasInvalidUrls" class="sso-array-field-hint">
        {{ t('sso.validUrlsRequired') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.sso-array-chip {
  display: inline-flex;
  align-items: center;
}
</style>
