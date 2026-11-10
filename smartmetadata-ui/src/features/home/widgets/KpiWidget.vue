<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Select, Tag } from 'ant-design-vue';
import type { SelectValue } from 'ant-design-vue/es/select';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import { permissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import {
  KPI_ALL_TIME,
  KPI_WINDOW_DAYS,
  KPI_WINDOW_OPTIONS,
  useKpiProgress,
  type KpiProgress,
  type KpiStatus,
  type KpiWindow,
} from './useKpiProgress';

const props = defineProps<{ widgetKey: string }>();

const { t, locale } = useI18n();
const router = useRouter();
const permissionStore = usePermissionStore();

const range = ref<KpiWindow>(KPI_WINDOW_DAYS);
const { kpis, atRiskCount, isError, isLoading, refetch } = useKpiProgress(
  computed(() => range.value),
);

function onRangeChange(value: SelectValue): void {
  range.value = value === KPI_ALL_TIME ? KPI_ALL_TIME : Number(value);
}

const canCreate = ref(false);
void (async () => {
  try {
    canCreate.value = permissionFlags(
      await permissionStore.getResourcePermission('kpi'),
    ).canCreate;
  } catch {
    canCreate.value = false;
  }
})();

const windowOptions = computed(() =>
  KPI_WINDOW_OPTIONS.map((option) => ({
    label:
      option === KPI_ALL_TIME
        ? t('home.allTime')
        : t('home.lastNDays', { count: option }),
    value: String(option),
  })),
);

const summary = computed(() => t('home.countKpisTracked', { count: kpis.value.length }));

// The KPI list ignores the range — only each KPI's series follows it — so an
// empty list means none are defined, not none in this window.
const emptyState = computed(() =>
  kpis.value.length === 0
    ? {
        title: t('home.noKpisYet'),
        description: t('home.kpiEmptyDescription'),
        summary: t('home.kpiWidgetDescription'),
        actionLabel: canCreate.value ? t('home.createKpi') : undefined,
      }
    : undefined,
);

const status = computed(() =>
  atRiskCount.value > 0
    ? { label: t('home.countAtRisk', { count: atRiskCount.value }), tone: 'warning' as const }
    : undefined,
);

const STATUS_META: Record<KpiStatus, { labelKey: string; color: string; bar: string }> = {
  atRisk: { labelKey: 'home.atRisk', color: 'warning', bar: '#faad14' },
  missed: { labelKey: 'home.missed', color: 'error', bar: '#ff4d4f' },
  onTrack: { labelKey: 'home.onTrack', color: 'success', bar: '#52c41a' },
};

const TONE_COLOR: Record<KpiStatus, string> = {
  atRisk: '#faad14',
  missed: '#ff4d4f',
  onTrack: '#52c41a',
};

/**
 * Formats a KPI's figures in its own unit: a Percentage KPI reads `28%`, a
 * Number KPI `1,500` — not `1500%`, which is what a fixed `%` suffix printed.
 * Intl rather than a suffix so the symbol's placement follows the locale.
 */
function formatValue(value: number, metricType: string): string {
  const unit: Intl.NumberFormatOptions =
    metricType === 'PERCENTAGE' ? { style: 'unit', unit: 'percent' } : {};
  return new Intl.NumberFormat(locale.value, { ...unit, maximumFractionDigits: 0 }).format(value);
}

function formatSigned(value: number, metricType: string): string {
  const unit: Intl.NumberFormatOptions =
    metricType === 'PERCENTAGE' ? { style: 'unit', unit: 'percent' } : {};
  return new Intl.NumberFormat(locale.value, {
    ...unit,
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(value);
}

/**
 * The change across the selected range, worded for that range: "in the last
 * 90 days" on a 90-day window, "since start" on all time.
 */
function deltaLabel(kpi: KpiProgress): string {
  const hasChange = kpi.delta !== null && kpi.delta !== 0;
  const value = formatSigned(kpi.delta ?? 0, kpi.metricType);
  if (kpi.windowDays === null) {
    return hasChange ? t('home.valueSinceStart', { value }) : t('home.noChangeSinceStart');
  }
  return hasChange
    ? t('home.valueInLastNDays', { count: kpi.windowDays, value })
    : t('home.noChangeInLastNDays', { count: kpi.windowDays });
}

function formatDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Sparkline points: a compact trend line with a filled area, and a dashed
 * reference line at the target. The product has no chart component for this
 * shape, so the row draws the same contract as an inline SVG — the official
 * Sparkline is an ECharts area chart, and this keeps its footprint (trend +
 * area + target line) without a new dependency.
 */
function sparklinePoints(series: number[], width: number, height: number): string {
  if (series.length === 0) {
    return '';
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = span * 0.08;
  const low = min - pad;
  const high = max + pad;
  return series
    .map((value, index) => {
      const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
      const y = height - ((value - low) / (high - low)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function sparklineTargetY(target: number, series: number[], height: number): number {
  const min = Math.min(...series, target);
  const max = Math.max(...series, target);
  const span = max - min || 1;
  const pad = span * 0.08;
  const low = min - pad;
  const high = max + pad;
  return height - ((target - low) / (high - low)) * height;
}

function openKpis(): void {
  void router.push({ name: 'insights-kpis' });
}

function openKpiAdd(): void {
  void router.push({ name: 'insights-kpis-add' });
}
</script>

<template>
  <HomeWidgetCard
    :title="t('home.kpi')"
    :test-id="`home-widget-${props.widgetKey}`"
    :is-loading="isLoading"
    :is-error="isError"
    :status="status"
    :summary="summary"
    :empty-state="emptyState"
    @retry="refetch"
    @empty-action="openKpiAdd"
  >
    <template #extra>
      <button type="button" class="home-widget-card__link" @click="openKpis">
        {{ t('home.manageKpis') }}
      </button>
    </template>
    <template v-if="!emptyState">
      <div class="kpi__range">
        <Select
          data-testid="kpi-window-filter"
          :value="String(range)"
          :options="windowOptions"
          size="small"
          @change="onRangeChange"
        />
      </div>
      <ul class="kpi__rows" data-testid="kpi-rows">
        <li
          v-for="kpi in kpis"
          :key="kpi.id"
          class="kpi__row"
          :data-testid="`kpi-${kpi.id}`"
        >
          <div class="kpi__head">
            <span class="kpi__name">{{ kpi.name }}</span>
            <Tag :color="STATUS_META[kpi.status].color">
              {{ t(STATUS_META[kpi.status].labelKey) }}
            </Tag>
            <span class="kpi__target" data-testid="kpi-target">
              {{ t('home.targetValueFormatted', { value: formatValue(kpi.target, kpi.metricType) }) }}
            </span>
          </div>
          <div class="kpi__current-row">
            <span class="kpi__current" data-testid="kpi-current">
              {{ formatValue(kpi.current, kpi.metricType) }}
            </span>
            <span class="kpi__remaining" data-testid="kpi-remaining">
              {{
                t('home.valueToGo', {
                  value: formatValue(Math.max(0, kpi.target - kpi.current), kpi.metricType),
                })
              }}
            </span>
          </div>
          <div
            class="kpi__bar"
            role="progressbar"
            :aria-label="t('home.targetValueFormatted', { value: formatValue(kpi.target, kpi.metricType) })"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(kpi.target > 0 ? (kpi.current / kpi.target) * 100 : 0)"
          >
            <span
              :style="{
                width: `${Math.min(kpi.target > 0 ? (kpi.current / kpi.target) * 100 : 0, 100)}%`,
                background: STATUS_META[kpi.status].bar,
              }"
            />
          </div>
          <div class="kpi__facts">
            <span class="kpi__fact" data-testid="kpi-delta">{{ deltaLabel(kpi) }}</span>
            <span aria-hidden="true" class="kpi__dot" />
            <span class="kpi__fact" data-testid="kpi-days-left">
              {{ t('home.countDaysLeft', { count: kpi.daysLeft }) }}
            </span>
          </div>
          <p
            v-if="kpi.projected !== null && kpi.status !== 'onTrack'"
            class="kpi__projection"
            data-testid="kpi-projection"
          >
            {{
              t('home.atThisPaceProjection', {
                date: formatDay(kpi.endDate),
                value: formatValue(kpi.projected, kpi.metricType),
              })
            }}
          </p>
          <div v-if="kpi.series.length > 1" class="kpi__spark">
            <svg
              viewBox="0 0 300 48"
              preserveAspectRatio="none"
              :aria-label="kpi.name"
              role="img"
              class="kpi__spark-svg"
            >
              <polygon
                :points="`0,48 ${sparklinePoints(kpi.series, 300, 48)} 300,48`"
                :fill="TONE_COLOR[kpi.status]"
                fill-opacity="0.12"
              />
              <line
                x1="0"
                :y1="sparklineTargetY(kpi.target, kpi.series, 48)"
                x2="300"
                :y2="sparklineTargetY(kpi.target, kpi.series, 48)"
                :stroke="TONE_COLOR[kpi.status]"
                stroke-dasharray="4 3"
                stroke-width="1"
              />
              <polyline
                :points="sparklinePoints(kpi.series, 300, 48)"
                fill="none"
                :stroke="TONE_COLOR[kpi.status]"
                stroke-width="2"
              />
            </svg>
            <div class="kpi__spark-axis">
              <span>{{ formatDay(kpi.windowStart) }}</span>
              <span>{{ formatDay(kpi.windowEnd) }}</span>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </HomeWidgetCard>
</template>

<style scoped>
.kpi__range {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.kpi__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.kpi__row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 16px 0;
  border-bottom: 1px solid var(--sm-border-secondary);
}

.kpi__row:last-child {
  border-bottom: 0;
}

.kpi__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.kpi__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
}

.kpi__target {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.kpi__current-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.kpi__current {
  font-size: 14px;
  font-weight: 600;
}

.kpi__remaining {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.kpi__bar {
  position: relative;
  height: 8px;
  width: 100%;
  overflow: hidden;
  border-radius: 999px;
  background: var(--sm-border-secondary);
}

.kpi__bar span {
  display: block;
  height: 100%;
}

.kpi__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.kpi__fact {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.kpi__dot {
  width: 4px;
  height: 4px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
}

.kpi__projection {
  margin: 0;
  font-size: 12px;
  color: var(--sm-color-warning-text);
}

.kpi__spark {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.kpi__spark-svg {
  width: 100%;
  height: 48px;
}

.kpi__spark-axis {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}
</style>
