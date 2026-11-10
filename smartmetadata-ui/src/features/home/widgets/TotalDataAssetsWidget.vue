<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Select } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import {
  TOTAL_DATA_ASSETS_WINDOW_DAYS,
  TOTAL_DATA_ASSETS_WINDOW_OPTIONS,
  useTotalDataAssets,
} from './useDataEstate';
import { formatServiceTypeLabel } from './useDataEstate';
import { useAddServiceAction } from '@/features/home/useAddServiceAction';
import { SM_CHART_COLORS } from '@/theme/tokens';

/**
 * How many assets the estate holds, split by asset type, and how that
 * moved — a port of official `TotalDataAssetsWidget`. The product-owned
 * donut is replaced by official's ShareBar + rows.
 */
const props = defineProps<{ widgetKey: string }>();

const { t, locale } = useI18n();
const router = useRouter();

const windowDays: Ref<number> = ref(TOTAL_DATA_ASSETS_WINDOW_DAYS);
const { figures, isLoading, isError, refetch } = useTotalDataAssets(windowDays);
const { addService, canAddService } = useAddServiceAction('database');

const formats = computed(() => ({
  count: new Intl.NumberFormat(locale.value),
  share: new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1, style: 'percent' }),
  signed: new Intl.NumberFormat(locale.value, { signDisplay: 'exceptZero' }),
  signedCompact: new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 1,
    notation: 'compact',
    signDisplay: 'exceptZero',
  }),
}));

const windowOptions = computed(() =>
  TOTAL_DATA_ASSETS_WINDOW_OPTIONS.map((days) => ({
    label: t('home.lastDays', { count: days }),
    value: days,
  })),
);

const colors = computed(() =>
  figures.value.assetTypes.map((_, index) => SM_CHART_COLORS[index % SM_CHART_COLORS.length]),
);

const deltaLabel = computed(() => {
  const delta = figures.value.totalDelta;
  if (delta === null || delta === 0) {
    return undefined;
  }
  return t('home.valueInLastDays', {
    count: figures.value.windowDays,
    value: formats.value.signedCompact.format(delta),
  });
});

const summary = computed(() => {
  const base = t('home.assetsAcrossAssetTypes', {
    assets: formats.value.count.format(figures.value.totalAssets),
    count: figures.value.assetTypes.length,
  });
  const fastest = figures.value.fastestGrowing;
  return fastest !== undefined && (fastest.delta ?? 0) > 0
    ? `${base} ${t('home.entityGrewFastest', { entity: assetTypeLabel(fastest.key) })}`
    : base;
});

const emptyState = computed(() =>
  figures.value.totalAssets === 0
    ? {
        title: t('home.noDataAssetsYet'),
        description: t('home.totalDataAssetsEmptyDescription'),
        actionLabel: canAddService.value ? t('home.addDatabaseService') : undefined,
      }
    : undefined,
);

function assetTypeLabel(key: string): string {
  const translated = t(`explore.entity.${key}`);
  // vue-i18n echoes the key path when the key is missing; fall back to a
  // start-cased raw value rather than showing the path.
  return translated === `explore.entity.${key}` ? formatServiceTypeLabel(key) : translated;
}

function formatCount(value: number): string {
  return formats.value.count.format(value);
}

function formatShare(share: number): string {
  return formats.value.share.format(share / 100);
}

function formatDelta(delta: number): string {
  return formats.value.signed.format(delta);
}

function deltaTone(delta: number): string {
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
}

function onWindow(value: unknown): void {
  if (typeof value === 'number' && TOTAL_DATA_ASSETS_WINDOW_OPTIONS.includes(value)) {
    windowDays.value = value;
  }
}

function openExplore(): void {
  void router.push({ name: 'search' });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.totalDataAssets')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="deltaLabel ? { label: deltaLabel, tone: 'info' } : undefined"
    :summary="summary"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="addService"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openExplore">
        {{ t('home.openExplore') }}
      </button>
    </template>
    <div class="total-assets__head">
      <div class="total-assets__total">
        <span class="total-assets__label">{{ t('home.totalAssets') }}</span>
        <span class="total-assets__count" data-testid="total-data-assets-total">
          {{ formatCount(figures.totalAssets) }}
        </span>
      </div>
      <Select
        data-testid="total-data-assets-window-filter"
        size="small"
        :value="windowDays"
        :options="windowOptions"
        :bordered="false"
        @change="onWindow"
      />
    </div>
    <div
      class="total-assets__share-bar"
      data-testid="total-data-assets-share-bar"
      role="img"
      :aria-label="t('home.byAssetType')"
    >
      <i
        v-for="(type, index) in figures.assetTypes"
        :key="type.key"
        :title="`${assetTypeLabel(type.key)}: ${formatCount(type.count)}`"
        :style="{ width: `${type.share}%`, backgroundColor: colors[index] }"
      />
    </div>
    <ul class="total-assets__rows" data-testid="asset-type-rows">
      <li
        v-for="(type, index) in figures.assetTypes"
        :key="type.key"
        class="total-assets__row"
        :data-testid="`asset-type-row-${type.key}`"
      >
        <span
          aria-hidden="true"
          class="total-assets__swatch"
          :style="{ backgroundColor: colors[index] }"
        />
        <span class="total-assets__name">{{ assetTypeLabel(type.key) }}</span>
        <span class="total-assets__share">{{ formatShare(type.share) }}</span>
        <span class="total-assets__count" data-testid="asset-type-count">
          {{ formatCount(type.count) }}
        </span>
        <span v-if="type.delta !== null" class="total-assets__delta" data-testid="asset-type-delta">
          <span :class="`total-assets__delta--${deltaTone(type.delta)}`">
            {{ formatDelta(type.delta) }}
          </span>
        </span>
      </li>
    </ul>
  </HomeWidgetCard>
</template>

<style scoped>
.total-assets__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.total-assets__total {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.total-assets__label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.45);
}

.total-assets__count {
  font-size: 20px;
  font-weight: 600;
}

.total-assets__share-bar {
  display: flex;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 16px;
  background: #f0f0f0;
}

.total-assets__share-bar i {
  display: block;
  height: 100%;
}

.total-assets__rows {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.total-assets__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.total-assets__row:last-child {
  border-bottom: 0;
}

.total-assets__swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.total-assets__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.total-assets__share,
.total-assets__count {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
}

.total-assets__share {
  color: rgba(0, 0, 0, 0.45);
}

.total-assets__count {
  font-weight: 500;
}

.total-assets__delta {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.total-assets__delta--up {
  color: #52c41a;
}

.total-assets__delta--down {
  color: #ff4d4f;
}
</style>
