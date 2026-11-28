<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official DimensionalityHeatmap.component.tsx (Vue).
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Spin, Tooltip } from 'ant-design-vue';
import type { TestCaseDimensionResult } from '@/types/quality';
import DimensionalityHeatmapCellTooltip from '@/components/quality/DimensionalityHeatmapCellTooltip.vue';
import {
  formatDateLabelUTC,
  getStatusLabel,
  transformDimensionResultsToHeatmapData,
} from '@/quality/dimensionalityHeatmap.utils';

const props = defineProps<{
  data: TestCaseDimensionResult[];
  startTs: number;
  endTs: number;
  loading?: boolean;
}>();

const { t } = useI18n();
const scrollRef = ref<HTMLDivElement | null>(null);
const showLeftIndicator = ref(false);
const showRightIndicator = ref(false);

const heatmapData = computed(() =>
  transformDimensionResultsToHeatmapData(props.data, props.startTs, props.endTs),
);

function refreshScrollIndicators(): void {
  const el = scrollRef.value;
  if (!el) {
    showLeftIndicator.value = false;
    showRightIndicator.value = false;
    return;
  }
  showLeftIndicator.value = el.scrollLeft > 4;
  showRightIndicator.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function handleScrollLeft(): void {
  scrollRef.value?.scrollBy({ left: -200, behavior: 'smooth' });
}

function handleScrollRight(): void {
  scrollRef.value?.scrollBy({ left: 200, behavior: 'smooth' });
}

watch(
  () => [props.startTs, props.endTs, props.data],
  () => {
    if (scrollRef.value) {
      scrollRef.value.scrollLeft = scrollRef.value.scrollWidth;
    }
    refreshScrollIndicators();
  },
);

onMounted(() => {
  if (scrollRef.value) {
    scrollRef.value.scrollLeft = scrollRef.value.scrollWidth;
  }
  refreshScrollIndicators();
});
</script>

<template>
  <div class="dimensionality-heatmap" data-testid="dimensionality-heatmap">
    <Spin v-if="loading" />
    <div v-else-if="data.length === 0" class="dimensionality-heatmap__empty" data-testid="dimensionality-heatmap-empty">
      {{ t('message.no-data-available') }}
    </div>
    <template v-else>
      <div class="dimensionality-heatmap__layout">
        <div class="dimensionality-heatmap__labels-column">
          <div class="dimensionality-heatmap__header-corner" />
          <Tooltip v-for="row in heatmapData" :key="row.dimensionValue" :title="row.dimensionValue">
            <div class="dimensionality-heatmap__dimension-label">{{ row.dimensionValue }}</div>
          </Tooltip>
        </div>
        <div class="dimensionality-heatmap__scroll-wrapper">
          <button
            v-if="showLeftIndicator"
            type="button"
            class="dimensionality-heatmap__scroll-indicator dimensionality-heatmap__scroll-indicator--left"
            :aria-label="`${t('label.scroll')} ${t('label.left')}`"
            @click="handleScrollLeft"
          >
            ‹
          </button>
          <div
            ref="scrollRef"
            class="dimensionality-heatmap__scroll-container"
            @scroll="refreshScrollIndicators"
          >
            <div class="dimensionality-heatmap__header-row">
              <div
                v-for="date in heatmapData[0]?.cells ?? []"
                :key="date.date"
                class="dimensionality-heatmap__header-cell"
              >
                {{ formatDateLabelUTC(date.date) }}
              </div>
            </div>
            <div v-for="row in heatmapData" :key="`row-${row.dimensionValue}`" class="dimensionality-heatmap__data-row">
              <Tooltip
                v-for="cell in row.cells"
                :key="`${cell.dimensionValue}-${cell.date}`"
              >
                <template #title>
                  <DimensionalityHeatmapCellTooltip :cell="cell" />
                </template>
                <div
                  class="dimensionality-heatmap__cell"
                  :class="`dimensionality-heatmap__cell--${cell.status}`"
                  :aria-label="`${cell.dimensionValue}, ${formatDateLabelUTC(cell.date)}: ${getStatusLabel(cell.status, t)}`"
                  data-testid="heatmap-cell"
                />
              </Tooltip>
            </div>
          </div>
          <button
            v-if="showRightIndicator"
            type="button"
            class="dimensionality-heatmap__scroll-indicator dimensionality-heatmap__scroll-indicator--right"
            :aria-label="`${t('label.view')} ${t('label.more')}`"
            @click="handleScrollRight"
          >
            ›
          </button>
        </div>
      </div>
      <div class="dimensionality-heatmap__legend" data-testid="dimensionality-heatmap-legend">
        <span
          v-for="status in (['success', 'failed', 'aborted', 'no-data'] as const)"
          :key="status"
          class="dimensionality-heatmap__legend-item"
        >
          <span class="dimensionality-heatmap__legend-box" :class="`dimensionality-heatmap__legend-box--${status}`" />
          {{ getStatusLabel(status, t) }}
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dimensionality-heatmap__layout {
  display: flex;
  width: 100%;
}
.dimensionality-heatmap__labels-column {
  flex-shrink: 0;
  width: 150px;
}
.dimensionality-heatmap__header-corner {
  height: 30px;
}
.dimensionality-heatmap__dimension-label {
  height: 20px;
  line-height: 20px;
  margin-bottom: 16px;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}
.dimensionality-heatmap__scroll-wrapper {
  position: relative;
  flex: 1;
  overflow: hidden;
}
.dimensionality-heatmap__scroll-container {
  overflow-x: auto;
  overflow-y: hidden;
}
.dimensionality-heatmap__header-row,
.dimensionality-heatmap__data-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.dimensionality-heatmap__header-cell {
  flex-shrink: 0;
  width: 44px;
  height: 30px;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
}
.dimensionality-heatmap__cell {
  flex-shrink: 0;
  width: 44px;
  height: 20px;
  border-radius: 4px;
  cursor: default;
}
.dimensionality-heatmap__cell--success {
  border: 1px solid #12b76a;
  background: #ecfdf3;
}
.dimensionality-heatmap__cell--failed {
  border: 1px solid #f04438;
  background: #fef3f2;
}
.dimensionality-heatmap__cell--aborted {
  border: 1px solid #f79009;
  background: #fffaeb;
}
.dimensionality-heatmap__cell--no-data {
  border: 1px solid #d0d5dd;
  background: #f2f4f7;
}
.dimensionality-heatmap__scroll-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 32px;
  border: none;
  background: linear-gradient(to right, transparent, rgb(255 255 255 / 95%));
  cursor: pointer;
  z-index: 2;
  font-size: 20px;
}
.dimensionality-heatmap__scroll-indicator--left {
  left: 0;
  background: linear-gradient(to left, transparent, rgb(255 255 255 / 95%));
}
.dimensionality-heatmap__scroll-indicator--right {
  right: 0;
}
.dimensionality-heatmap__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  margin-left: 150px;
  font-size: 12px;
}
.dimensionality-heatmap__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dimensionality-heatmap__legend-box {
  width: 11px;
  height: 9px;
  border-radius: 2px;
}
.dimensionality-heatmap__legend-box--success {
  border: 1px solid #12b76a;
  background: #ecfdf3;
}
.dimensionality-heatmap__legend-box--failed {
  border: 1px solid #f04438;
  background: #fef3f2;
}
.dimensionality-heatmap__legend-box--aborted {
  border: 1px solid #f79009;
  background: #fffaeb;
}
.dimensionality-heatmap__legend-box--no-data {
  border: 1px solid #d0d5dd;
  background: #f2f4f7;
}
.dimensionality-heatmap__empty {
  padding: 32px;
  text-align: center;
  color: var(--sm-text-secondary);
}
</style>