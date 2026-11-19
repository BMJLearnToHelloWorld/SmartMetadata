<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Select, Space, Tag, Typography } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { StarOutlined } from '@ant-design/icons-vue';
import type { SchemaRow, TagRef } from '@/types/api';
import type { AssetTagOption, TagSource } from '@/types/governance';

/**
 * One Tags / Glossary Terms cell of the schema table (D-F2 read side +
 * write path), mirroring the official TableTags cell: the row's tags are
 * split by source (the two columns share the row's single tags list),
 * Generated labels get the distinct chip, and an editable cell offers
 * the same multi-select the entity governance edit uses, over the same
 * catalog options filtered to this cell's source.
 *
 * A tag with no source renders in the Classification column: the pin
 * TagLabel schema defaults `source` to Classification, so a sourceless
 * label is a classification label, not a hidden one. The merge rule
 * lives in the caller (onChange receives only this source's selection;
 * the caller merges it with the row's other-source tags before writing,
 * as the official TagsContainerV2 does).
 */
const props = defineProps<{
  row: SchemaRow;
  source: TagSource;
  options: AssetTagOption[];
  editable: boolean;
  onChange: (tagFqns: string[]) => void;
}>();

const sourceTags = computed(() =>
  (props.row.tags ?? []).filter(
    (tag) => tag.source === props.source || (props.source === 'Classification' && !tag.source),
  ),
);

const selectedFqns = computed(() => sourceTags.value.map((tag) => tag.tagFQN));

const sourceOptions = computed(() => props.options.filter((option) => option.source === props.source));

function isGeneratedTag(tag: TagRef): boolean {
  return tag.labelType === 'Generated';
}

/**
 * antd Select emits SelectValue (RawValue | LabeledValue, single or array);
 * this select only ever carries plain string values, so normalise to
 * string terms here and keep the handler in string terms (same convention
 * as MetricCreateDrawer.asStringArray).
 */
function asStringArray(value: SelectValue): string[] {
  const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return list.map((item) =>
    typeof item === 'object' && item !== null ? String(item.value) : String(item),
  );
}

function handleChange(value: SelectValue): void {
  props.onChange(asStringArray(value));
}
</script>

<template>
  <div :data-testid="`schema-tag-cell-${source}-${row.key}`">
    <Select
      v-if="editable"
      :value="selectedFqns"
      mode="multiple"
      allow-clear
      :data-testid="`schema-tag-select-${source}-${row.key}`"
      style="min-width: 160px; width: 100%"
      @change="handleChange"
    >
      <Select.Option v-for="option in sourceOptions" :key="option.tagFQN" :value="option.tagFQN">
        {{ option.displayName || option.name }}
      </Select.Option>
    </Select>
    <Space v-else wrap>
      <Tag
        v-for="tag in sourceTags"
        :key="tag.tagFQN"
        :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
      >
        <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" />
        {{ tag.name }}
      </Tag>
      <Typography.Text v-if="!sourceTags.length" type="secondary">—</Typography.Text>
    </Space>
  </div>
</template>

<style scoped>
/* Generated-tag badge (D-F4), same rules as AssetOverviewFields and
   AssetDetailPiece: visual distinction only — the product primary tint
   on the same antd Tag. */
.asset-overview__generated-tag.ant-tag {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-color: var(--sm-color-primary-50);
}

.asset-overview__generated-tag-icon {
  font-size: 12px;
  margin-inline-end: 4px;
}
</style>
