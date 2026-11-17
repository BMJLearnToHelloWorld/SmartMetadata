<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import {
  ApiOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  BarsOutlined,
  ClusterOutlined,
  CodeOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileExcelOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOutlined,
  FunctionOutlined,
  LinkOutlined,
  MessageOutlined,
  SearchOutlined,
  ShareAltOutlined,
  TableOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Skeleton } from 'ant-design-vue';
import SmState from '@/components/shared/SmState.vue';
import { getReadableCountString } from './serviceInsightsUtils';

/**
 * Total data assets widget, ported from official
 * components/ServiceInsights/TotalDataAssetsWidget/TotalDataAssetsWidget.tsx
 * (pin a3012259ca). The placeholder shows when the list is empty or
 * every value is zero; loading shows a skeleton paragraph. Pin
 * carries a rendered icon per row; the product resolves the icon
 * from the row's entity `key` through the local map below (the
 * `embedded` variant is not ported: the service page tab always
 * uses the bordered form).
 */
export interface TotalAssetsCount {
  key: string;
  name: string;
  value: number;
}

const ENTITY_ICON: Record<string, Component> = {
  database: DatabaseOutlined,
  databaseSchema: ApartmentOutlined,
  storedProcedure: FunctionOutlined,
  table: TableOutlined,
  tableColumn: BarsOutlined,
  query: CodeOutlined,
  topic: MessageOutlined,
  chart: BarChartOutlined,
  dashboard: DashboardOutlined,
  dashboardDataModel: ClusterOutlined,
  pipeline: ShareAltOutlined,
  mlmodel: ExperimentOutlined,
  container: FolderOutlined,
  searchService: SearchOutlined,
  apiCollection: ApiOutlined,
  apiEndpoint: LinkOutlined,
  directory: FolderOutlined,
  file: FileOutlined,
  spreadsheet: FileExcelOutlined,
  worksheet: FileTextOutlined,
};

const props = defineProps<{
  totalAssetsCount: TotalAssetsCount[];
  isLoading: boolean;
}>();

const { t } = useI18n();

const showPlaceholder = computed(
  () =>
    props.totalAssetsCount.length === 0 ||
    props.totalAssetsCount.every((entity) => entity.value === 0),
);

function entityIcon(key: string): Component {
  return ENTITY_ICON[key] ?? DatabaseOutlined;
}
</script>

<template>
  <div class="total-data-assets-widget" data-testid="total-data-assets-widget">
    <div class="total-data-assets-widget__header">
      <div class="total-data-assets-widget__title">
        {{ t('serviceDetail.insights.totalDataAssetsTitle') }}
      </div>
      <div class="total-data-assets-widget__description">
        {{ t('serviceDetail.insights.totalDataAssetsDescription') }}
      </div>
    </div>
    <Skeleton v-if="isLoading" :active="false" />
    <div v-else-if="showPlaceholder">
      <SmState state="empty" test-id="total-data-assets-empty" />
    </div>
    <div v-else class="total-data-assets-widget__list">
      <div v-for="entity in totalAssetsCount" :key="entity.name" class="total-data-assets-widget__row">
        <span class="total-data-assets-widget__row-label">
          <span class="total-data-assets-widget__icon">
            <component :is="entityIcon(entity.key)" />
          </span>
          {{ entity.name }}
        </span>
        <span class="total-data-assets-widget__count" :data-testid="`${entity.name}-count`">
          {{ getReadableCountString(entity.value) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.total-data-assets-widget {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 24px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
  background: var(--sm-bg-primary);
}

.total-data-assets-widget__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-data-assets-widget__title {
  font-size: 18px;
  font-weight: 500;
}

.total-data-assets-widget__description {
  font-size: 14px;
  color: var(--sm-text-secondary);
}

.total-data-assets-widget__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 16px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
}

.total-data-assets-widget__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.total-data-assets-widget__row-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.total-data-assets-widget__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: var(--sm-bg-secondary);
  color: var(--sm-text-secondary);
}

.total-data-assets-widget__count {
  font-weight: 700;
}
</style>
