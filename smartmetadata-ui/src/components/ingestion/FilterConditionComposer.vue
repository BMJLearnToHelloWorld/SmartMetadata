<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Input, Select } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import {
  FILTER_OPERATOR_LABEL_KEYS,
  FILTER_OPERATORS,
  type FilterCondition,
  type FilterOperator,
} from '@/ingestion/filterPatterns';

/**
 * Port of official FilterConditionComposer (pin a3012259ca): an
 * operator select, a value input, and an Add button. Enter commits;
 * a blank value disables Add; committing clears the input but keeps
 * the operator. The regex operator shows the regex placeholder in a
 * monospace input. Focus reports the field name to the doc panel;
 * blur reports an empty field.
 */
const props = withDefaults(
  defineProps<{
    defaultOperator: FilterOperator;
    fieldName: string;
    placeholder: string;
    tone?: 'include' | 'exclude';
    disabled?: boolean;
  }>(),
  { tone: 'include', disabled: false },
);

const emit = defineEmits<{
  add: [condition: FilterCondition];
  focus: [fieldName: string];
}>();

const { t } = useI18n();
const operator = ref<FilterOperator>(props.defaultOperator);
const value = ref('');
const trimmedValue = computed(() => value.value.trim());
const isRegex = computed(() => operator.value === 'regex');

const operatorOptions = computed(() =>
  FILTER_OPERATORS.map((op) => ({ value: op, label: t(FILTER_OPERATOR_LABEL_KEYS[op]) })),
);

function commit(): void {
  if (!trimmedValue.value) {
    return;
  }
  emit('add', { op: operator.value, value: trimmedValue.value });
  value.value = '';
}
</script>

<template>
  <div class="filter-condition-composer">
    <Select
      v-model:value="operator"
      :options="operatorOptions"
      :disabled="disabled"
      :data-testid="`${tone}-operator-select`"
      style="width: 150px"
    />
    <Input
      v-model:value="value"
      :class="{ 'filter-condition-regex': isRegex }"
      :placeholder="isRegex ? '^prefix.*$' : placeholder"
      :disabled="disabled"
      :data-testid="`${tone}-filter-input`"
      @focus="emit('focus', fieldName)"
      @blur="emit('focus', '')"
      @keydown.enter.prevent="commit"
    />
    <Button
      type="primary"
      :danger="tone === 'exclude'"
      :disabled="!trimmedValue || disabled"
      :data-testid="`${tone}-add-button`"
      @click="commit"
    >
      <template #icon><PlusOutlined /></template>
      {{ t('crud.add') }}
    </Button>
  </div>
</template>

<style scoped>
.filter-condition-composer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-condition-composer :deep(.ant-input) {
  flex: 1;
  min-width: 0;
}

.filter-condition-regex {
  font-family: monospace;
}
</style>
