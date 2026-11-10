<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Space, Typography } from 'ant-design-vue';
import { ASSET_RELATION_TYPE, NATIVE_INFERRED_RELATION_TYPE, NATIVE_LINEAGE_RELATION_TYPE } from '@/types/ontologyDataGraph';
import type { OntologyGraphData, OntologyGraphNode } from './ontologyGraph';

/**
 * Data-mode card renderer (official components/OntologyExplorer/OntologyDataGraph.tsx).
 * Card-based — it does NOT import G6. Clusters render as cards with asset
 * rows and lineage chips; concept clicks select, asset clicks navigate
 * (both via `select-node`; the parent decides), load-more affordances
 * page assets and terms, and the legend names the edge families.
 *
 * Scoped port (ADR:2026-11-10-g18-stage2-data-mode): pin's
 * renderer is a measured-position canvas (dataGraphLayout: card positions,
 * drag-to-move, zoom/pan, row windows). This port renders the same cards
 * in a vertical flow and draws the lineage connectors in an SVG overlay
 * positioned from measured DOM rects (ResizeObserver). The connector SET
 * is a pure computed from the graph data + collapsed state — the same
 * collapse rule pin's renderer applies: a lineage edge joins its two rows
 * while both rows are rendered, otherwise it joins the cards, one shared
 * connector per card pair.
 *
 * Collapsed preview: 3 assets (glossary) / 4 (native); native rows scroll
 * (max-h 256) once expanded.
 */
export interface DataGraphLineageConnector {
  id: string;
  fromCardId: string;
  toCardId: string;
  fromRowId?: string;
  toRowId?: string;
  label: string;
}

const props = defineProps<{
  data: OntologyGraphData;
  glossaryColorMap?: Record<string, string>;
  hasMoreTerms?: boolean;
  isLoadingMoreTerms?: boolean;
  limitMessage?: string;
  relationTypes?: string[];
  selectedNodeId?: string | null;
  variant?: 'glossary' | 'native';
}>();

const emit = defineEmits<{
  (event: 'load-more', termId: string): void;
  (event: 'load-more-terms'): void;
  (event: 'pane-click'): void;
  (event: 'select-node', nodeId: string): void;
}>();

const { t } = useI18n();
const container = ref<HTMLDivElement | null>(null);
const expandedCards = ref<Set<string>>(new Set());
const connectorLines = ref<Array<{ id: string; x1: number; y1: number; x2: number; y2: number; label: string }>>([]);
let resizeObserver: ResizeObserver | null = null;

const previewSize = computed(() => (props.variant === 'native' ? 4 : 3));

interface DataCluster {
  seed: OntologyGraphNode;
  assets: OntologyGraphNode[];
  assetEdges: Array<{ assetId: string; edgeId: string }>;
}

const clusters = computed<DataCluster[]>(() => {
  const seeds = props.data.nodes.filter(
    (node) => node.type === 'ontologyConcept' || node.type === 'glossaryTerm',
  );
  const assetById = new Map(props.data.nodes.filter((node) => node.type === 'dataAsset').map((node) => [node.id, node]));
  return seeds.map((seed) => {
    const assets: OntologyGraphNode[] = [];
    const assetEdges: Array<{ assetId: string; edgeId: string }> = [];
    for (const edge of props.data.edges) {
      // Tagged-with edges (glossary) run asset -> term; binding edges
      // (native) run concept -> asset. Both name the same relation.
      if (edge.relationType !== ASSET_RELATION_TYPE) {
        continue;
      }
      if (edge.target === seed.id && assetById.has(edge.source)) {
        assets.push(assetById.get(edge.source) as OntologyGraphNode);
        assetEdges.push({ assetId: edge.source, edgeId: edge.id });
      } else if (edge.source === seed.id && assetById.has(edge.target)) {
        assets.push(assetById.get(edge.target) as OntologyGraphNode);
        assetEdges.push({ assetId: edge.target, edgeId: edge.id });
      }
    }
    return { seed, assets, assetEdges };
  });
});

const clusterByNodeId = computed(() => {
  const map = new Map<string, string>();
  clusters.value.forEach((cluster) => {
    map.set(cluster.seed.id, cluster.seed.id);
    cluster.assets.forEach((asset) => map.set(asset.id, cluster.seed.id));
  });
  return map;
});

function isRowRendered(cluster: DataCluster, assetId: string): boolean {
  if (expandedCards.value.has(cluster.seed.id)) {
    return true;
  }
  const index = cluster.assets.findIndex((asset) => asset.id === assetId);
  return index >= 0 && index < previewSize.value;
}

function visibleAssets(cluster: DataCluster): OntologyGraphNode[] {
  if (expandedCards.value.has(cluster.seed.id)) {
    return cluster.assets;
  }
  return cluster.assets.slice(0, previewSize.value);
}

/** Pure connector set: rows when both rows render, else cards (one per pair). */
const lineageConnectors = computed<DataGraphLineageConnector[]>(() => {
  const connectors: DataGraphLineageConnector[] = [];
  const cardPairs = new Set<string>();
  const clusterById = new Map(clusters.value.map((cluster) => [cluster.seed.id, cluster]));
  for (const edge of props.data.edges) {
    if (edge.relationType !== NATIVE_LINEAGE_RELATION_TYPE || !edge.lineage) {
      continue;
    }
    const fromCardId = clusterByNodeId.value.get(edge.lineage.from.nodeId);
    const toCardId = clusterByNodeId.value.get(edge.lineage.to.nodeId);
    if (!fromCardId || !toCardId || fromCardId === toCardId) {
      continue;
    }
    const fromCluster = clusterById.get(fromCardId);
    const toCluster = clusterById.get(toCardId);
    const bothRowsRendered =
      fromCluster !== undefined &&
      toCluster !== undefined &&
      isRowRendered(fromCluster, edge.lineage.from.nodeId) &&
      isRowRendered(toCluster, edge.lineage.to.nodeId);
    if (bothRowsRendered) {
      connectors.push({
        id: edge.id,
        fromCardId,
        toCardId,
        fromRowId: edge.lineage.from.nodeId,
        toRowId: edge.lineage.to.nodeId,
        label: edge.label ?? t('ontology.browser.lineage'),
      });
      continue;
    }
    const pairKey = `${fromCardId}|${toCardId}`;
    if (cardPairs.has(pairKey)) {
      continue;
    }
    cardPairs.add(pairKey);
    connectors.push({
      id: `card:${pairKey}`,
      fromCardId,
      toCardId,
      label: edge.label ?? t('ontology.browser.lineage'),
    });
  }
  return connectors;
});

const legendEntries = computed<string[]>(() => {
  if (props.variant === 'native') {
    return [NATIVE_INFERRED_RELATION_TYPE, NATIVE_LINEAGE_RELATION_TYPE];
  }
  const types = new Set(props.relationTypes ?? []);
  props.data.edges.forEach((edge) => {
    if (edge.relationType !== ASSET_RELATION_TYPE) {
      types.add(edge.relationType);
    }
  });
  return [...types];
});

function measureConnectors(): void {
  const root = container.value;
  if (!root) {
    return;
  }
  const rootRect = root.getBoundingClientRect();
  const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; label: string }> = [];
  for (const connector of lineageConnectors.value) {
    const fromEl =
      (connector.fromRowId
        ? root.querySelector(`[data-row-id="${connector.fromRowId}"]`)
        : null) ?? root.querySelector(`[data-card-id="${connector.fromCardId}"]`);
    const toEl =
      (connector.toRowId ? root.querySelector(`[data-row-id="${connector.toRowId}"]`) : null) ??
      root.querySelector(`[data-card-id="${connector.toCardId}"]`);
    if (!fromEl || !toEl) {
      continue;
    }
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    lines.push({
      id: connector.id,
      x1: fromRect.right - rootRect.left,
      y1: fromRect.top + fromRect.height / 2 - rootRect.top,
      x2: toRect.left - rootRect.left,
      y2: toRect.top + toRect.height / 2 - rootRect.top,
      label: connector.label,
    });
  }
  connectorLines.value = lines;
}

function scheduleMeasure(): void {
  void nextTick(() => measureConnectors());
}

onMounted(() => {
  scheduleMeasure();
  if (typeof ResizeObserver !== 'undefined' && container.value) {
    resizeObserver = new ResizeObserver(() => measureConnectors());
    resizeObserver.observe(container.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch([lineageConnectors, expandedCards], () => scheduleMeasure(), { deep: true });
watch(
  () => props.data,
  () => scheduleMeasure(),
  { deep: true },
);

function toggleCard(seedId: string): void {
  const next = new Set(expandedCards.value);
  if (next.has(seedId)) {
    next.delete(seedId);
  } else {
    next.add(seedId);
  }
  expandedCards.value = next;
}

function clusterColor(seed: OntologyGraphNode): string | undefined {
  if (!seed.glossaryId || !props.glossaryColorMap) {
    return undefined;
  }
  return props.glossaryColorMap[seed.glossaryId];
}
</script>

<template>
  <div
    ref="container"
    data-testid="ontology-data-graph"
    style="position: relative"
    @click.self="emit('pane-click')"
  >
    <Space v-if="legendEntries.length > 0" data-testid="ontology-data-graph-legend" style="margin-bottom: 12px">
      <Typography.Text
        v-for="entry in legendEntries"
        :key="entry"
        type="secondary"
        data-testid="ontology-data-graph-legend-entry"
      >
        {{ entry }}
      </Typography.Text>
    </Space>
    <Typography.Text v-if="limitMessage" type="warning" data-testid="ontology-data-graph-limit" style="display: block; margin-bottom: 12px">
      {{ limitMessage }}
    </Typography.Text>
    <svg
      v-if="connectorLines.length > 0"
      data-testid="ontology-data-graph-lineage-overlay"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none"
    >
      <line
        v-for="line in connectorLines"
        :key="line.id"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke="#005587"
        stroke-width="1"
        :data-testid="`ontology-data-lineage-edge-${line.id}`"
      />
    </svg>
    <Space direction="vertical" style="width: 100%">
      <Card
        v-for="cluster in clusters"
        :key="cluster.seed.id"
        :data-card-id="cluster.seed.id"
        :data-testid="`ontology-data-cluster-${cluster.seed.id}`"
        :style="{
          borderLeft: clusterColor(cluster.seed) ? `4px solid ${clusterColor(cluster.seed)}` : undefined,
        }"
      >
        <Space direction="vertical" style="width: 100%">
          <Space style="justify-content: space-between; width: 100%">
            <a
              href="#"
              :data-testid="`ontology-data-cluster-select-${cluster.seed.id}`"
              @click.prevent="emit('select-node', cluster.seed.id)"
            >
              <Typography.Text strong>{{ cluster.seed.label }}</Typography.Text>
            </a>
            <Typography.Text type="secondary">
              {{ cluster.seed.assetCount ?? cluster.assets.length }}
              {{ t('ontology.browser.dataAssets') }}
            </Typography.Text>
            <Typography.Text v-if="cluster.seed.isLoadingAssets" type="secondary">
              {{ t('crud.loading') }}
            </Typography.Text>
          </Space>
          <div
            :style="
              variant === 'native' && expandedCards.has(cluster.seed.id)
                ? { maxHeight: '256px', overflow: 'auto' }
                : undefined
            "
          >
            <div
              v-for="asset in visibleAssets(cluster)"
              :key="asset.id"
              :data-row-id="asset.id"
              :data-testid="`ontology-data-asset-${asset.id}`"
              style="display: flex; gap: 8px; align-items: center; padding: 4px 0"
            >
              <a href="#" @click.prevent="emit('select-node', asset.id)">
                {{ asset.label }}
              </a>
              <Typography.Text v-if="asset.serviceLabel" type="secondary">
                {{ asset.serviceLabel }}
              </Typography.Text>
              <Typography.Text v-if="asset.columnCount !== undefined" type="secondary">
                {{ asset.columnCount }} {{ t('ontology.concepts.bindingColumns') }}
              </Typography.Text>
              <span v-if="asset.lineageNotes?.length">
                <Typography.Text
                  v-for="(note, index) in asset.lineageNotes"
                  :key="`${note.direction}:${note.label}:${index}`"
                  type="secondary"
                  data-testid="ontology-data-lineage-chip"
                >
                  {{ note.direction === 'downstream' ? '↓' : '↑' }} {{ note.label }}
                </Typography.Text>
              </span>
            </div>
          </div>
          <Space>
            <Button
              v-if="cluster.assets.length > previewSize"
              size="small"
              :data-testid="`ontology-data-cluster-toggle-${cluster.seed.id}`"
              @click="toggleCard(cluster.seed.id)"
            >
              {{
                expandedCards.has(cluster.seed.id)
                  ? t('ontology.browser.dataShowLess')
                  : t('ontology.browser.dataShowMore', { count: cluster.assets.length - previewSize })
              }}
            </Button>
            <Button
              v-if="(cluster.seed.loadedAssetCount ?? 0) < (cluster.seed.assetCount ?? 0)"
              size="small"
              :loading="cluster.seed.isLoadingAssets"
              :data-testid="`ontology-data-load-more-${cluster.seed.id}`"
              @click="emit('load-more', cluster.seed.id)"
            >
              {{ t('ontology.loadMore') }}
            </Button>
          </Space>
        </Space>
      </Card>
    </Space>
    <div v-if="hasMoreTerms" style="margin-top: 12px">
      <Button
        :loading="isLoadingMoreTerms"
        data-testid="ontology-data-load-more-terms"
        @click="emit('load-more-terms')"
      >
        {{ t('ontology.loadMore') }}
      </Button>
    </div>
    <Typography.Text
      v-if="clusters.length === 0"
      type="secondary"
      data-testid="ontology-data-graph-empty"
      style="display: block"
    >
      {{ t('ontology.browser.dataEmpty') }}
    </Typography.Text>
  </div>
</template>
