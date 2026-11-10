<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Card, Skeleton, Tag } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

export interface HomeWidgetStatus {
  label: string;
  tone: 'error' | 'success' | 'muted';
}

export interface HomeWidgetEmptyState {
  title: string;
  description?: string;
  actionLabel?: string;
  /** Rule phrase shown above the title (CuratedAssets: the rule being waited on). */
  summary?: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    testId?: string;
    /**
     * Official TopicCard states, extended once for all eight stage-B
     * cards (REVIEW-W2-G11-BC condition 6): loading skeleton, error
     * with retry, status chip, summary row, empty state. Stage-A
     * cards pass none of these and render exactly as before.
     */
    isLoading?: boolean;
    isError?: boolean;
    status?: HomeWidgetStatus;
    summary?: string;
    meta?: string;
    emptyState?: HomeWidgetEmptyState;
  }>(),
  {
    testId: 'home-widget',
    isLoading: false,
    isError: false,
  },
);

const emit = defineEmits<{
  (event: 'retry'): void;
  (event: 'empty-action'): void;
}>();

const { t } = useI18n();

function statusColor(tone: HomeWidgetStatus['tone']): string {
  return tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'default';
}
</script>

<template>
  <Card :data-testid="testId" class="home-widget-card" :bordered="true">
    <template #title>
      <span class="home-widget-card__title">{{ title }}</span>
      <Tag v-if="status" :data-testid="`${testId}-status`" :color="statusColor(status.tone)">
        {{ status.label }}
      </Tag>
    </template>
    <template #extra>
      <div class="home-widget-card__extra">
        <slot name="extra" />
      </div>
    </template>
    <div class="home-widget-card__body">
      <p v-if="summary" :data-testid="`${testId}-summary`" class="home-widget-card__summary">
        {{ summary }}
      </p>
      <div v-if="isLoading" :data-testid="`${testId}-loading`" class="home-widget-card__loading">
        <Skeleton :paragraph="{ rows: 3 }" active />
      </div>
      <div
        v-else-if="isError"
        :data-testid="`${testId}-error`"
        class="home-widget-card__error"
        role="alert"
      >
        <span>{{ t('home.widgetLoadFailed') }}</span>
        <Button
          :data-testid="`${testId}-retry`"
          type="link"
          size="small"
          @click="emit('retry')"
        >
          {{ t('shared.retry') }}
        </Button>
      </div>
      <div
        v-else-if="emptyState"
        :data-testid="`${testId}-empty`"
        class="home-widget-card__empty"
      >
        <p v-if="emptyState.summary" class="home-widget-card__empty-summary">
          {{ emptyState.summary }}
        </p>
        <p class="home-widget-card__empty-title">{{ emptyState.title }}</p>
        <p v-if="emptyState.description" class="home-widget-card__empty-description">
          {{ emptyState.description }}
        </p>
        <Button
          v-if="emptyState.actionLabel"
          :data-testid="`${testId}-empty-action`"
          type="link"
          size="small"
          @click="emit('empty-action')"
        >
          {{ emptyState.actionLabel }}
        </Button>
      </div>
      <slot v-else />
      <p v-if="meta && !isLoading" :data-testid="`${testId}-meta`" class="home-widget-card__meta">
        {{ meta }}
      </p>
    </div>
  </Card>
</template>

<style scoped>
.home-widget-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  border-radius: 16px;
  border-color: var(--sm-home-card-border);
  box-shadow: var(--sm-shadow-card);
  overflow: hidden;
}
.home-widget-card :deep(.ant-card-head) {
  flex: none;
  min-height: 48px;
  padding-inline: 16px;
  border-bottom-color: var(--sm-border-secondary);
}
.home-widget-card :deep(.ant-card-head-wrapper) {
  align-items: center;
  gap: 8px;
}
.home-widget-card :deep(.ant-card-head-title) {
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.home-widget-card :deep(.ant-card-extra) {
  flex: none;
}
.home-widget-card :deep(.ant-card-body) {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}
.home-widget-card__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home-widget-card__extra {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home-widget-card__body {
  min-height: 0;
}
.home-widget-card__summary {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.home-widget-card__loading {
  padding: 4px 0;
}
.home-widget-card__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.home-widget-card__empty {
  padding: 12px 0;
}
.home-widget-card__empty-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-text-primary);
}
.home-widget-card__empty-description {
  margin: 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.home-widget-card__meta {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
</style>
