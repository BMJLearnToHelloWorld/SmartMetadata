/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * One Tags / Glossary Terms cell of the pipeline tasks table (D-2 batch
 * 5b), mirroring the official `TableTags` cell via the product's
 * `SchemaTagCell`: the row's tags are split by source (the two columns
 * share the row's single tags list), Generated labels get the distinct
 * chip, and an editable cell offers the same multi-select over the same
 * catalog options filtered to this cell's source.
 *
 * Unlike `SchemaTagCell` this cell takes the row's tag list directly
 * (a pipeline task has no `SchemaRow.key`), so the test id is keyed by
 * the task name instead. A tag with no source renders in the
 * Classification column: the pin TagLabel schema defaults `source` to
 * Classification. The merge rule lives in the caller (`onChange`
 * receives only this source's selection; the caller merges it with the
 * row's other-source tags before writing, as the official TagsContainerV2
 * does).
 */
import { computed } from 'vue';
import { Select, Space, Tag, Typography } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import { StarOutlined } from '@ant-design/icons-vue';
import type { TagRef } from '@/types/api';
import type { AssetTagOption, TagSource } from '@/types/governance';

const props = defineProps<{
  tags: TagRef[];
  source: TagSource;
  options: AssetTagOption[];
  editable: boolean;
  testIdPrefix: string;
  onChange: (tagFqns: string[]) => void;
}>();

const sourceTags = computed(() =>
  props.tags.filter(
    (tag) => tag.source === props.source || (props.source === 'Classification' && !tag.source),
  ),
);

const selectedFqns = computed(() => sourceTags.value.map((tag) => tag.tagFQN));

const sourceOptions = computed(() => props.options.filter((option) => option.source === props.source));

function isGeneratedTag(tag: TagRef): boolean {
  return tag.labelType === 'Generated';
}

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
  <div :data-testid="`${testIdPrefix}-${source}`">
    <Select
      v-if="editable"
      :value="selectedFqns"
      mode="multiple"
      allow-clear
      :data-testid="`${testIdPrefix}-select-${source}`"
      style="min-width: 160px; width: 100%"
      @change="handleChange"
    >
      <Select.Option v-for="option in sourceOptions" :key="option.tagFQN" :value="option.tagFQN">
        {{ option.displayName || option.name }}
      </Select.Option>
    </Select>
    <Space v-else wrap size="small">
      <Tag
        v-for="tag in sourceTags"
        :key="tag.tagFQN"
        :class="isGeneratedTag(tag) ? 'asset-overview__generated-tag' : undefined"
      >
        <StarOutlined v-if="isGeneratedTag(tag)" class="asset-overview__generated-tag-icon" aria-hidden="true" />
        {{ tag.name }}
      </Tag>
      <Typography.Text v-if="sourceTags.length === 0" type="secondary">—</Typography.Text>
    </Space>
  </div>
</template>

<style scoped>
/* Generated-tag badge (D-F4), same rules as SchemaTagCell and
   AssetOverviewFields: visual distinction only — the product primary tint
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
