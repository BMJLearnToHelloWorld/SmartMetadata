<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { getMyActivityFeed } from '@/api/activity';
import { activitySentence } from '@/catalog/activitySentence';
import { assetLocation } from '@/catalog/entityRoutes';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import { getRelativeTime } from '@/utils/relativeTime';
import type { ActivityEvent } from '@/types/collaboration';

/**
 * What changed recently on the assets this user, or one of their teams,
 * owns — the scope of the `my-feed` endpoint. A port of official
 * `TeamActivityWidget`. The product's own event-type filter dropdown is
 * removed (condition 12, closing R-W15-4): the feed is the viewer's
 * own, unfiltered.
 * ADR:2026-11-08-my-data-activity-feed
 */
const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();

const TEAM_ACTIVITY_WINDOW_DAYS = 7;
const TEAM_ACTIVITY_TTL_MS = 60_000;
/** The card is a digest; the footer link is the full feed. */
const MAX_VISIBLE_ROWS = 6;
/**
 * The feed returns no total, so the count is read off the page itself.
 * One event past the limit is fetched only to learn that there are
 * more, which the card then says as "20+" instead of passing the cap
 * off as the real number.
 */
const TEAM_ACTIVITY_COUNT_CAP = 20;

const loaded = useWidgetLoad(
  'team-activity',
  () => getMyActivityFeed({ days: TEAM_ACTIVITY_WINDOW_DAYS, limit: TEAM_ACTIVITY_COUNT_CAP + 1 }),
  { ttlMs: TEAM_ACTIVITY_TTL_MS },
);
// Destructured: template unwrapping only applies to top-level setup
// bindings — `loaded.isLoading` would read the Ref object itself
// (always truthy) instead of the boolean.
const isLoading = loaded.isLoading;
const isError = loaded.isError;
const refetch = loaded.refetch;

const events = computed(() => loaded.data.value?.data ?? []);
const count = computed(() => events.value.length);
const latest = computed(() => events.value[0]);
const visibleEvents = computed(() => events.value.slice(0, MAX_VISIBLE_ROWS));

// The newest event doubles as the card's summary, so a collapsed card
// still says what actually happened rather than only how much did. With
// no event there is nothing to summarise; the empty state supplies the
// header line instead.
const summary = computed(() => {
  if (latest.value === undefined) {
    return undefined;
  }
  const relative = latest.value.timestamp
    ? ` · ${getRelativeTime(latest.value.timestamp)}`
    : '';
  return `${sentence(latest.value)}${relative}`;
});

const status = computed(() =>
  count.value > 0
    ? {
        label:
          count.value > TEAM_ACTIVITY_COUNT_CAP
            ? t('home.countPlusUpdates', { count: TEAM_ACTIVITY_COUNT_CAP })
            : t('home.countUpdates', { count: count.value }),
        tone: 'default' as const,
      }
    : undefined,
);

const meta = computed(() =>
  count.value > 0
    ? t('home.activityOnOwnedAssets', { count: TEAM_ACTIVITY_WINDOW_DAYS })
    : undefined,
);

// Quiet is not a setup problem — activity arrives on its own — so there
// is nothing to configure and no call to action.
const emptyState = computed(() =>
  count.value === 0
    ? {
        title: t('home.allQuietInYourDomains'),
        description: t('home.teamActivityEmptyDescription'),
      }
    : undefined,
);

function sentence(event: ActivityEvent): string {
  return activitySentence(event, (key, params) => t(key, params));
}

function actorName(event: ActivityEvent): string {
  return event.actor?.displayName || event.actor?.name || '';
}

function actorInitial(event: ActivityEvent): string {
  return (actorName(event) || event.eventType || '?').slice(0, 1).toUpperCase();
}

function openActivity(event: ActivityEvent): void {
  const type = event.entity?.type;
  const fqn = event.entity?.fullyQualifiedName;
  if (type && fqn) {
    void router.push(assetLocation(type, fqn));
  }
}

function viewAllActivity(): void {
  void router.push({ name: 'activity' });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.activity')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="summary"
    :meta="meta"
    :empty-state="emptyState"
    @retry="refetch"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="viewAllActivity">
        {{ t('home.viewAllActivity') }}
      </button>
    </template>
    <ul class="home-list" data-testid="home-activity-list">
      <li v-for="event in visibleEvents" :key="event.id">
        <button
          type="button"
          class="feed"
          :data-testid="`home-activity-row-${event.id}`"
          @click="openActivity(event)"
        >
          <span class="feed__top">
            <span class="feed__avatar">{{ actorInitial(event) }}</span>
            <span class="feed__sentence">
              {{ sentence(event) }}
            </span>
            <span v-if="event.timestamp" class="feed__time">
              {{ getRelativeTime(event.timestamp) }}
            </span>
          </span>
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
  flex-shrink: 0;
}
.feed__sentence {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.feed__time {
  margin-left: auto;
  color: var(--sm-text-tertiary);
  font-size: 12px;
  flex-shrink: 0;
}
</style>
