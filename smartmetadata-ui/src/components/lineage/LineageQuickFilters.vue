<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select, Space, Tooltip } from 'ant-design-vue';
import {
  LINEAGE_QUICK_FILTER_FIELDS,
  normalizeLineageQuickFilters,
  type LineageQuickFilterKey,
  type LineageQuickFilterSelection,
} from '@/lineage/quickFilters';

const props = defineProps<{
  value: LineageQuickFilterSelection[];
}>();

const emit = defineEmits<{
  change: [selections: LineageQuickFilterSelection[]];
}>();

const { t } = useI18n();

// Free-form tag entry per field: pin's quick filters offer async
// search-backed value pickers (ExploreQuickFilterField); the product has no
// such picker for these fields, so values are typed as search terms. The
// emitted JSON shape is identical to pin's getQuickFilterQuery output.
const draft = reactive<Record<LineageQuickFilterKey, string[]>>({
  domains: [],
  owners: [],
  tag: [],
  column: [],
});

function syncFromProps(next: LineageQuickFilterSelection[]): void {
  for (const field of LINEAGE_QUICK_FILTER_FIELDS) {
    draft[field.key] = next.find((item) => item.key === field.key)?.values ?? [];
  }
}

watch(() => props.value, syncFromProps, { immediate: true, deep: true });

const hasAny = computed(() =>
  LINEAGE_QUICK_FILTER_FIELDS.some((field) => draft[field.key].length > 0),
);

function onFieldChange(key: LineageQuickFilterKey, values: unknown): void {
  draft[key] = Array.isArray(values)
    ? values.filter((item): item is string => typeof item === 'string')
    : [];
  emit(
    'change',
    normalizeLineageQuickFilters(
      LINEAGE_QUICK_FILTER_FIELDS.map((field) => ({ key: field.key, values: draft[field.key] })),
    ),
  );
}

function onClear(): void {
  for (const field of LINEAGE_QUICK_FILTER_FIELDS) {
    draft[field.key] = [];
  }
  emit('change', []);
}
</script>

<template>
  <div data-testid="lineage-quick-filters">
    <Space wrap align="center">
      <Tooltip :title="t('lineage.quickFilterHelp')" placement="top">
        <span>{{ t('lineage.quickFilters') }}</span>
      </Tooltip>
      <Select
        v-for="field in LINEAGE_QUICK_FILTER_FIELDS"
        :key="field.key"
        :value="draft[field.key]"
        mode="tags"
        allow-clear
        class="lineage-quick-filters__select"
        :data-testid="`lineage-quick-filter-${field.key}`"
        :placeholder="t(field.labelKey)"
        :aria-label="t(field.labelKey)"
        @update:value="(values: unknown) => onFieldChange(field.key, values)"
      />
      <Button
        v-if="hasAny"
        data-testid="lineage-quick-filter-clear"
        type="link"
        @click="onClear"
      >
        {{ t('lineage.clearFilters') }}
      </Button>
    </Space>
  </div>
</template>

<style scoped>
.lineage-quick-filters__select {
  min-width: 160px;
}
</style>
