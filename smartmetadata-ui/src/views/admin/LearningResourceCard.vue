<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official LearningResourceCard: type icon + title, description with the
  100-char view-more threshold, max 2 category badges + a popover for the
  rest, and date/duration metadata. The whole card is the preview entry.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Popover, Tag, Typography } from 'ant-design-vue';
import type { LearningResourceDetail } from '@/api/learningResources';
import {
  DESCRIPTION_VIEW_MORE_THRESHOLD,
  MAX_VISIBLE_CATEGORIES_IN_CARD,
  formatCardDate,
  formatDuration,
  getCategoryColor,
  getCategoryLabel,
  getDurationUnitLabelKey,
} from './learningConstants';
import LearningResourceTypeIcon from './LearningResourceTypeIcon.vue';

const props = defineProps<{ resource: LearningResourceDetail }>();
const emit = defineEmits<{ click: [resource: LearningResourceDetail] }>();
const { t } = useI18n();

const popoverOpen = ref(false);

const showViewMore = computed(
  () =>
    !!props.resource.description &&
    props.resource.description.length > DESCRIPTION_VIEW_MORE_THRESHOLD,
);

const formattedDuration = computed(() =>
  formatDuration(
    props.resource.estimatedDuration,
    t(getDurationUnitLabelKey(props.resource.resourceType)),
  ),
);
const formattedDate = computed(() => formatCardDate(props.resource.updatedAt));

const visibleCategories = computed(() =>
  (props.resource.categories ?? []).slice(0, MAX_VISIBLE_CATEGORIES_IN_CARD),
);
const hiddenCategories = computed(() =>
  (props.resource.categories ?? []).slice(MAX_VISIBLE_CATEGORIES_IN_CARD),
);
const remainingCategories = computed(
  () => (props.resource.categories ?? []).length - MAX_VISIBLE_CATEGORIES_IN_CARD,
);

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('click', props.resource);
  }
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="resource.displayName || resource.name"
    class="learning-card"
    :data-testid="`learning-resource-card-${resource.name}`"
    @click="emit('click', resource)"
    @keydown="handleKeyDown"
  >
    <div class="learning-card__head">
      <LearningResourceTypeIcon :resource-type="resource.resourceType" />
      <Typography.Text strong ellipsis class="learning-card__title">
        {{ resource.displayName || resource.name }}
      </Typography.Text>
    </div>
    <div class="learning-card__description">
      <template v-if="resource.description">
        <Typography.Paragraph
          :aria-label="resource.description"
          data-testid="learning-resource-description"
          :ellipsis="{ rows: showViewMore ? 2 : 3 }"
          type="secondary"
        >
          {{ resource.description }}
        </Typography.Paragraph>
        <Button
          v-if="showViewMore"
          type="link"
          size="small"
          @click.stop="emit('click', resource)"
        >
          {{ t('settings.learning.viewMore') }}
        </Button>
      </template>
      <Typography.Text
        v-else
        italic
        type="secondary"
        data-testid="learning-resource-description"
      >
        {{ t('settings.learning.noDescriptionAdded') }}
      </Typography.Text>
    </div>
    <div class="learning-card__categories">
      <template v-if="visibleCategories.length > 0">
        <Tag
          v-for="category in visibleCategories"
          :key="category"
          :color="getCategoryColor(category)"
        >
          {{ getCategoryLabel(category) }}
        </Tag>
        <span v-if="remainingCategories > 0" @click.stop>
          <Popover v-model:open="popoverOpen" placement="bottomLeft">
            <template #content>
              <div class="learning-card__hidden-categories">
                <Tag
                  v-for="category in hiddenCategories"
                  :key="category"
                  :color="getCategoryColor(category)"
                >
                  {{ getCategoryLabel(category) }}
                </Tag>
              </div>
            </template>
            <Button size="small" data-testid="more-categories">
              +{{ remainingCategories }}
            </Button>
          </Popover>
        </span>
      </template>
      <Typography.Text v-else italic type="secondary">
        {{ t('settings.learning.noCategoryAdded') }}
      </Typography.Text>
    </div>
    <div class="learning-card__meta">
      <Typography.Text v-if="formattedDate" type="secondary">
        {{ formattedDate }}
      </Typography.Text>
      <Typography.Text
        v-if="formattedDate && formattedDuration"
        type="secondary"
      >
        |
      </Typography.Text>
      <Typography.Text v-if="formattedDuration" type="secondary">
        {{ formattedDuration }}
      </Typography.Text>
    </div>
  </div>
</template>

<style scoped>
.learning-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 20px;
  cursor: pointer;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 12px;
}

.learning-card:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 10%);
}

.learning-card__head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-height: 40px;
}

.learning-card__title {
  flex: 1;
  min-width: 0;
}

.learning-card__description {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 56px;
  align-items: flex-start;
}

.learning-card__categories {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}

.learning-card__hidden-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 250px;
}

.learning-card__meta {
  display: flex;
  gap: 6px;
  align-items: center;
}
</style>
