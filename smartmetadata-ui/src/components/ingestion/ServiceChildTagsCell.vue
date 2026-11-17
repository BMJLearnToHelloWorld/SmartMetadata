<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Popover, Tag, Tooltip } from 'ant-design-vue';

/**
 * Tag chips cell, ported from official
 * components/Tag/TagsViewer/TagsViewer.tsx (pin a3012259ca), POPOVER
 * display (the table default): tags deduped by tagFQN, sorted by
 * source ascending, capped at `sizeCap`, with a `+N more` button
 * opening a popover of the rest. Empty renders `--`
 * (NO_DATA_PLACEHOLDER). Chips carry no links: the product has no
 * tag/classification detail route to point at, and the overview
 * precedent (AssetOverviewFields) renders plain chips. The `+N
 * more` text is a literal in pin too (not localized). Generated
 * labels render the same chip: pin's distinct badge needs an
 * `entityFqn` the table column objects never pass.
 */
export interface CellTagLabel {
  tagFQN: string;
  name?: string;
  displayName?: string;
  description?: string;
  source?: string;
  labelType?: string;
  state?: string;
  style?: { color?: string; iconURL?: string };
}

const props = withDefaults(
  defineProps<{
    tags: CellTagLabel[];
    sizeCap?: number;
  }>(),
  { sizeCap: 3 },
);

/** Pin `getTagDisplay` (TagsPureUtils.ts): >3 levels collapse to first...last-two. */
function getTagDisplay(tagFqn: string): string {
  const levels = tagFqn.split('.');
  if (levels.length > 3) {
    return `${levels[0]}...${levels.slice(-2).join('.')}`;
  }
  return tagFqn;
}

/** Pin `getTagName` (TagsPureUtils.ts): displayName, name, then the FQN display form. */
function getTagName(tag: CellTagLabel): string {
  if (tag.displayName || tag.name) {
    return tag.displayName ?? tag.name ?? '';
  }
  const fqn = tag.source === 'Glossary' ? tag.tagFQN.split('.').slice(-2).join('.') : tag.tagFQN;
  return getTagDisplay(fqn) || tag.tagFQN;
}

const sortedTags = computed(() => {
  const seen = new Set<string>();
  const deduped = props.tags.filter((tag) => {
    if (seen.has(tag.tagFQN)) {
      return false;
    }
    seen.add(tag.tagFQN);
    return true;
  });
  return [...deduped].sort((a, b) => (a.source ?? '').localeCompare(b.source ?? ''));
});

const displayedTags = computed(() =>
  props.sizeCap < 0 ? sortedTags.value : sortedTags.value.slice(0, props.sizeCap),
);
const overflowTags = computed(() =>
  props.sizeCap < 0 ? [] : sortedTags.value.slice(props.sizeCap),
);
</script>

<template>
  <span v-if="sortedTags.length === 0" class="service-child-tags-cell__empty">--</span>
  <span v-else class="service-child-tags-cell">
    <Tooltip
      v-for="tag in displayedTags"
      :key="tag.tagFQN"
      :title="tag.description || tag.tagFQN"
    >
      <Tag
        :data-testid="`tag-${tag.tagFQN}`"
        :color="tag.style?.color"
        class="service-child-tags-cell__chip"
      >
        {{ getTagName(tag) }}
      </Tag>
    </Tooltip>
    <span v-if="overflowTags.length > 0" data-testid="popover-element">
      <Popover trigger="click" placement="bottom">
        <template #content>
          <span class="service-child-tags-cell__popover">
            <Tooltip
              v-for="tag in overflowTags"
              :key="tag.tagFQN"
              :title="tag.description || tag.tagFQN"
            >
              <Tag :data-testid="`tag-${tag.tagFQN}`" :color="tag.style?.color">
                {{ getTagName(tag) }}
              </Tag>
            </Tooltip>
          </span>
        </template>
        <button type="button" class="service-child-tags-cell__more" data-testid="plus-more-count">
          +{{ overflowTags.length }} more
        </button>
      </Popover>
    </span>
  </span>
</template>

<style scoped>
.service-child-tags-cell {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.service-child-tags-cell__empty {
  color: var(--sm-text-quaternary);
}

.service-child-tags-cell__chip {
  margin-right: 0;
}

.service-child-tags-cell__more {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sm-brand);
  font-size: 12px;
  cursor: pointer;
}

.service-child-tags-cell__popover {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
}
</style>
