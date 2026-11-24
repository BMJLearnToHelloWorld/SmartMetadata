<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { QueryBuilderFieldDef, QueryFieldOption, QueryGroup } from '@/catalog/queryBuilder';
import AdvancedSearchGroup from './AdvancedSearchGroup.vue';

/**
 * Explore advanced-search QueryBuilder (pin `AdvanceSearchModal` +
 * `QueryBuilder`, `conjunctionMode="editable"`, `groupMode="nested"`):
 * the root group; nesting lives in `AdvancedSearchGroup`.
 */
const props = withDefaults(
  defineProps<{
    modelValue: QueryGroup;
    fields: QueryBuilderFieldDef[];
    fetchOptions: (field: QueryBuilderFieldDef, searchText: string) => Promise<QueryFieldOption[]>;
    testIdPrefix?: string;
  }>(),
  { testIdPrefix: 'advanced-search' },
);

const emit = defineEmits<{ 'update:modelValue': [group: QueryGroup] }>();
</script>

<template>
  <div data-testid="advanced-search-builder">
    <AdvancedSearchGroup
      :group="props.modelValue"
      :fields="props.fields"
      :fetch-options="props.fetchOptions"
      :test-id-prefix="props.testIdPrefix"
      @update:group="emit('update:modelValue', $event)"
    />
  </div>
</template>
