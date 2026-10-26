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
import { fetchEntityLineage } from '@/api/lineage';
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
import LineageGraph from './LineageGraph.vue';

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
const errorMessage = ref('');
const graph = ref<LineageGraphModel | null>(null);
const upstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);
const downstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);
const highlightedColumnFqns = ref<string[]>([]);
const highlightedNodeIds = ref<string[]>([]);
const highlightedEdgeIds = ref<string[]>([]);

const center = computed(() => graph.value?.nodes.find((node) => node.isCenter));
const empty = computed(() => (graph.value ? isLineageEmpty(graph.value) : false));

const columnColumns = computed(() => [
  { title: t('lineage.fromColumns'), dataIndex: 'fromColumns', key: 'fromColumns' },
  { title: t('lineage.toColumn'), dataIndex: 'toColumn', key: 'toColumn' },
  { title: t('lineage.function'), dataIndex: 'function', key: 'function', width: 160 },
]);

function columnRowKey(row: { fromColumns?: string; toColumn?: string }, index: number): string {
  return `${row.fromColumns ?? ''}→${row.toColumn ?? ''}:${index}`;
}

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
  <Spin :spinning="loading">
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
        <Button data-testid="upstream-depth-dec" @click="bumpDepth('upstream', -1)">−</Button>
        <InputNumber
          v-model:value="upstreamDepth"
          data-testid="upstream-depth"
          :min="LINEAGE_DEPTH_MIN"
          :max="LINEAGE_DEPTH_MAX"
        />
        <Button data-testid="upstream-depth-inc" @click="bumpDepth('upstream', 1)">+</Button>
        <Tooltip :title="t('lineage.depthHelp')" placement="top">
          <span>{{ t('lineage.downstreamDepth') }}</span>
        </Tooltip>
        <Button data-testid="downstream-depth-dec" @click="bumpDepth('downstream', -1)">−</Button>
        <InputNumber
          v-model:value="downstreamDepth"
          data-testid="downstream-depth"
          :min="LINEAGE_DEPTH_MIN"
          :max="LINEAGE_DEPTH_MAX"
        />
        <Button data-testid="downstream-depth-inc" @click="bumpDepth('downstream', 1)">+</Button>
        <Button data-testid="lineage-reload" @click="load">{{ t('lineage.reload') }}</Button>
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
      <LineageGraph
        v-if="graph && !empty && !errorMessage"
        :model="graph"
        :variant="variant"
        :highlighted-column-fqns="highlightedColumnFqns"
        :highlighted-node-ids="highlightedNodeIds"
        :highlighted-edge-ids="highlightedEdgeIds"
        @navigate="openAsset"
      />
      <template v-if="graph?.hasColumnLineage">
        <Typography.Title :level="5">{{ t('lineage.columnsTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('lineage.columnsLead') }}</Typography.Paragraph>
        <Table
          :row-key="columnRowKey"
          size="small"
          :pagination="false"
          :columns="columnColumns"
          :data-source="
            graph.columnMappings.map((row) => ({
              ...row,
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
