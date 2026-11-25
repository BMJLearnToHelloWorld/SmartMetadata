<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { Button, Card, Col, Input, Progress, Row, Skeleton, Typography } from 'ant-design-vue';
import { ArrowRightOutlined } from '@ant-design/icons-vue';
import SmChart from '@/features/charts/SmChart.vue';
import type { ChartSeries } from '@/features/charts/types';
import SmState from '@/components/shared/SmState.vue';
import EmptyGraphPlaceholder from './EmptyGraphPlaceholder.vue';
import { SM_DATA_INSIGHT_COLORS, SM_PALETTE } from '@/theme/tokens';

export interface DataInsightChartRow {
  /** Stable key: the chart series name (group). Drives selection/filtering. */
  key: string;
  /** Display name (i18n label; pin pluralizes TotalDataAssets rows only — the product keeps i18n names, see PIN-EVIDENCE.md). */
  name: string;
  /** Value text shown next to the name (count, or percent with a % suffix). */
  label: string;
  /** Bar width. Pin passes the raw latest value, clamped 0–100 in the row. */
  percent: number;
  /** Stroke color: palette index by the row's rank, like pin dataInsightColor. */
  color: string;
}

export interface DataInsightChartHeadline {
  label: string;
  /** Display value, e.g. "300" or "62.5%". */
  value: string;
  /** Bar width when showProgress (the numeric headline value). */
  progress: number;
  /** Preformatted change line, e.g. "+15.00 pp over the last 7 days". */
  changeText?: string;
  /** Pin DataInsightProgressBar showProgress: only the percentage cards show the bar. */
  showProgress: boolean;
  /** KPI target: rendered as a marker on the bar (pin renderProgressTarget). */
  target?: number;
  targetSuffix?: string;
}

/**
 * One official DataInsightChartCard (openmetadata-ui
 * components/DataInsight/DataInsightChartCard.tsx), in the product's
 * dev_ui language: left 16/24 is the page header + 500px line chart
 * with the built-in legend hidden (HIDDEN_CHART_LEGEND), right 8/24 is
 * the headline (total + change + KPI target marker), the search box and
 * the clickable side-by-side rows (pin EntitySummaryProgressBar: name +
 * value left, bar right at >=768px). Clicking a row filters the chart
 * to that series (pin updateActiveChartFilter toggle); hovering dims
 * the other series to 0.3; Clear resets the pick. The two data-asset
 * percentage cards link out to Explore with pin's no-description /
 * no-owner advanced-search filter carried verbatim as query_filter.
 */
const props = defineProps<{
  /** DOM id (pin id={type}); the summary cards scroll to it. */
  id: string;
  title: string;
  subTitle: string;
  series: ChartSeries[];
  rows: DataInsightChartRow[];
  headline?: DataInsightChartHeadline;
  loading: boolean;
  failed: boolean;
  testId: string;
  /**
   * Chart-level empty description (SmChart's own empty fallback). The
   * card-level empty state is pin's EmptyGraphPlaceholder, not this text.
   */
  emptyText: string;
  errorText: string;
  listAssets?: 'description' | 'owner';
  /**
   * Pin DataInsightPureUtils.ts:217-224 (isPercentageSystemGraph): only
   * the four percentage cards are percentage graphs — description,
   * owner, service description, service owner. DataAssetsView sets this
   * from the card's own builder (percentageCard/serviceCard), never
   * from the headline; the tier card is not a percentage graph in pin.
   */
  isPercentage?: boolean;
}>();

const { t } = useI18n();

const search = ref('');
const selected = ref<string[]>([]);
const hoverKey = ref('');

const hasData = computed(() => props.series.some((item) => item.points.length));

const visibleRows = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) {
    return props.rows;
  }
  // Pin DataInsightChartCard.tsx:442-443 matches the raw entity key
  // case-insensitively (searching `storedProcedure` hits). The product
  // additionally keeps matching the display name, so Chinese names stay
  // searchable in a Chinese locale (multilingual exception).
  return props.rows.filter(
    (row) => row.name.toLowerCase().includes(query) || row.key.toLowerCase().includes(query),
  );
});

const visibleSeries = computed(() => {
  const visibleKeys = new Set(visibleRows.value.map((row) => row.key));
  return props.series.filter((item) => {
    const shown =
      selected.value.length === 0 || item.name === hoverKey.value || selected.value.includes(item.name);
    return shown && visibleKeys.has(item.name);
  });
});

/** Pin getDataInsightLineSeries: the hovered series stays full, the rest dim to 0.3. */
const dimmedNames = computed(() =>
  hoverKey.value ? visibleSeries.value.map((item) => item.name).filter((name) => name !== hoverKey.value) : [],
);

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isActive(row: DataInsightChartRow): boolean {
  return selected.value.length === 0 || selected.value.includes(row.key);
}

function isDimmed(row: DataInsightChartRow): boolean {
  return selected.value.length > 0 && !selected.value.includes(row.key);
}

/** Pin ChartUtils.tsx updateActiveChartFilter: present -> remove, absent -> append. */
function toggleRow(key: string): void {
  selected.value = selected.value.includes(key)
    ? selected.value.filter((item) => item !== key)
    : [...selected.value, key];
}

/**
 * Pin explore.constants.ts, carried verbatim: the product's Explore
 * reads the same QueryBuilder JSON from the `query_filter` URL param,
 * and both fields (descriptionStatus, ownerDisplayName) are in the
 * product's advanced-search field defs with the same operators.
 */
const INCOMPLETE_DESCRIPTION_ADVANCE_SEARCH_FILTER = {
  id: 'descriptionID1',
  type: 'group',
  properties: { conjunction: 'AND', not: false },
  children1: {
    descriptionID2: {
      type: 'group',
      properties: { conjunction: 'AND', not: false },
      children1: {
        descriptionID3: {
          type: 'rule',
          properties: {
            field: 'descriptionStatus',
            operator: 'select_equals',
            value: ['INCOMPLETE'],
            valueSrc: ['value'],
            operatorOptions: null,
            valueType: ['select'],
            asyncListValues: [{ key: 'INCOMPLETE', value: 'INCOMPLETE', children: 'Incomplete' }],
          },
          id: 'descriptionID3',
          path: ['descriptionID1', 'descriptionID2', 'descriptionID3'],
        },
      },
      id: 'descriptionID2',
      path: ['descriptionID1', 'descriptionID2'],
    },
  },
  path: ['descriptionID1'],
};

const NO_OWNER_ADVANCE_SEARCH_FILTER = {
  id: 'ownerID1',
  type: 'group',
  properties: { conjunction: 'AND', not: false },
  children1: {
    ownerID3: {
      type: 'group',
      properties: { conjunction: 'AND', not: false },
      children1: {
        ownerID2: {
          type: 'rule',
          properties: {
            field: 'ownerDisplayName',
            operator: 'is_null',
            value: [],
            valueSrc: [],
            operatorOptions: null,
            valueType: [],
          },
          id: 'ownerID2',
          path: ['ownerID1', 'ownerID3', 'ownerID2'],
        },
      },
      id: 'ownerID3',
      path: ['ownerID1', 'ownerID3'],
    },
  },
  path: ['ownerID1'],
};

const exploreLink = computed(() =>
  props.listAssets
    ? {
        name: 'search',
        query: {
          tab: 'table',
          query_filter: JSON.stringify(
            props.listAssets === 'description'
              ? INCOMPLETE_DESCRIPTION_ADVANCE_SEARCH_FILTER
              : NO_OWNER_ADVANCE_SEARCH_FILTER,
          ),
        },
      }
    : undefined,
);
</script>

<template>
  <Card size="small" :id="id" :data-testid="`${testId}-card`" class="di-chart-card">
    <!--
      Pin DataInsightChartCard.tsx:620-645: the loading shell keeps the
      card title + sub-header and shows SkeletonParagraph rows={4} while
      fetching, EmptyGraphPlaceholder once the fetch returns no data.
      The error branch below stays the product's intentional deviation
      (review condition 3: in-card error state + page warning) — pin only
      toasts and falls through to the empty placeholder.
    -->
    <div v-if="loading" :data-testid="`${testId}-loading`">
      <Typography.Title :level="5" class="di-chart-card__title">{{ title }}</Typography.Title>
      <Typography.Paragraph type="secondary" class="di-chart-card__sub">{{ subTitle }}</Typography.Paragraph>
      <Skeleton active :title="{ width: '40%' }" :paragraph="{ rows: 4 }" />
    </div>
    <SmState
      v-else-if="failed"
      state="error"
      :test-id="`${testId}-error`"
      :error-text="errorText"
    />
    <EmptyGraphPlaceholder v-else-if="!hasData" :test-id="`${testId}-empty`" />
    <Row v-else :gutter="32">
      <Col :xs="24" :lg="16">
        <Typography.Title :level="5" class="di-chart-card__title">{{ title }}</Typography.Title>
        <Typography.Paragraph type="secondary" class="di-chart-card__sub">{{ subTitle }}</Typography.Paragraph>
        <SmChart
          kind="line"
          :test-id="testId"
          :series="visibleSeries"
          :colors="SM_DATA_INSIGHT_COLORS"
          :height="500"
          hide-legend
          :dimmed-names="dimmedNames"
          :percentage-y-axis="isPercentage"
          :empty="emptyText"
        />
      </Col>
      <Col :xs="24" :lg="8">
        <div v-if="headline" :data-testid="`${testId}-headline`" class="di-chart-card__headline">
          <Typography.Paragraph type="secondary" class="di-chart-card__headline-label">
            {{ headline.label }}
          </Typography.Paragraph>
          <Typography.Title :level="4" class="di-chart-card__headline-value">{{ headline.value }}</Typography.Title>
          <Typography.Paragraph v-if="headline.changeText" type="secondary">
            {{ headline.changeText }}
          </Typography.Paragraph>
          <div v-if="headline.showProgress" class="di-chart-card__progress">
            <Progress
              :percent="clamp(headline.progress)"
              :show-info="false"
              stroke-color="var(--sm-color-primary)"
              size="small"
            />
            <span
              v-if="headline.target !== undefined"
              class="di-chart-card__target"
              :data-testid="`${testId}-target`"
              :style="{ left: `${clamp(headline.target)}%` }"
            >
              {{ round2(headline.target) }}{{ headline.targetSuffix ?? '%' }}
            </span>
          </div>
        </div>
        <Input
          v-model:value="search"
          :data-testid="`${testId}-search`"
          :placeholder="t('insights.cards.searchPlaceholder')"
          allow-clear
        />
        <ul :data-testid="`${testId}-rows`" class="di-chart-card__list">
          <li
            v-for="row in visibleRows"
            :key="row.key"
            :data-testid="`${testId}-row`"
            :class="['di-chart-card__row', { 'di-chart-card__row--dim': isDimmed(row) }]"
            @click="toggleRow(row.key)"
            @mouseenter="hoverKey = row.key"
            @mouseleave="hoverKey = ''"
          >
            <Row align="middle">
              <Col :xs="24" :md="12" class="di-chart-card__meta">
                <span class="di-chart-card__name" :data-testid="`${testId}-row-name`">{{ row.name }}</span>
                <span class="di-chart-card__value" :data-testid="`${testId}-row-value`">{{ row.label }}</span>
              </Col>
              <Col :xs="24" :md="12" class="di-chart-card__bar">
                <Progress
                  :percent="clamp(row.percent)"
                  :show-info="false"
                  :stroke-color="isActive(row) ? row.color : SM_PALETTE.gray[50]"
                  size="small"
                />
              </Col>
            </Row>
          </li>
        </ul>
        <div v-if="selected.length" class="di-chart-card__clear">
          <Button type="link" :data-testid="`${testId}-clear`" @click="selected = []">
            {{ t('insights.service.clear') }}
          </Button>
        </div>
      </Col>
      <Col v-if="listAssets && exploreLink" :span="24" class="di-chart-card__explore">
        <RouterLink :to="exploreLink" :data-testid="`${testId}-explore-link`">
          <Button type="link">
            {{
              listAssets === 'description'
                ? t('insights.cards.exploreNoDescription')
                : t('insights.cards.exploreNoOwner')
            }}
            <ArrowRightOutlined />
          </Button>
        </RouterLink>
      </Col>
    </Row>
  </Card>
</template>

<style scoped>
.di-chart-card__title {
  margin-bottom: 4px;
}
.di-chart-card__sub {
  margin-bottom: 12px;
}
.di-chart-card__headline-label {
  margin-bottom: 0;
}
.di-chart-card__headline-value {
  margin-top: 0;
  margin-bottom: 4px;
}
.di-chart-card__progress {
  position: relative;
  padding-top: 20px;
  margin-bottom: 12px;
}
.di-chart-card__target {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
}
.di-chart-card__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.di-chart-card__row {
  min-width: 0;
  margin-block-end: 8px;
  cursor: pointer;
}
.di-chart-card__row--dim {
  opacity: 0.45;
}
.di-chart-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  line-height: 18px;
}
/* Pin EntitySummaryProgressBar: the meta and the bar sit side by side at
 * >=768px (ant md), stacked below it — the meta's bottom margin and the
 * bar's left padding only apply in the stacked layout. */
@media (min-width: 768px) {
  .di-chart-card__meta {
    margin-bottom: 0;
  }
  .di-chart-card__bar {
    padding-left: 8px;
  }
}
.di-chart-card__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.di-chart-card__value {
  flex-shrink: 0;
}
/* Ant Progress line root carries an 8px end margin (ant-design-vue
 * progress/style: `&-line { marginInlineEnd: token.marginXS }`); cancel
 * it so the bar sits exactly inside the column. No outer/text overrides
 * are needed: with showInfo off antd renders no `.ant-progress-text`
 * (progress.js:100 returns null) and the `show-info` class that reserves
 * the 2em text space is absent (progress.js:84), so `.ant-progress-outer`
 * is already full-width with zero end margin/padding. */
.di-chart-card__row :deep(.ant-progress) {
  display: block;
  width: 100%;
  margin-inline-end: 0;
  line-height: 1;
}
.di-chart-card__clear {
  display: flex;
  justify-content: flex-end;
}
.di-chart-card__explore {
  display: flex;
  justify-content: flex-end;
}
</style>
