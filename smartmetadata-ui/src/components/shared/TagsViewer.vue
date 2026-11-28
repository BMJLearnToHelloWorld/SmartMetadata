<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Official TagsViewer (components/Tag/TagsViewer/TagsViewer.tsx).
  Vue 3 + ant-design-vue; do not copy official CCL chip CSS. Chips use
  ant-design-vue Tag and --sm-* tokens. Default display is the official
  popover "+N more"; READ_MORE uses official label.plus-count-more /
  label.less. Empty tags render official NO_DATA_PLACEHOLDER (`--`).
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Popover, Tag, Tooltip, Typography } from 'ant-design-vue';
import {
  LIST_SIZE,
  NO_DATA_PLACEHOLDER,
  TAG_LABEL_GENERATED,
  TAG_SOURCE_GLOSSARY,
  getTagName,
  getTagRedirectLink,
  sortTagsBySource,
  type EntityTag,
} from '@/utils/tags';

export type TagsViewerDisplayType = 'popover' | 'read-more';

const props = withDefaults(
  defineProps<{
    tags?: EntityTag[];
    sizeCap?: number;
    displayType?: TagsViewerDisplayType;
    showNoDataPlaceholder?: boolean;
    entityFqn?: string;
    maxWidth?: number;
  }>(),
  {
    tags: () => [],
    sizeCap: LIST_SIZE,
    displayType: 'popover',
    showNoDataPlaceholder: true,
    entityFqn: undefined,
    maxWidth: undefined,
  },
);

const { t } = useI18n();
const isOpen = ref(false);
const isPopoverOpen = ref(false);

const sortedTags = computed(() => sortTagsBySource(props.tags));
const hasMoreElement = computed(() => sortedTags.value.length > (props.sizeCap ?? 0));
const displayedTags = computed(() => {
  if (props.sizeCap < 0 || isOpen.value) {
    return sortedTags.value;
  }
  return sortedTags.value.slice(0, props.sizeCap);
});
const overflowTags = computed(() =>
  props.sizeCap < 0 ? [] : sortedTags.value.slice(props.sizeCap),
);
const overflowCount = computed(() => Math.max(0, sortedTags.value.length - (props.sizeCap ?? 0)));

function isGenerated(tag: EntityTag): boolean {
  return tag.labelType === TAG_LABEL_GENERATED && Boolean(props.entityFqn);
}

function tooltipTitle(tag: EntityTag): string {
  return tag.description ? `${tag.tagFQN}\n${tag.description}` : tag.tagFQN;
}
</script>

<template>
  <Typography.Text v-if="sortedTags.length === 0 && showNoDataPlaceholder" type="secondary">
    {{ NO_DATA_PLACEHOLDER }}
  </Typography.Text>
  <div v-else-if="sizeCap < 0" class="tags-viewer">
    <Tooltip v-for="tag in sortedTags" :key="tag.tagFQN" placement="top" :title="tooltipTitle(tag)">
      <a :href="getTagRedirectLink(tag)" :data-testid="`tag-${tag.tagFQN}`">
        <Tag
          :class="['tags-viewer__chip', { 'tags-viewer__chip--generated': isGenerated(tag) }]"
          :color="tag.style?.color"
          :style="maxWidth ? { maxWidth: `${maxWidth}px` } : undefined"
        >
          <img v-if="tag.style?.iconURL" :src="tag.style.iconURL" alt="" class="tags-viewer__icon" />
          {{ getTagName(tag, tag.source === TAG_SOURCE_GLOSSARY) }}
        </Tag>
      </a>
    </Tooltip>
  </div>
  <div v-else class="tags-viewer">
    <Tooltip v-for="tag in displayedTags" :key="tag.tagFQN" placement="top" :title="tooltipTitle(tag)">
      <a :href="getTagRedirectLink(tag)" :data-testid="`tag-${tag.tagFQN}`">
        <Tag
          :class="['tags-viewer__chip', { 'tags-viewer__chip--generated': isGenerated(tag) }]"
          :color="tag.style?.color"
          :style="maxWidth ? { maxWidth: `${maxWidth}px` } : undefined"
        >
          <img v-if="tag.style?.iconURL" :src="tag.style.iconURL" alt="" class="tags-viewer__icon" />
          {{ getTagName(tag, tag.source === TAG_SOURCE_GLOSSARY) }}
        </Tag>
      </a>
    </Tooltip>
    <div v-if="displayType === 'popover' && overflowTags.length > 0" data-testid="popover-element">
      <Popover v-model:open="isPopoverOpen" placement="bottom" trigger="click">
        <Button type="link" size="small" data-testid="plus-more-count">
          +{{ overflowCount }} more
        </Button>
        <template #content>
          <div class="tags-viewer__overflow">
            <Tooltip v-for="tag in overflowTags" :key="tag.tagFQN" placement="top" :title="tooltipTitle(tag)">
              <a :href="getTagRedirectLink(tag)" :data-testid="`tag-${tag.tagFQN}`">
                <Tag
                  :class="['tags-viewer__chip', { 'tags-viewer__chip--generated': isGenerated(tag) }]"
                  :color="tag.style?.color"
                >
                  <img v-if="tag.style?.iconURL" :src="tag.style.iconURL" alt="" class="tags-viewer__icon" />
                  {{ getTagName(tag, tag.source === TAG_SOURCE_GLOSSARY) }}
                </Tag>
              </a>
            </Tooltip>
          </div>
        </template>
      </Popover>
    </div>
    <div v-if="displayType === 'read-more' && hasMoreElement" data-testid="read-more-element">
      <Button type="link" size="small" data-testid="read-button" @click="isOpen = !isOpen">
        {{ isOpen ? t('label.less') : t('label.plus-count-more', { count: overflowCount }) }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.tags-viewer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tags-viewer__overflow {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.tags-viewer__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  margin-inline-end: 0;
}

.tags-viewer__chip--generated {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-color: var(--sm-color-primary-50);
}

.tags-viewer__icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.tags-viewer :deep(.ant-btn-link) {
  padding-inline: 0;
  height: auto;
  color: var(--sm-color-primary);
}
</style>