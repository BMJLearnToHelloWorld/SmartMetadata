<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Empty, Select, Typography } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { getDefaultTrackedFilter, type TrackedFilter } from '../landingPageLayout';
import { hitLabel, sortHits, type AssetSort } from '../homeQueries';
import type { SearchHit } from '@/types/api';

/**
 * `KnowledgePanel.YoursAndFollowed` — the official merge of the two
 * retired cards (My Data / Following): owned and followed assets in
 * one card with an in-card filter switch. Both queries keep the
 * existing 15-item cap, sort, and domain scoping, so the HomeHero
 * domain filter still applies to both lists at once.
 *
 * The opening filter follows the official `getDefaultTrackedFilter`:
 * whichever list has something in it (a reader who only follows does
 * not land on an empty "Owned" list); both empty opens on Owned.
 * This replaces the two retired test-ids `home-widget-my-data` and
 * `home-widget-following`.
 */
const props = defineProps<{
  owned: SearchHit[];
  followed: SearchHit[];
  ownedTotal: number;
  followedTotal: number;
  sort: AssetSort;
  sortOptions: Array<{ value: AssetSort; label: string }>;
  /** The layout key, forwarded to the card for the edit-view test-ids. */
  widgetKey?: string;
}>();

const emit = defineEmits<{
  'change-sort': [value: AssetSort];
  'open-hit': [hit: SearchHit];
  'open-owned-more': [];
  'open-followed-more': [];
  explore: [];
}>();

const { t } = useI18n();

const pickedFilter = ref<TrackedFilter | undefined>(undefined);
const filter = computed(
  () => pickedFilter.value ?? getDefaultTrackedFilter(props.ownedTotal, props.followedTotal),
);
const filterOptions = computed(() => [
  { value: 'owned', label: t('home.myData') },
  { value: 'followed', label: t('home.following') },
]);
const sortedOwned = computed(() => sortHits(props.owned, props.sort));
const sortedFollowed = computed(() => sortHits(props.followed, props.sort));

function onFilter(value: unknown): void {
  if (value === 'owned' || value === 'followed') {
    pickedFilter.value = value;
  }
}

function onSort(value: unknown): void {
  if (value === 'latest' || value === 'name') {
    emit('change-sort', value);
  }
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.yoursAndFollowed')"
    test-id="home-widget-yours-and-followed"
    :widget-key="props.widgetKey"
  >
    <template #extra>
      <Select
        data-testid="home-tracked-filter"
        size="small"
        :value="filter"
        :options="filterOptions"
        :bordered="false"
        @change="onFilter"
      />
      <Select
        data-testid="home-tracked-sort"
        size="small"
        :value="sort"
        :options="sortOptions"
        :bordered="false"
        @change="onSort"
      />
      <Button
        v-if="filter === 'owned'"
        type="link"
        data-testid="home-owned-more"
        @click="emit('open-owned-more')"
      >{{ t('home.viewMore') }}</Button>
      <Button
        v-else
        type="link"
        data-testid="home-followed-more"
        @click="emit('open-followed-more')"
      >{{ t('home.viewMore') }}</Button>
    </template>
    <template v-if="filter === 'owned'">
      <ul v-if="sortedOwned.length" class="home-list" data-testid="home-owned-list">
        <li v-for="hit in sortedOwned" :key="hit.fullyQualifiedName || hit.name">
          <button type="button" class="home-list__row" :data-testid="`home-owned-${hit.name}`" @click="emit('open-hit', hit)">
            {{ hitLabel(hit) }}
          </button>
        </li>
      </ul>
      <Empty v-else data-testid="home-owned-empty" :description="t('home.myDataEmpty')" />
    </template>
    <template v-else>
      <ul v-if="sortedFollowed.length" class="home-list" data-testid="home-followed-list">
        <li v-for="hit in sortedFollowed" :key="hit.fullyQualifiedName || hit.name">
          <button type="button" class="home-list__row" :data-testid="`home-followed-${hit.name}`" @click="emit('open-hit', hit)">
            {{ hitLabel(hit) }}
          </button>
        </li>
      </ul>
      <Empty v-else data-testid="home-followed-empty" :description="t('home.followingEmptyTitle')">
        <template #description>
          <Typography.Title :level="5">{{ t('home.followingEmptyTitle') }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ t('home.followingEmpty') }}</Typography.Paragraph>
        </template>
        <Button data-testid="home-following-explore" @click="emit('explore')">{{ t('home.exploreAssets') }}</Button>
      </Empty>
    </template>
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
.home-list__row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 8px 4px;
  border-radius: var(--sm-radius-card);
  cursor: pointer;
  color: var(--sm-text-primary);
}
.home-list__row:hover {
  background: var(--sm-row-hover-bg);
  color: var(--sm-color-primary);
}
</style>
