<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { permissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { OverviewFilter } from '@/catalog/domainOverview';
import { useDomainOverview } from './useDomainOverview';

const props = defineProps<{ widgetKey: string }>();

const { t } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();

const filter = ref<OverviewFilter>('all');

const { domains, totalCount, unownedCount, emptyCount, isError, isLoading, refetch } =
  useDomainOverview(computed(() => filter.value));

const canCreate = ref(false);
void (async () => {
  try {
    canCreate.value = permissionFlags(
      await permissionStore.getResourcePermission('domain'),
    ).canCreate;
  } catch {
    canCreate.value = false;
  }
})();

const bucketSize = computed<Record<OverviewFilter, number>>(() => ({
  all: totalCount.value,
  noOwner: unownedCount.value,
  empty: emptyCount.value,
}));
const remaining = computed(() => Math.max(0, bucketSize.value[filter.value] - domains.value.length));

const emptyState = computed(() =>
  totalCount.value === 0
    ? {
        title: t('home.noDomainsYet'),
        description: t('home.domainsEmptyDescription'),
        summary: t('home.domainsWidgetDescription'),
        actionLabel: canCreate.value ? t('home.newDomain') : undefined,
      }
    : undefined,
);

const status = computed(() =>
  unownedCount.value > 0
    ? { label: t('home.countUnowned', { count: unownedCount.value }), tone: 'warning' as const }
    : undefined,
);

const chips = computed(() => [
  { id: 'all' as OverviewFilter, label: t('home.all'), count: totalCount.value, tone: 'brand' },
  { id: 'noOwner' as OverviewFilter, label: t('home.noOwner'), count: unownedCount.value, tone: 'warning' },
  { id: 'empty' as OverviewFilter, label: t('home.empty'), count: emptyCount.value, tone: 'muted' },
]);

function ownerNames(owners: { displayName?: string; name: string }[]): string {
  return owners.length
    ? owners.map((owner) => owner.displayName || owner.name).join(', ')
    : t('home.noOwner');
}

function openDomains(): void {
  void router.push({ name: 'governance-domains' });
}

function openDomain(id: string): void {
  void router.push({ name: 'governance-domain', params: { id } });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.domains')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="t('home.countDomainsCountUnowned', { count: totalCount, unowned: unownedCount })"
    :meta="remaining > 0 ? t('home.countMoreDomains', { count: remaining }) : undefined"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="openDomains"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openDomains">
        {{ t('home.viewAllDomains') }}
      </button>
    </template>
    <div v-if="!emptyState" class="overview-widget__body">
      <div class="overview-widget__chips" role="group" :aria-label="t('home.domains')">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="overview-widget__chip"
          :class="{ 'overview-widget__chip--active': filter === chip.id }"
          :aria-pressed="filter === chip.id"
          :data-testid="`domains-chip-${chip.id}`"
          @click="filter = chip.id"
        >
          {{ chip.label }} · {{ chip.count }}
        </button>
      </div>
      <ul class="overview-widget__rows" data-testid="domain-rows">
        <li
          v-for="domain in domains"
          :key="domain.id"
          class="overview-widget__row"
          :data-testid="`domain-card-${domain.id}`"
        >
          <span class="overview-widget__tile" aria-hidden="true">🌐</span>
          <div class="overview-widget__main">
            <button
              type="button"
              class="overview-widget__name"
              data-testid="domain-name"
              @click="openDomain(domain.id)"
            >
              {{ domain.name }}
            </button>
            <span class="overview-widget__meta">{{ ownerNames(domain.owners) }}</span>
          </div>
          <span class="overview-widget__count">
            {{ t('home.countAssets', { count: domain.assetCount }) }}
          </span>
        </li>
      </ul>
    </div>
  </HomeWidgetCard>
</template>

<style scoped>
.overview-widget__body {
  display: flex;
  flex-direction: column;
}

.overview-widget__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.overview-widget__chip {
  border: 1px solid #d9d9d9;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
  padding: 4px 12px;
  font-size: 12px;
}

.overview-widget__chip--active {
  border-color: #005587;
  color: #005587;
  font-weight: 600;
}

.overview-widget__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.overview-widget__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.overview-widget__row:last-child {
  border-bottom: 0;
}

.overview-widget__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #e6f0f6;
  font-size: 16px;
}

.overview-widget__main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.overview-widget__name {
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
  color: #005587;
}

.overview-widget__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.overview-widget__count {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.65);
}
</style>
