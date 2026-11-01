<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  Space,
  Spin,
  Table,
  Tooltip,
  Typography,
} from 'ant-design-vue';
import { fetchEntityLineage, putEntityLineage } from '@/api/lineage';
import { assetLocation, isDetailWired, lineageLocation } from '@/catalog/entityRoutes';
import { highlightForColumn } from '@/lineage/columnPorts';
import {
  clampLineageDepth,
  LINEAGE_DEPTH_DEFAULT,
  LINEAGE_DEPTH_MAX,
  LINEAGE_DEPTH_MIN,
} from '@/lineage/depth';
import {
  isLineageEmpty,
  mapEntityLineage,
  type LineageGraphModel,
  type LineageGraphNode,
} from '@/lineage/graphModel';
import type { LineageCanvasConfig } from '@/lineage/config';
import { useLineageStore } from '@/stores/lineage';
import { useShellConfigStore } from '@/stores/shellConfig';
import DetailTabs from '@/components/shared/DetailTabs.vue';
import SmTable from '@/components/shared/SmTable.vue';
import LineageConfigModal from './LineageConfigModal.vue';
import LineageExportPanel from './LineageExportPanel.vue';
import LineageGraph from './LineageGraph.vue';
import LineageImpactPanel from './LineageImpactPanel.vue';
import LineageTimeFilter from './LineageTimeFilter.vue';

const props = withDefaults(
  defineProps<{
    entityType: string;
    fqn: string;
    variant?: 'page' | 'tab';
  }>(),
  { variant: 'page' },
);

const router = useRouter();
const { t } = useI18n();
const loading = ref(false);
const writing = ref(false);
const errorMessage = ref('');
const graph = ref<LineageGraphModel | null>(null);
const upstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);
const downstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);
const highlightedColumnFqns = ref<string[]>([]);
const highlightedNodeIds = ref<string[]>([]);
const highlightedEdgeIds = ref<string[]>([]);

const center = computed(() => graph.value?.nodes.find((node) => node.isCenter));
const empty = computed(() => (graph.value ? isLineageEmpty(graph.value) : false));

const lineageStore = useLineageStore();
const shellConfig = useShellConfigStore();
const configModalOpen = ref(false);
const activeView = ref('diagram');

const viewTabs = computed(() => [
  { key: 'diagram', label: t('lineage.viewDiagram') },
  { key: 'table', label: t('lineage.viewTable') },
  { key: 'impact', label: t('lineage.viewImpact') },
]);

const edgeRows = computed(() =>
  (graph.value?.edges ?? []).map((edge) => {
    const from = graph.value?.nodes.find((node) => node.id === edge.source);
    const to = graph.value?.nodes.find((node) => node.id === edge.target);
    return {
      key: edge.id,
      fromEntity: from?.displayName || from?.name || edge.source,
      toEntity: to?.displayName || to?.name || edge.target,
      pipelineName: edge.pipelineName || '',
      source: edge.sourceKind || '',
    };
  }),
);

const edgeColumns = computed(() => [
  { title: t('lineage.edgeFrom'), dataIndex: 'fromEntity', key: 'fromEntity' },
  { title: t('lineage.edgeTo'), dataIndex: 'toEntity', key: 'toEntity' },
  { title: t('lineage.edgePipeline'), dataIndex: 'pipelineName', key: 'pipelineName' },
  { title: t('lineage.edgeSource'), dataIndex: 'source', key: 'source' },
]);

function applyShellDefaults(): void {
  const settings = shellConfig.lineageSettings;
  if (!settings) {
    return;
  }
  lineageStore.applyDefaults({
    upstreamDepth: settings.upstreamDepth,
    downstreamDepth: settings.downstreamDepth,
    layer: settings.lineageLayer,
    pipelineViewMode: settings.pipelineViewMode,
  });
  upstreamDepth.value = lineageStore.config.upstreamDepth;
  downstreamDepth.value = lineageStore.config.downstreamDepth;
}

function onConfigSave(next: LineageCanvasConfig): void {
  configModalOpen.value = false;
  lineageStore.update(next);
  upstreamDepth.value = lineageStore.config.upstreamDepth;
  downstreamDepth.value = lineageStore.config.downstreamDepth;
}

watch(
  () => shellConfig.lineageSettings,
  () => applyShellDefaults(),
  { immediate: true },
);

const columnColumns = computed(() => [
  { title: t('lineage.fromColumns'), dataIndex: 'fromColumns', key: 'fromColumns' },
  { title: t('lineage.toColumn'), dataIndex: 'toColumn', key: 'toColumn' },
  { title: t('lineage.function'), dataIndex: 'function', key: 'function', width: 160 },
]);


function clearHighlight(): void {
  highlightedColumnFqns.value = [];
  highlightedNodeIds.value = [];
  highlightedEdgeIds.value = [];
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  graph.value = null;
  clearHighlight();
  try {
    const payload = await fetchEntityLineage({
      entityType: props.entityType,
      fqn: props.fqn,
      upstreamDepth: upstreamDepth.value,
      downstreamDepth: downstreamDepth.value,
    });
    graph.value = mapEntityLineage(payload);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('lineage.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openAsset(node: LineageGraphNode): void {
  if (!node.entityType || !node.fullyQualifiedName) {
    return;
  }
  void router.push(assetLocation(node.entityType, node.fullyQualifiedName));
}

function openCenterDetail(): void {
  void router.push(assetLocation(props.entityType, props.fqn));
}

function openFullPage(): void {
  void router.push(lineageLocation(props.entityType, props.fqn));
}

async function onConnectEdge(payload: { from: LineageGraphNode; to: LineageGraphNode }): Promise<void> {
  writing.value = true;
  errorMessage.value = '';
  try {
    await putEntityLineage({
      fromType: payload.from.entityType,
      fromFqn: payload.from.fullyQualifiedName,
      toType: payload.to.entityType,
      toFqn: payload.to.fullyQualifiedName,
    });
    await load();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('lineage.writeFailed');
  } finally {
    writing.value = false;
  }
}

function bumpDepth(side: 'upstream' | 'downstream', delta: number): void {
  if (side === 'upstream') {
    upstreamDepth.value = clampLineageDepth(upstreamDepth.value + delta);
    return;
  }
  downstreamDepth.value = clampLineageDepth(downstreamDepth.value + delta);
}

function highlightRow(row: { fromColumns: string; toColumn: string }): void {
  if (!graph.value) {
    return;
  }
  const columnFqn = row.toColumn || row.fromColumns.split(',')[0]?.trim() || '';
  const next = highlightForColumn(graph.value, columnFqn);
  highlightedColumnFqns.value = [columnFqn, ...row.fromColumns.split(',').map((item) => item.trim()).filter(Boolean)];
  highlightedNodeIds.value = next.nodeIds;
  highlightedEdgeIds.value = next.edgeIds;
}

watch(
  () => [props.entityType, props.fqn, upstreamDepth.value, downstreamDepth.value],
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <Spin :spinning="loading || writing">
    <Space direction="vertical" size="middle" class="lineage-canvas">
      <div v-if="variant === 'page'">
        <Typography.Title :level="4">{{ t('lineage.title') }}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {{ t('lineage.graphLead', { type: entityType, fqn }) }}
        </Typography.Paragraph>
      </div>
      <Typography.Paragraph v-else type="secondary">
        {{ t('lineage.tabLead', { type: entityType, fqn }) }}
      </Typography.Paragraph>
      <Space wrap align="center">
        <slot name="search" />
        <Tooltip :title="t('lineage.depthHelp')" placement="top">
          <span>{{ t('lineage.upstreamDepth') }}</span>
        </Tooltip>
        <Tooltip :title="t('lineage.depthDecHelp')">
          <Button data-testid="upstream-depth-dec" :aria-label="t('lineage.depthDecHelp')" @click="bumpDepth('upstream', -1)">−</Button>
        </Tooltip>
        <InputNumber
          v-model:value="upstreamDepth"
          data-testid="upstream-depth"
          :min="LINEAGE_DEPTH_MIN"
          :max="LINEAGE_DEPTH_MAX"
        />
        <Tooltip :title="t('lineage.depthIncHelp')">
          <Button data-testid="upstream-depth-inc" :aria-label="t('lineage.depthIncHelp')" @click="bumpDepth('upstream', 1)">+</Button>
        </Tooltip>
        <Tooltip :title="t('lineage.depthHelp')" placement="top">
          <span>{{ t('lineage.downstreamDepth') }}</span>
        </Tooltip>
        <Tooltip :title="t('lineage.depthDecHelp')">
          <Button data-testid="downstream-depth-dec" :aria-label="t('lineage.depthDecHelp')" @click="bumpDepth('downstream', -1)">−</Button>
        </Tooltip>
        <InputNumber
          v-model:value="downstreamDepth"
          data-testid="downstream-depth"
          :min="LINEAGE_DEPTH_MIN"
          :max="LINEAGE_DEPTH_MAX"
        />
        <Tooltip :title="t('lineage.depthIncHelp')">
          <Button data-testid="downstream-depth-inc" :aria-label="t('lineage.depthIncHelp')" @click="bumpDepth('downstream', 1)">+</Button>
        </Tooltip>
        <Tooltip :title="t('lineage.reloadHelp')">
          <Button data-testid="lineage-reload" :aria-label="t('lineage.reloadHelp')" @click="load">{{ t('lineage.reload') }}</Button>
        </Tooltip>
        <Button data-testid="lineage-config-open" @click="configModalOpen = true">
          {{ t('lineage.config') }}
        </Button>
        <Button
          v-if="variant === 'page'"
          data-testid="lineage-open-asset"
          type="link"
          @click="openCenterDetail"
        >
          {{ t('lineage.openAsset') }}
        </Button>
        <Button
          v-else
          data-testid="lineage-open-full-page"
          type="link"
          @click="openFullPage"
        >
          {{ t('lineage.openFullPage') }}
        </Button>
      </Space>
      <LineageTimeFilter
        :value="lineageStore.config.timePreset"
        @change="(preset) => lineageStore.update({ timePreset: preset })"
      />
      <DetailTabs
        :tabs="viewTabs"
        :active-key="activeView"
        test-id="lineage-view-tabs"
        @change="(key) => { activeView = key; }"
      />
      <LineageExportPanel
        :model="graph"
        :entity-type="entityType"
        :fqn="fqn"
      />
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Alert
        v-else-if="!isDetailWired(entityType)"
        type="info"
        show-icon
        :message="t('lineage.unwired')"
      />
      <Empty
        v-if="!loading && !errorMessage && empty"
        data-testid="lineage-empty"
        :description="t('lineage.emptyGraph')"
      />
      <template v-if="activeView === 'diagram'">
        <LineageGraph
          v-if="graph && !empty && !errorMessage"
          :model="graph"
          :variant="variant"
          :highlighted-column-fqns="highlightedColumnFqns"
          :highlighted-node-ids="highlightedNodeIds"
          :highlighted-edge-ids="highlightedEdgeIds"
          :force-column-edges="lineageStore.config.layer === 'ColumnLevelLineage'"
          :pipeline-view-mode="lineageStore.config.pipelineViewMode"
          @navigate="openAsset"
          @connect="onConnectEdge"
        />
        <template v-if="graph?.hasColumnLineage">
          <Typography.Title :level="5">{{ t('lineage.columnsTitle') }}</Typography.Title>
          <Typography.Paragraph type="secondary">{{ t('lineage.columnsLead') }}</Typography.Paragraph>
          <Table
            row-key="key"
            size="small"
            :pagination="false"
            :columns="columnColumns"
            :data-source="
              graph.columnMappings.map((row, index) => ({
                ...row,
                key: `${row.fromColumns.join(',')}→${row.toColumn}:${index}`,
                fromColumns: row.fromColumns.join(', '),
              }))
            "
            data-testid="column-lineage-table"
            :custom-row="
              (row: { fromColumns: string; toColumn: string }) => ({
                onClick: () => highlightRow(row),
              })
            "
          />
        </template>
      </template>
      <template v-else-if="activeView === 'table'">
        <Typography.Title :level="5">{{ t('lineage.edgeTableTitle') }}</Typography.Title>
        <SmTable
          test-id="lineage-edge-table"
          :columns="edgeColumns"
          :data-source="edgeRows"
          row-key="key"
        />
      </template>
      <LineageImpactPanel v-else :model="graph" />
      <LineageConfigModal
        :open="configModalOpen"
        :config="lineageStore.config"
        @ok="onConfigSave"
        @cancel="configModalOpen = false"
      />
      <Typography.Text v-if="center" type="secondary">
        {{ t('lineage.focus', { name: center.displayName || center.name }) }}
      </Typography.Text>
    </Space>
  </Spin>
</template>

<style scoped>
.lineage-canvas {
  width: 100%;
}
</style>
