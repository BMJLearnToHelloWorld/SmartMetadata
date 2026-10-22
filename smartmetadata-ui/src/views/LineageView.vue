<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Empty,
  InputNumber,
  Space,
  Spin,
  Table,
  Typography,
} from 'ant-design-vue';
import { fetchEntityLineage } from '@/api/lineage';
import LineageGraph from '@/components/lineage/LineageGraph.vue';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import {
  clampLineageDepth,
  LINEAGE_DEPTH_DEFAULT,
  LINEAGE_DEPTH_MAX,
  LINEAGE_DEPTH_MIN,
} from '@/lineage/depth';
import {
  isLineageEmpty,
  layoutLineageGraph,
  mapEntityLineage,
  type LineageGraphNode,
  type PositionedLineageGraph,
} from '@/lineage/graphModel';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const graph = ref<PositionedLineageGraph | null>(null);
const upstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);
const downstreamDepth = ref(LINEAGE_DEPTH_DEFAULT);

const center = computed(() => graph.value?.nodes.find((node) => node.isCenter));
const empty = computed(() => (graph.value ? isLineageEmpty(graph.value) : false));

const columnColumns = [
  { title: 'From columns', dataIndex: 'fromColumns', key: 'fromColumns' },
  { title: 'To column', dataIndex: 'toColumn', key: 'toColumn' },
  { title: 'Function', dataIndex: 'function', key: 'function', width: 160 },
];

function columnRowKey(row: { fromColumns?: string; toColumn?: string }, index: number): string {
  return `${row.fromColumns ?? ''}→${row.toColumn ?? ''}:${index}`;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  graph.value = null;
  try {
    const payload = await fetchEntityLineage({
      entityType: props.entityType,
      fqn: props.fqn,
      upstreamDepth: upstreamDepth.value,
      downstreamDepth: downstreamDepth.value,
    });
    graph.value = layoutLineageGraph(mapEntityLineage(payload));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load lineage';
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

function bumpDepth(side: 'upstream' | 'downstream', delta: number): void {
  if (side === 'upstream') {
    upstreamDepth.value = clampLineageDepth(upstreamDepth.value + delta);
    return;
  }
  downstreamDepth.value = clampLineageDepth(downstreamDepth.value + delta);
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
    <Card>
      <Space direction="vertical" size="middle" class="lineage__stack">
        <div>
          <Typography.Title :level="4">Lineage</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/lineage/{{ entityType }}/name/{fqn} · {{ fqn }}
          </Typography.Paragraph>
        </div>
        <Space wrap align="center">
          <span>Upstream depth</span>
          <Button data-testid="upstream-depth-dec" @click="bumpDepth('upstream', -1)">−</Button>
          <InputNumber
            v-model:value="upstreamDepth"
            data-testid="upstream-depth"
            :min="LINEAGE_DEPTH_MIN"
            :max="LINEAGE_DEPTH_MAX"
          />
          <Button data-testid="upstream-depth-inc" @click="bumpDepth('upstream', 1)">+</Button>
          <span>Downstream depth</span>
          <Button data-testid="downstream-depth-dec" @click="bumpDepth('downstream', -1)">−</Button>
          <InputNumber
            v-model:value="downstreamDepth"
            data-testid="downstream-depth"
            :min="LINEAGE_DEPTH_MIN"
            :max="LINEAGE_DEPTH_MAX"
          />
          <Button data-testid="downstream-depth-inc" @click="bumpDepth('downstream', 1)">+</Button>
          <Button data-testid="lineage-reload" @click="load">Reload</Button>
          <Button data-testid="lineage-open-asset" type="link" @click="openCenterDetail">
            Open asset detail
          </Button>
        </Space>
        <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
        <Alert
          v-else-if="!isDetailWired(entityType)"
          type="info"
          show-icon
          message="This entity type has no dedicated detail page yet. Node clicks navigate only when type and FQN are present."
        />
        <Empty
          v-if="!loading && !errorMessage && empty"
          description="No upstream or downstream lineage at this depth"
        />
        <LineageGraph v-if="graph && !empty && !errorMessage" :model="graph" @navigate="openAsset" />
        <template v-if="graph?.hasColumnLineage">
          <Typography.Title :level="5">Column mappings</Typography.Title>
          <Typography.Paragraph type="secondary">
            Shown as the API returned them on edge lineageDetails.columnsLineage. This page does not
            invent a nested column graph.
          </Typography.Paragraph>
          <Table
            :row-key="columnRowKey"
            size="small"
            :pagination="false"
            :columns="columnColumns"
            :data-source="graph.columnMappings.map((row) => ({ ...row, fromColumns: row.fromColumns.join(', ') }))"
            data-testid="column-lineage-table"
          />
        </template>
        <Typography.Text v-if="center" type="secondary">
          Focus: {{ center.displayName || center.name }}
        </Typography.Text>
      </Space>
    </Card>
  </Spin>
</template>

<style scoped>
.lineage__stack {
  width: 100%;
}
</style>
