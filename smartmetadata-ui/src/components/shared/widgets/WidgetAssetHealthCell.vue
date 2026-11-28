/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
import { getContractByEntityId, type DataContract } from '@/api/dataContracts';
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import { listTestIncidents } from '@/api/testIncidents';
import { getTestCaseExecutionSummary } from '@/api/testSuites';
import {
  ASSET_HEALTH_BADGE_STATUS,
  getAssetHealthHeader,
  getContractHealthRow,
  getDataObservabilityHealthRow,
  getDataQualityHealthRow,
  getPipelineHealthRow,
  type AssetHealthCtaType,
  type AssetHealthRow,
} from '@/catalog/assetHealthRows';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestIncident, TestSummary } from '@/types/quality';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RouteLocationRaw } from 'vue-router';
import {
  ENTITY_TAB_PROFILER,
  getEntityDetailsPath,
  getServiceDetailsPath,
  SERVICE_AGENT_SUB_TAB_METADATA,
  SERVICE_CATEGORY_DATABASE_SERVICES,
  SERVICE_TAB_AGENTS,
} from '@/utils/fqnPaths';

/**
 * Official AssetHealth widget
 * (openmetadata-ui/.../DataAssets/AssetHealthWidget/AssetHealthWidget.component.tsx
 * + useAssetHealth.ts), table only: four rows in a fixed order — pipeline,
 * data quality, data observability, contract — each fetched in parallel.
 * A failed pipeline, summary or incident load is an error state; the
 * contract is never an error (no contract is a setup row). No write, no
 * permission.
 *
 * Named deviation: pin's FeaturedIcon/BadgeWithIcon pair has no product
 * equivalent, so each row renders an antd Badge plus a text CTA.
 */
const props = defineProps<{
  tableId: string;
  tableFqn: string;
  serviceFqn: string;
  serviceId?: string;
  testSuiteId?: string;
}>();

const { t } = useI18n();
const rows = ref<AssetHealthRow[]>([]);
const headerLabelKey = ref('label.not-set-up');
const headerTone = ref<'success' | 'warning' | 'error' | 'info' | 'neutral'>('neutral');
const loading = ref(true);
const loadFailed = ref(false);

/**
 * The CTA target is computed once per row: the template's `v-if` can
 * narrow a property (`item.to`) but not a second call to the same
 * function, and `RouterLink :to` takes no `undefined`.
 */
const rowsWithTargets = computed(() =>
  rows.value.map((row) => ({
    ...row,
    to: row.cta ? ctaTarget(row.cta.type) : undefined,
  })),
);

async function load(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;
  try {
    const hasTests = Boolean(props.testSuiteId);
    const [pipelineResult, summaryResult, incidentsResult, contractResult] =
      await Promise.all([
        listIngestionPipelines({
          fields: 'pipelineStatuses',
          limit: 1,
          pipelineType: 'Metadata',
          serviceFilter: props.serviceFqn,
        }).then((page) => page.data[0] as IngestionPipeline | undefined),
        hasTests
          ? getTestCaseExecutionSummary(props.testSuiteId)
          : Promise.resolve(undefined as TestSummary | undefined),
        listTestIncidents({ latest: true, limit: 50, originEntityFQN: props.tableFqn }).then(
          (page) => page.data as TestIncident[],
        ),
        // A contract load never fails the widget: no contract is a setup
        // row, and any other contract error degrades to the same row.
        getContractByEntityId(props.tableId, 'table').catch(() => null as DataContract | null),
      ]);
    const nextRows = [
      getPipelineHealthRow(pipelineResult, t),
      getDataQualityHealthRow(hasTests, summaryResult, t),
      getDataObservabilityHealthRow(hasTests, incidentsResult, t),
      getContractHealthRow(contractResult, t),
    ];
    rows.value = nextRows;
    const header = getAssetHealthHeader(nextRows);
    headerLabelKey.value = header.labelKey;
    headerTone.value = header.tone;
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

function ctaTarget(type: AssetHealthCtaType): RouteLocationRaw | undefined {
  if (type === 'link-pipeline') {
    return props.serviceFqn
      ? {
          path: getServiceDetailsPath(
            props.serviceFqn,
            SERVICE_CATEGORY_DATABASE_SERVICES,
            SERVICE_TAB_AGENTS,
            SERVICE_AGENT_SUB_TAB_METADATA,
          ),
        }
      : undefined;
  }
  if (type === 'add-tests' || type === 'enable-observability') {
    // Official AssetHealthWidget: getEntityDetailsPath(TABLE, tableFqn, EntityTabs.PROFILER)
    return { path: getEntityDetailsPath('table', props.tableFqn, ENTITY_TAB_PROFILER) };
  }
  // Official AssetHealthWidget: getEntityDetailsPath(TABLE, tableFqn, EntityTabs.CONTRACT)
  return { path: getEntityDetailsPath('table', props.tableFqn, 'contract') };
}

onMounted(load);
</script>

<template>
  <a-skeleton v-if="loading" active data-testid="asset-health-loading" />
  <a-alert
    v-else-if="loadFailed"
    data-testid="asset-health-error"
    type="error"
    :message="t('message.something-went-wrong')"
    show-icon
  >
    <template #action>
      <a-button size="small" data-testid="asset-health-retry" @click="load">
        {{ t('label.try-again') }}
      </a-button>
    </template>
  </a-alert>
  <div v-else class="asset-health-cell" data-testid="asset-health">
    <div class="asset-health-cell__header">
      <span class="asset-health-cell__title">{{ t('label.asset-health') }}</span>
      <a-badge
        :status="ASSET_HEALTH_BADGE_STATUS[headerTone]"
        :text="t(headerLabelKey)"
        data-testid="asset-health-header"
      />
    </div>
    <a-list :data-source="rowsWithTargets" size="small">
      <template #renderItem="{ item }: { item: AssetHealthRow & { to?: RouteLocationRaw } }">
        <a-list-item :key="item.category" data-testid="asset-health-row">
          <div class="asset-health-cell__row">
            <span class="asset-health-cell__row-title">{{ t(item.titleKey) }}</span>
            <a-badge
              v-if="item.badgeLabel"
              :status="ASSET_HEALTH_BADGE_STATUS[item.tone]"
              :text="item.badgeLabel"
              data-testid="asset-health-badge"
            />
            <span v-if="item.subtitle" class="asset-health-cell__subtitle">
              {{ item.subtitle }}
            </span>
            <RouterLink
              v-if="item.cta && item.to"
              data-testid="asset-health-cta"
              :to="item.to"
            >
              {{ t(item.cta.labelKey) }}
            </RouterLink>
          </div>
        </a-list-item>
      </template>
    </a-list>
  </div>
</template>

<style scoped>
.asset-health-cell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.asset-health-cell__title {
  font-weight: 600;
}

.asset-health-cell__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.asset-health-cell__row-title {
  font-weight: 600;
}

.asset-health-cell__subtitle {
  color: var(--sm-text-secondary);
}
</style>
