<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Select, Typography } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { activityLabel, type ActivityFilter } from '../homeQueries';
import type { ActivityEvent } from '@/types/collaboration';

/**
 * `KnowledgePanel.ActivityFeed` — the existing 7-day activity card,
 * mapped into the landing grid as-is. The official feed is the team
 * activity feed (`getMyActivityFeed`); the "mine vs team" scope
 * difference is a stage-B residual (REVIEW-W1-5-G11 §2-12 row 6), so
 * this widget keeps the current scope and copy and must not be read
 * as the official component.
 */
const props = defineProps<{
  events: ActivityEvent[];
  filter: ActivityFilter;
}>();

const emit = defineEmits<{
  'change-filter': [value: string];
  'open-activity': [event: ActivityEvent];
  explore: [];
}>();

const { t, locale } = useI18n();

const visibleActivity = computed(() =>
  props.filter === 'all'
    ? props.events
    : props.events.filter((event) => event.eventType === props.filter),
);
const activityOptions = computed(() => [
  { value: 'all', label: t('home.allActivity') },
  ...[...new Set(props.events.map((event) => event.eventType))].map((value) => ({
    value,
    label: value,
  })),
]);

function actorName(event: ActivityEvent): string {
  return event.actor?.displayName || event.actor?.name || '';
}

function actorInitial(event: ActivityEvent): string {
  return (actorName(event) || event.eventType || '?').slice(0, 1).toUpperCase();
}

function relativeTime(timestamp?: number): string {
  if (!timestamp) {
    return '';
  }
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  const delta = timestamp - Date.now();
  const days = Math.round(delta / 86_400_000);
  if (Math.abs(days) >= 1) {
    return rtf.format(days, 'day');
  }
  const hours = Math.round(delta / 3_600_000);
  if (Math.abs(hours) >= 1) {
    return rtf.format(hours, 'hour');
  }
  return rtf.format(Math.round(delta / 60_000), 'minute');
}

function onFilter(value: unknown): void {
  emit('change-filter', typeof value === 'string' ? value : 'all');
}
</script>

<template>
  <HomeWidgetCard :title="t('home.activity')" test-id="home-widget-activity-feed">
    <template #extra>
      <Select
        data-testid="home-activity-filter"
        size="small"
        :value="filter"
        :options="activityOptions"
        :bordered="false"
        @change="onFilter"
      />
    </template>
    <Empty
      v-if="!visibleActivity.length"
      data-testid="home-activity-empty"
      :description="t('home.activityEmptyTitle')"
    >
      <template #description>
        <Typography.Title :level="5">{{ t('home.activityEmptyTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('home.activityEmpty') }}</Typography.Paragraph>
      </template>
      <Button data-testid="home-explore-assets" @click="emit('explore')">{{ t('home.exploreAssets') }}</Button>
    </Empty>
    <ul v-else class="home-list" data-testid="home-activity-list">
      <li v-for="event in visibleActivity" :key="event.id">
        <button
          type="button"
          class="feed"
          :data-testid="`home-activity-row-${event.id}`"
          @click="emit('open-activity', event)"
        >
          <span class="feed__top">
            <span class="feed__avatar">{{ actorInitial(event) }}</span>
            <span class="feed__name">{{ actorName(event) }}</span>
            <span class="feed__time">{{ relativeTime(event.timestamp) }}</span>
          </span>
          <span class="feed__tag">{{ event.eventType }}</span>
          <span class="feed__body">{{ activityLabel(event) }}</span>
        </button>
      </li>
    </ul>
  </HomeWidgetCard>
</template>

<style scoped>
.home-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feed {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 4px 0 12px;
  cursor: pointer;
  color: var(--sm-text-primary);
}
.feed__top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.feed__avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--sm-color-success-bg);
  color: var(--sm-color-success-text);
  font-size: 12px;
  font-weight: 700;
}
.feed__name {
  font-weight: 600;
}
.feed__time {
  margin-left: auto;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.feed__tag {
  align-self: flex-start;
  margin: 8px 0 8px 36px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--sm-bg-elevated);
  color: var(--sm-text-secondary);
  font-size: 12px;
}
.feed__body {
  margin-left: 36px;
  padding: 10px 12px;
  border: 1px solid var(--sm-home-card-border);
  border-radius: var(--sm-radius-card);
}
</style>
