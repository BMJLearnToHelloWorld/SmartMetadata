<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import type { SearchFacet } from '@/catalog/searchFacets';
import {
  TAG_ASSETS_QUICK_FILTER_FIELDS,
  type TagAssetsQuickFilterField,
  type TagAssetsQuickFilterSelections,
} from '@/catalog/tagAssets';

const props = withDefaults(
  defineProps<{
    /** Facets from the latest search response (buckets drive the value lists). */
    facets: SearchFacet[];
    /** Quick-filter fields; pin TAG_ASSETS_DROPDOWN_ITEMS by default. */
    fields?: TagAssetsQuickFilterField[];
    modelValue: TagAssetsQuickFilterSelections;
  }>(),
  { fields: () => TAG_ASSETS_QUICK_FILTER_FIELDS },
);

const emit = defineEmits<{
  'update:modelValue': [value: TagAssetsQuickFilterSelections];
}>();

const { t } = useI18n();

/** Pin AssetsFilterBar: the filter menu picks which fields show a value dropdown. */
const activeFieldIds = computed({
  get: () => props.fields.filter((field) => field.facetId in props.modelValue).map((field) => field.facetId),
  set: (ids: string[]) => {
    const next: TagAssetsQuickFilterSelections = {};
    for (const id of ids) {
      next[id as keyof TagAssetsQuickFilterSelections] = props.modelValue[id as keyof TagAssetsQuickFilterSelections] ?? [];
    }
    emit('update:modelValue', next);
  },
});

const activeFields = computed(() =>
  props.fields.filter((field) => activeFieldIds.value.includes(field.facetId)),
);

const hasSelection = computed(() =>
  Object.values(props.modelValue).some((values) => (values ?? []).length > 0),
);

function facetBuckets(facetId: string): Array<{ key: string; count: number }> {
  return props.facets.find((facet) => facet.id === facetId)?.buckets ?? [];
}

function fieldValues(field: TagAssetsQuickFilterField): string[] {
  return props.modelValue[field.facetId] ?? [];
}

function setFieldValues(field: TagAssetsQuickFilterField, values: string[]): void {
  emit('update:modelValue', { ...props.modelValue, [field.facetId]: values });
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this select is mode="multiple" with plain string options, so normalise
 * to string terms here and keep the handler in string terms.
 */
function asStringArray(value: SelectValue): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return list.map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
}

function clearAll(): void {
  emit('update:modelValue', {});
}
</script>

<template>
  <div class="tag-asset-filters" data-testid="tag-asset-filters">
    <Select
      v-model:value="activeFieldIds"
      mode="multiple"
      :placeholder="t('label.filter-plural')"
      data-testid="tag-asset-filter-menu"
      :options="fields.map((field) => ({ value: field.facetId, label: t(field.labelKey) }))"
      style="min-width: 180px"
    />
    <Select
      v-for="field in activeFields"
      :key="field.facetId"
      :value="fieldValues(field)"
      mode="multiple"
      :placeholder="t(field.labelKey)"
      :data-testid="`tag-asset-filter-${field.facetId}`"
      :options="
        facetBuckets(field.facetId).map((bucket) => ({
          value: bucket.key,
          label: `${bucket.key} (${bucket.count})`,
        }))
      "
      style="min-width: 180px"
      @change="(values: SelectValue) => setFieldValues(field, asStringArray(values))"
    />
    <Button v-if="hasSelection" type="link" data-testid="tag-asset-clear-filters" @click="clearAll">
      {{ t('label.clear') }}
    </Button>
  </div>
</template>

<style scoped>
.tag-asset-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
</style>
