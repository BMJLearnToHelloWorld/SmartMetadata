<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Input, Select, Tag } from 'ant-design-vue';
import type { DefaultOptionType, SelectValue } from 'ant-design-vue/es/select';
import { useI18n } from 'vue-i18n';
import { SEARCHABLE_ARGUMENTS } from '@/utils/notifications/alertConstants';
import {
  getSelectArgumentConfig,
  resolveAlertAiArgumentLabels,
  searchAlertAiArgumentOptions,
  type AlertSelectItem,
} from '@/utils/notifications/alertArgumentSearch';
import type { AlertSourceSearch, AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import {
  getCommaSeparatedStringArray,
  getCommaSeparatedValues,
  getListValue,
  getTextArgumentCopy,
} from '@/utils/notifications/alertFormUtils';
import type { TranslateFn } from '@/utils/notifications/alertUtils';

/**
 * One rule argument's input, ported from pin
 * AlertAiRuleSection.component.tsx (RuleArgumentField). Dispatch, in
 * order: a fixed enum list renders a local multi-select; a searchable
 * argument renders a remote autocomplete; anything else renders a
 * comma-separated text input.
 */
const props = withDefaults(
  defineProps<{
    argument: string;
    inputValue?: string[];
    isViewOnly?: boolean;
    isLabelHidden?: boolean;
    testId?: string;
    error?: string;
    sourceSearch: AlertSourceSearch;
    supportedEventTypes?: string[];
    hooks: AlertSearchHooks;
  }>(),
  {
    inputValue: undefined,
    isViewOnly: false,
    isLabelHidden: false,
    testId: undefined,
    error: undefined,
    supportedEventTypes: undefined,
  },
);
const emit = defineEmits<{ 'update:input': [value: string[]] }>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;
const selectConfig = computed(() =>
  getSelectArgumentConfig(props.argument, translate, props.supportedEventTypes),
);
const textCopy = computed(() => getTextArgumentCopy(props.argument, translate));
const isSearchable = computed(() => SEARCHABLE_ARGUMENTS.has(props.argument));
const selectedValues = computed(() => getListValue(props.inputValue));

function emitValues(next: string[]): void {
  emit('update:input', next);
}

const textValue = computed({
  get: () => getCommaSeparatedValues(props.inputValue),
  set: (next: string) => emitValues(getCommaSeparatedStringArray(next)),
});

function onSelectChange(values: SelectValue): void {
  const next = (Array.isArray(values) ? values : [values]).map((value) => String(value));
  emitValues(next);
}

function filterLocal(input: string, option?: DefaultOptionType): boolean {
  const search = input.toLocaleLowerCase();
  return [String(option?.value ?? ''), String(option?.label ?? '')].some((text) =>
    text.toLocaleLowerCase().includes(search),
  );
}

/* --- Searchable autocomplete state (AiArgumentAutocomplete) --- */

const NO_RESULTS_ID = '__no_results__';

const items = ref<AlertSelectItem[]>(
  selectedValues.value.map((value) => ({ id: value, label: value })),
);
const hasNoResults = ref(false);
const resetKey = ref(0);

function mergeItems(next: AlertSelectItem[], current: AlertSelectItem[]): AlertSelectItem[] {
  const seen = new Set<string>();
  const merged: AlertSelectItem[] = [];
  for (const item of [...next, ...current]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

watch(selectedValues, (values) => {
  items.value = mergeItems(
    values.map((value) => ({ id: value, label: value })),
    items.value,
  );
});

// The first page of options, on mount and whenever the argument or the source search changes.
watch(
  [() => props.argument, () => props.sourceSearch],
  () => {
    if (!isSearchable.value) {
      return;
    }
    void searchAlertAiArgumentOptions(
      { argument: props.argument, searchText: '', sourceSearch: props.sourceSearch },
      props.hooks,
    ).then((nextItems) => {
      items.value = mergeItems(nextItems, items.value);
    });
  },
  { immediate: true },
);

// Saved values can arrive after mount and lie outside the first page, so resolve any selected
// value still shown by its raw FQN. Tracking only the current selection keeps this bounded and
// stops a value the search cannot find from being looked up again.
const resolveAttempts: { argument: string; values: Set<string> } = {
  argument: props.argument,
  values: new Set<string>(),
};
watch(
  [() => props.argument, items, selectedValues],
  () => {
    if (!isSearchable.value) {
      return;
    }
    const attempted = new Set(
      resolveAttempts.argument === props.argument
        ? selectedValues.value.filter((value) => resolveAttempts.values.has(value))
        : [],
    );
    const unresolved = selectedValues.value.filter(
      (value) =>
        !attempted.has(value) &&
        !items.value.some((item) => item.id === value && item.label !== value),
    );
    unresolved.forEach((value) => attempted.add(value));
    resolveAttempts.argument = props.argument;
    resolveAttempts.values = attempted;
    if (unresolved.length === 0) {
      return;
    }
    void resolveAlertAiArgumentLabels(props.argument, unresolved).then((resolvedItems) => {
      items.value = mergeItems(resolvedItems, items.value);
    });
  },
  { immediate: true },
);

const displayItems = computed<AlertSelectItem[]>(() =>
  hasNoResults.value
    ? [{ id: NO_RESULTS_ID, isDisabled: true, label: t('label.no-data-found') }]
    : items.value,
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
function onSearch(text: string): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void searchAlertAiArgumentOptions(
      { argument: props.argument, searchText: text, sourceSearch: props.sourceSearch },
      props.hooks,
    ).then((nextItems) => {
      hasNoResults.value = text.trim() !== '' && nextItems.length === 0;
      items.value = mergeItems(
        nextItems,
        [
          ...items.value.filter((item) => selectedValues.value.includes(item.id)),
          ...selectedValues.value.map((value) => ({ id: value, label: value })),
        ],
      );
    });
  }, 500);
}

onBeforeUnmount(() => {
  clearTimeout(searchTimer);
});

function onDropdownVisibleChange(open: boolean): void {
  if (!open && hasNoResults.value && selectedValues.value.length === 0) {
    hasNoResults.value = false;
    resetKey.value += 1;
    void searchAlertAiArgumentOptions(
      { argument: props.argument, searchText: '', sourceSearch: props.sourceSearch },
      props.hooks,
    ).then((nextItems) => {
      items.value = mergeItems(nextItems, []);
    });
  }
}

function resolveLabel(value: string): string {
  return items.value.find((item) => item.id === value)?.label ?? value;
}
</script>

<template>
  <div>
    <label v-if="!isLabelHidden" class="rule-argument-field__label">
      {{ selectConfig?.label ?? textCopy.label }}
    </label>
    <Select
      v-if="selectConfig"
      :value="selectedValues"
      mode="multiple"
      show-search
      :filter-option="filterLocal"
      :disabled="isViewOnly"
      :placeholder="selectConfig.placeholder"
      :aria-label="isLabelHidden ? selectConfig.label : undefined"
      :data-testid="testId ?? `${argument}-autocomplete`"
      :status="error ? 'error' : undefined"
      style="width: 100%"
      :options="selectConfig.items.map((item) => ({ value: item.id, label: item.label }))"
      @change="onSelectChange"
    />
    <Select
      v-else-if="isSearchable"
      :key="resetKey"
      :value="selectedValues"
      mode="multiple"
      show-search
      :filter-option="() => true"
      :disabled="isViewOnly"
      :placeholder="textCopy.placeholder"
      :aria-label="isLabelHidden ? textCopy.label : undefined"
      :data-testid="testId ?? `${argument}-autocomplete`"
      :status="error ? 'error' : undefined"
      style="width: 100%"
      :options="
        displayItems.map((item) => ({
          value: item.id,
          label: item.label,
          disabled: item.isDisabled,
        }))
      "
      @search="onSearch"
      @change="onSelectChange"
      @dropdown-visible-change="onDropdownVisibleChange"
    >
      <template #tagRender="{ value: tagValue, closable, onClose }">
        <Tag :closable="closable && !isViewOnly" @close="onClose">
          {{ resolveLabel(String(tagValue)) }}
        </Tag>
      </template>
    </Select>
    <Input
      v-else
      v-model:value="textValue"
      :disabled="isViewOnly"
      :placeholder="textCopy.placeholder"
      :aria-label="isLabelHidden ? textCopy.label : undefined"
      :data-testid="testId ?? `${argument}-input`"
      :status="error ? 'error' : undefined"
    />
    <div v-if="error" class="rule-argument-field__hint">{{ error }}</div>
  </div>
</template>

<style scoped>
.rule-argument-field__label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
}

.rule-argument-field__hint {
  color: var(--sm-color-error);
  font-size: 12px;
  margin-top: 4px;
}
</style>
