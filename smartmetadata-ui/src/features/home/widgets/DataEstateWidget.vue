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
  DATA_ESTATE_WINDOW_DAYS,
  DATA_ESTATE_WINDOW_OPTIONS,
  useDataEstate,
} from './useDataEstate';
import { useAddServiceAction } from '@/features/home/useAddServiceAction';

/**
 * How big the estate is, what it is made of, and how well it is
 * described — a port of official `DataEstateWidget`, minus the
 * description-coverage block: official renders it only in AI mode and
 * the product has no AI-mode runtime switch, so this batch does not
 * render it (D-1, Bai 2026-11-08).
 * ADR:2026-11-08-my-data-data-estate-coverage
 */
const props = defineProps<{ widgetKey: string }>();

const { t, locale } = useI18n();
const router = useRouter();

const windowDays: Ref<number> = ref(DATA_ESTATE_WINDOW_DAYS);
const { figures, isLoading, isError, refetch } = useDataEstate(windowDays);
const { addService, canAddService } = useAddServiceAction('all');

const numberFormat = computed(() => new Intl.NumberFormat(locale.value));
const compactFormat = computed(
  () =>
    new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1, notation: 'compact' }),
);
const signedFormat = computed(
  () => new Intl.NumberFormat(locale.value, { signDisplay: 'exceptZero' }),
);

const summary = computed(() =>
  t('home.assetsAcrossConnectors', {
    assets: compactFormat.value.format(figures.value.totalAssets),
    count: figures.value.connectorCount,
  }),
);

const status = computed(() => {
  const delta = figures.value.totalDelta;
  if (delta === null || delta === 0) {
    return undefined;
  }
  return {
    label: t('home.valueInLastDays', {
      count: figures.value.windowDays,
      value: signedFormat.value.format(delta),
    }),
    tone: 'info' as const,
  };
});

const emptyState = computed(() =>
  figures.value.totalAssets === 0
    ? {
        title: t('home.noAssetsYet'),
        description: t('home.dataEstateEmptyDescription'),
        actionLabel: canAddService.value ? t('home.addConnector') : undefined,
      }
    : undefined,
);

const windowOptions = computed(() =>
  DATA_ESTATE_WINDOW_OPTIONS.map((days) => ({
    label: t('home.lastDays', { count: days }),
    value: days,
  })),
);

function formatCount(value: number): string {
  return numberFormat.value.format(value);
}

function connectorShare(count: number): number {
  return figures.value.totalAssets > 0 ? (count / figures.value.totalAssets) * 100 : 0;
}

function connectorLabel(connector: { key: string; name: string }): string {
  return connector.key === '__other__' ? t('home.otherConnectors') : connector.name;
}

function onWindow(value: unknown): void {
  if (typeof value === 'number' && DATA_ESTATE_WINDOW_OPTIONS.includes(value)) {
    windowDays.value = value;
  }
}

function openExplore(): void {
  void router.push({ name: 'search' });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.yourDataEstate')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
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
    <div class="data-estate__head">
      <div class="data-estate__total">
        <span class="data-estate__label">{{ t('home.totalAssets') }}</span>
        <span class="data-estate__count" data-testid="data-estate-total">
          {{ formatCount(figures.totalAssets) }}
        </span>
      </div>
      <Select
        data-testid="data-estate-window-filter"
        size="small"
        :value="windowDays"
        :options="windowOptions"
        :bordered="false"
        @change="onWindow"
      />
    </div>
    <ul class="data-estate__connectors" data-testid="data-estate-connectors">
      <li
        v-for="connector in figures.connectors"
        :key="connector.key"
        class="data-estate__connector"
        :data-testid="`data-estate-connector-${connector.key}`"
      >
        <span class="data-estate__connector-name">{{ connectorLabel(connector) }}</span>
        <span class="data-estate__connector-bar" aria-hidden="true">
          <i :style="{ width: `${connectorShare(connector.count)}%` }" />
        </span>
        <span class="data-estate__connector-count">{{ formatCount(connector.count) }}</span>
      </li>
    </ul>
  </HomeWidgetCard>
</template>

<style scoped>
.data-estate__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.data-estate__total {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.data-estate__label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.45);
}

.data-estate__count {
  font-size: 20px;
  font-weight: 600;
}

.data-estate__connectors {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-estate__connector {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  align-items: center;
}

.data-estate__connector-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.data-estate__connector-bar {
  grid-column: 1 / -1;
  height: 6px;
  border-radius: 999px;
  background: var(--sm-border-secondary);
  overflow: hidden;
}

.data-estate__connector-bar i {
  display: block;
  height: 100%;
  background: var(--sm-color-primary);
  border-radius: 999px;
}

.data-estate__connector-count {
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
