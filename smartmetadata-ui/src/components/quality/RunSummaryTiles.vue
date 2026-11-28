<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official RunSummaryTiles.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TestCaseResult } from '@/types/quality';
import { NO_VALUE } from '@/quality/testSummary.constants';
import { getRunSummary } from '@/quality/runSummaryTiles.utils';

const props = defineProps<{
  results: TestCaseResult[];
}>();

const { t } = useI18n();

const tiles = computed(() => {
  const summary = getRunSummary(props.results);
  return [
    { key: 'runs', label: t('label.run-plural'), value: summary.runs.toLocaleString() },
    {
      key: 'passed',
      label: t('label.passed'),
      value: summary.passed.toLocaleString(),
      className: 'run-summary-tiles__passed',
    },
    {
      key: 'failed',
      label: t('label.failed'),
      value: summary.failed.toLocaleString(),
      className: 'run-summary-tiles__failed',
    },
    {
      key: 'aborted',
      label: t('label.aborted'),
      value: summary.aborted.toLocaleString(),
      className: 'run-summary-tiles__aborted',
    },
    {
      key: 'success-rate',
      label: t('label.success-rate'),
      value: summary.successRate === undefined ? NO_VALUE : `${summary.successRate}%`,
    },
  ];
});
</script>

<template>
  <div class="run-summary-tiles" data-testid="run-summary-tiles">
    <div
      v-for="tile in tiles"
      :key="tile.key"
      class="run-summary-tiles__tile"
      :class="tile.className"
      :data-testid="`run-summary-${tile.key}`"
    >
      <div class="run-summary-tiles__label">{{ tile.label }}</div>
      <div class="run-summary-tiles__value">{{ tile.value }}</div>
    </div>
  </div>
</template>

<style scoped>
.run-summary-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  gap: 10px;
}
.run-summary-tiles__tile {
  border: 1px solid var(--sm-border-color, #e8e8e8);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--sm-bg-container, #fff);
}
.run-summary-tiles__label {
  font-size: 12px;
  color: var(--sm-text-secondary);
}
.run-summary-tiles__value {
  font-size: 18px;
  font-weight: 600;
  margin-top: 4px;
}
.run-summary-tiles__passed .run-summary-tiles__value {
  color: #067647;
}
.run-summary-tiles__failed .run-summary-tiles__value {
  color: #b42318;
}
.run-summary-tiles__aborted .run-summary-tiles__value {
  color: #b54708;
}
</style>