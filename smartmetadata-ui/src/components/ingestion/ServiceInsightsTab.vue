<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { message } from 'ant-design-vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowInstance, WorkflowStatesData } from '@/api/workflows';
import { getServiceNameQueryFilter, searchServiceIndex } from '@/api/serviceSearch';
import { listSystemChartData, type SystemChartData } from '@/api/dataInsights';
import { getDayAgoStartGMTinMillis } from '@/ingestion/autoPilot';
import type { IngestionPipeline, ServiceKind } from '@/types/ingestion';
import AgentsStatusWidget, {
  type AgentsInfo,
  type AgentStatusLabel,
} from './insights/AgentsStatusWidget.vue';
import PlatformInsightsWidget, { type ChartSeriesData } from './insights/PlatformInsightsWidget.vue';
import TotalDataAssetsWidget, { type TotalAssetsCount } from './insights/TotalDataAssetsWidget.vue';
import {
  getChartTypeForWidget,
  PLATFORM_INSIGHTS_CHARTS,
} from './insights/serviceInsightsUtils';

/**
 * Service insights tab, ported from official
 * components/ServiceInsights/ServiceInsightsTab.tsx (pin a3012259ca),
 * OSS widgets only: AgentsStatus (top) + PlatformInsights (below) in
 * a 3/4 column, TotalDataAssets in a 1/4 column. No socket stream
 * (ADR-2, poll-only): charts and asset counts load once on mount;
 * `agentsInfo` recomputes whenever `ingestionPipelines` changes.
 *
 * The AutoPilot workflow instance arrives as `liveAutoPilotStatus`
 * (the host's `workflowStatesData.mainInstanceState`, synced by the
 * host); the tab passes it straight through, which is what pin's
 * mount-seed + sync effect amounts to. The whole `workflowStatesData`
 * object arrives as its own prop, as pin threads it — no widget reads
 * `subInstanceStates` yet, in pin or here.
 *
 * `getFormattedAgentsList` keeps pin's `provider === 'automation'`
 * filter, reading the `provider` the pipeline mapper carries from
 * the server record.
 */
const props = withDefaults(
  defineProps<{
    serviceName: string;
    serviceKind: ServiceKind;
    ingestionPipelines?: IngestionPipeline[];
    isIngestionPipelineLoading?: boolean;
    liveAutoPilotStatus?: WorkflowInstance;
    workflowStatesData?: WorkflowStatesData;
  }>(),
  {
    ingestionPipelines: undefined,
    isIngestionPipelineLoading: false,
    liveAutoPilotStatus: undefined,
    workflowStatesData: undefined,
  },
);

const { t } = useI18n();

/** Pin `AUTOPILOT_AGENTS_ORDERED_LIST`, with the Collate template names verbatim. */
const AUTOPILOT_AGENTS_ORDERED_LIST = [
  'metadata',
  'lineage',
  'usage',
  'TierAutomation',
  'DescriptionAutomation',
  'DataQualityAutomation',
  'autoClassification',
  'profiler',
];

/** Pin `getAssetsByServiceType` (ServiceInsightsTabPureUtils.ts), keyed on the product kind. */
function getAssetsByServiceType(serviceKind: ServiceKind): string[] {
  switch (serviceKind) {
    case 'database':
      return ['database', 'databaseSchema', 'storedProcedure', 'table', 'tableColumn', 'query'];
    case 'messaging':
      return ['topic'];
    case 'dashboard':
      return ['chart', 'dashboard', 'dashboardDataModel'];
    case 'pipeline':
      return ['pipeline'];
    case 'mlmodel':
      return ['mlmodel'];
    case 'storage':
      return ['container'];
    case 'search':
      // Pin quirk, copied verbatim: the search-service bucket key is
      // the service entity itself, not `searchIndex`.
      return ['searchService'];
    case 'api':
      return ['apiCollection', 'apiEndpoint'];
    case 'drive':
      return ['directory', 'file', 'spreadsheet', 'worksheet'];
    default:
      return [];
  }
}

/**
 * Pin `getPlatformInsightsChartDataFormattingMethod`
 * (ServiceInsightsTabPureUtils.ts), adapted to the product's flat
 * `SystemChartData` (chart name → points) shape: `mapSystemChartData`
 * drops empty charts, so a missing key is the empty case. A single
 * result synthesizes a previous-day count-0 point; the change is
 * the absolute rounded difference; `numberOfDays` counts intervals.
 */
function formatPlatformInsightsChart(
  chartsData: SystemChartData,
  chartType: string,
): ChartSeriesData {
  const results = chartsData[chartType];
  if (!results || results.length === 0) {
    return {
      isIncreased: false,
      percentageChange: 0,
      currentPercentage: 0,
      noRecords: true,
      numberOfDays: 0,
    };
  }
  const sortedResults = [...results].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  let data = sortedResults.length >= 2 ? sortedResults : [];
  if (results.length === 1) {
    const first = sortedResults[0];
    data = [
      { day: (first.day ?? 0) - 86400000, count: 0, group: first.group, term: first.term },
      { day: first.day, count: first.count, group: first.group, term: first.term },
    ];
  }
  const earliestDayData = data[0]?.count ?? 0;
  const lastDayData = data[data.length - 1]?.count ?? 0;
  const percentageChangeOverall = Math.round(Math.abs(lastDayData - earliestDayData) * 10) / 10;
  return {
    chartType: getChartTypeForWidget(chartType),
    isIncreased: lastDayData >= earliestDayData,
    percentageChange: percentageChangeOverall,
    currentPercentage: Math.round(lastDayData * 10) / 10,
    noRecords: results.every(
      (item) =>
        item.count === undefined && item.day === undefined && !item.group && !item.term,
    ),
    numberOfDays: data.length > 0 ? data.length - 1 : 0,
  };
}

/** Pin `getAgentLabelFromType` (AgentsStatusWidgetPureUtils.ts), OSS pipeline types only. */
function getAgentLabelFromType(pipelineType: string | undefined): string {
  switch (pipelineType) {
    case 'metadata':
      return t('ingestion.pipelines.types.metadata');
    case 'lineage':
      return t('ingestion.pipelines.types.lineage');
    case 'usage':
      return t('ingestion.pipelines.types.usage');
    case 'autoClassification':
      return t('ingestion.pipelines.types.autoClassification');
    case 'profiler':
      return t('ingestion.pipelines.types.profiler');
    default:
      // The three Collate automation templates resolve to labels in
      // pin, but they can only arrive via the Collate agents list,
      // which is empty in OSS; unmatched types label as ''.
      return '';
  }
}

/** Pin `getAgentStatusLabelFromStatus` (AgentsStatusWidgetPureUtils.ts). */
function getAgentStatusLabelFromStatus(status: string | undefined): AgentStatusLabel {
  switch (status) {
    case 'Success':
    case 'PartialSuccess':
    case 'active':
    case 'activeError':
    case 'completed':
      return 'Successful';
    case 'Failed':
    case 'failed':
      return 'Failed';
    case 'Running':
    case 'running':
    case 'started':
    case 'stopInProgress':
      return 'Running';
    default:
      return 'Pending';
  }
}

/** Pin `getFormattedAgentsList` (AgentsStatusWidgetUtils.tsx), OSS half only. */
function getFormattedAgentsList(pipelines: IngestionPipeline[]): AgentsInfo[] {
  const formatted = pipelines
    .filter((pipeline) => pipeline.provider === 'automation')
    .map((pipeline) => ({
      agentType: pipeline.pipelineType ?? '',
      isCollateAgent: false,
      label: getAgentLabelFromType(pipeline.pipelineType),
      status: getAgentStatusLabelFromStatus(pipeline.pipelineStatuses?.[0]?.pipelineState),
    }));
  const ordered: AgentsInfo[] = [];
  for (const agentType of AUTOPILOT_AGENTS_ORDERED_LIST) {
    const found = formatted.find((agent) => agent.agentType === agentType);
    if (found) {
      ordered.push(found);
    }
  }
  return ordered;
}

const ASSET_NAME_KEYS: Record<string, string> = {
  database: 'serviceDetail.assetNames.database',
  databaseSchema: 'serviceDetail.assetNames.databaseSchema',
  storedProcedure: 'serviceDetail.assetNames.storedProcedure',
  table: 'serviceDetail.assetNames.table',
  tableColumn: 'serviceDetail.assetNames.tableColumn',
  query: 'serviceDetail.assetNames.query',
  topic: 'serviceDetail.assetNames.topic',
  chart: 'serviceDetail.assetNames.chart',
  dashboard: 'serviceDetail.assetNames.dashboard',
  dashboardDataModel: 'serviceDetail.assetNames.dashboardDataModel',
  pipeline: 'serviceDetail.assetNames.pipeline',
  mlmodel: 'serviceDetail.assetNames.mlmodel',
  container: 'serviceDetail.assetNames.container',
  searchService: 'serviceDetail.assetNames.searchService',
  apiCollection: 'serviceDetail.assetNames.apiCollection',
  apiEndpoint: 'serviceDetail.assetNames.apiEndpoint',
  directory: 'serviceDetail.assetNames.directory',
  file: 'serviceDetail.assetNames.file',
  spreadsheet: 'serviceDetail.assetNames.spreadsheet',
  worksheet: 'serviceDetail.assetNames.worksheet',
};

/** Pin `getEntityNameLabel` (EntityNameUtils.ts): mapped label, else startCase. */
function getEntityNameLabel(entityKey: string): string {
  const key = ASSET_NAME_KEYS[entityKey];
  if (key) {
    return t(key);
  }
  return entityKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

const agentsInfo = computed(() => getFormattedAgentsList(props.ingestionPipelines ?? []));

const chartsData = ref<ChartSeriesData[]>([]);
const totalAssetsCount = ref<TotalAssetsCount[]>([]);
const isLoading = ref(false);

async function getDataAssetsCount(): Promise<void> {
  try {
    const response = await searchServiceIndex({
      queryFilter: getServiceNameQueryFilter(props.serviceName),
      searchIndex: 'all',
      pageSize: 0,
      fetchSource: false,
    });
    const aggregations = response.aggregations as Record<string, unknown> | undefined;
    const entityType = aggregations?.entityType as Record<string, unknown> | undefined;
    const buckets = Array.isArray(entityType?.buckets) ? entityType.buckets : [];
    const assets = getAssetsByServiceType(props.serviceKind);
    const ordered: TotalAssetsCount[] = [];
    for (const assetKey of assets) {
      const bucket = buckets.find(
        (entry) =>
          typeof entry === 'object' && entry !== null && (entry as Record<string, unknown>).key === assetKey,
      ) as Record<string, unknown> | undefined;
      if (bucket !== undefined) {
        const docCount = bucket.doc_count;
        ordered.push({
          key: assetKey,
          name: getEntityNameLabel(assetKey),
          value: typeof docCount === 'number' ? docCount : 0,
        });
      }
    }
    totalAssetsCount.value = ordered;
  } catch {
    // Pin's getDataAssetsCount swallows failures silently; the
    // counts stay at their previous (initially empty) value.
  }
}

async function fetchChartsData(): Promise<void> {
  try {
    isLoading.value = true;
    const end = getDayAgoStartGMTinMillis(0);
    const start = getDayAgoStartGMTinMillis(6);
    const charts = await listSystemChartData([...PLATFORM_INSIGHTS_CHARTS], start, end, {
      filter: JSON.stringify({ query: { match: { 'service.name.keyword': props.serviceName } } }),
      strict: true,
    });
    await getDataAssetsCount();
    chartsData.value = PLATFORM_INSIGHTS_CHARTS.map((chartType) =>
      formatPlatformInsightsChart(charts, chartType),
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('shared.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void fetchChartsData();
});
</script>

<template>
  <div class="service-insights-tab">
    <div class="service-insights-tab__main">
      <AgentsStatusWidget
        :agents-info="agentsInfo"
        :is-loading="isIngestionPipelineLoading"
        :live-auto-pilot-status-data="liveAutoPilotStatus"
      />
      <PlatformInsightsWidget
        :charts-data="chartsData"
        :is-loading="isLoading"
        :service-kind="serviceKind"
      />
    </div>
    <div class="service-insights-tab__side">
      <TotalDataAssetsWidget :is-loading="isLoading" :total-assets-count="totalAssetsCount" />
    </div>
  </div>
</template>

<style scoped>
.service-insights-tab {
  display: grid;
  grid-template-columns: 3fr 1fr;
  gap: 16px;
}

.service-insights-tab__main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.service-insights-tab__side {
  min-width: 0;
}
</style>
