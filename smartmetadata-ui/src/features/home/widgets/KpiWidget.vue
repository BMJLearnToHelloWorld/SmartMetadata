<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Empty, Typography } from 'ant-design-vue';
import HomeWidgetCard from '../HomeWidgetCard.vue';
import type { Kpi } from '@/types/kpi';

/**
 * `KnowledgePanel.KPI` — the existing KPI card (current values only),
 * mapped into the landing grid as-is. Target progress is a stage-B
 * residual (REVIEW-W1-5-G11 §2-12 row 13).
 */
defineProps<{
  kpis: Kpi[];
  tried: boolean;
}>();

const emit = defineEmits<{
  'setup-kpi': [];
}>();

const { t } = useI18n();

function kpiLabel(kpi: Kpi): string {
  return kpi.displayName || kpi.name;
}

function kpiCurrent(kpi: Kpi): string {
  return kpi.kpiResult?.targetResult[0]?.value || '—';
}
</script>

<template>
  <HomeWidgetCard :title="t('home.kpi')" test-id="home-widget-kpi">
    <ul v-if="kpis.length" class="home-list" data-testid="home-kpi-list">
      <li v-for="kpi in kpis" :key="kpi.name">
        <div class="home-list__row home-list__row--static" :data-testid="`home-kpi-${kpi.name}`">
          <span>{{ kpiLabel(kpi) }}</span>
          <span>{{ kpiCurrent(kpi) }}</span>
        </div>
      </li>
    </ul>
    <Empty v-else-if="tried" data-testid="home-kpi-empty" :description="t('home.kpiEmptyTitle')">
      <template #description>
        <Typography.Title :level="5">{{ t('home.kpiEmptyTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('home.kpiEmpty') }}</Typography.Paragraph>
      </template>
      <Button data-testid="home-setup-kpi" @click="emit('setup-kpi')">{{ t('home.setupKpi') }}</Button>
    </Empty>
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
.home-list__row--static {
  cursor: default;
}
</style>
