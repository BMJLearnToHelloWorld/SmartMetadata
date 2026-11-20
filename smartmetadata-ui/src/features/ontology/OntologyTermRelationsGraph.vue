<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Empty, Input, Space, Typography, message } from 'ant-design-vue';
import {
  DownloadOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons-vue';
import { getGlossaryTermAssets } from '@/api/glossaryTerms';
import type { OntologyGraphData } from '@/features/ontology/ontologyGraph';
import type { OntologyGraphSettings } from '@/types/ontologyDataGraph';
import {
  DATA_MODE_ASSET_LOAD_PAGE_SIZE,
  DATA_MODE_MAX_RENDER_COUNT,
  DEFAULT_ONTOLOGY_GRAPH_SETTINGS,
} from '@/types/ontologyDataGraph';
import { computeOntologySearchHighlight } from '@/features/ontology/ontologySearchHighlight';
import type { SearchHighlightGroup } from '@/features/ontology/ontologySearchHighlight';
import GraphSettingsPanel from '@/features/ontology/GraphSettingsPanel.vue';
import OntologyDataGraph from '@/features/ontology/OntologyDataGraph.vue';
import OntologyGraphCanvas from '@/features/ontology/OntologyGraphCanvas.vue';
import OntologyGraphModeTabs from '@/features/ontology/OntologyGraphModeTabs.vue';
import {
  appendTermAssets,
  applyTermAssetCounts,
  fetchTermRelationsGraphData,
  filterTermNeighbourhood,
  termAssetPageSize,
} from '@/features/ontology/termRelationsGraph';

/**
 * Term-scope relations graph (official OntologyExplorer scope='term',
 * GlossaryTermUtils.tsx buildRelationsGraphTab: <OntologyExplorer
 * height="100%" scope="term" />). Term-subset toolbar only — pin
 * renderTermScopeToolbar: model/data mode tabs + in-graph search +
 * export (PNG/SVG) + graph settings + zoom/fit/refresh controls.
 * Deliberately NOT included: the global FilterToolbar (no relation
 * filter in the term toolbar), the tree surface, health panel,
 * authoring/AI panels, and the RDF exports (Turtle/RDF/JSON-LD need
 * an RDF-enabled server; the product has no such path).
 *
 * Load is deferred until `active` (the tab is selected): pin's tab
 * children only mount on activation, while this view force-renders
 * every tab pane, so an eager load would fetch the whole glossary
 * graph on every term page visit.
 *
 * Data mode is lazy like pin (useOntologyExplorer.ts
 * loadAssetsForDataMode): entering data mode only takes the asset
 * counts and shows the term cards — no asset is fetched until the
 * user expands a term via its load-more affordance, which pages in
 * that term's assets (onLoadMoreAssets, fromOffset 0 on the first
 * page). A per-term expand failure toasts, like pin's
 * appendTermAssetsForTerm catch.
 */
const props = withDefaults(
  defineProps<{
    scope: 'term';
    entityId: string;
    glossaryId?: string;
    glossaryFqn?: string;
    height?: string | number;
    active?: boolean;
  }>(),
  {
    active: false,
    height: '100%',
  },
);

const { t } = useI18n();
const router = useRouter();

const loading = ref(false);
const loadError = ref('');
const fullGraph = ref<OntologyGraphData | null>(null);
const assetCounts = ref<Record<string, number>>({});
const graphMode = ref<'model' | 'data'>('model');
const searchQuery = ref('');
const graphSettings = ref<OntologyGraphSettings>({ ...DEFAULT_ONTOLOGY_GRAPH_SETTINGS });
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const dataGraph = ref<OntologyGraphData | null>(null);
const dataModeLoading = ref(false);
const loadingTermIds = ref(new Set<string>());
const loadedOnce = ref(false);
const dataLoadedOnce = ref(false);
let loadToken = 0;
const assetControllers = new Map<string, AbortController>();
const canvasRef = ref<InstanceType<typeof OntologyGraphCanvas> | null>(null);

/** One-hop neighbourhood of the focal term, with asset counts applied. */
const visibleGraph = computed<OntologyGraphData | null>(() => {
  if (!fullGraph.value) {
    return null;
  }
  const neighbourhood = filterTermNeighbourhood(fullGraph.value, props.entityId);
  return { ...neighbourhood, nodes: applyTermAssetCounts(neighbourhood.nodes, assetCounts.value) };
});

const highlightGroups = computed<SearchHighlightGroup[]>(() =>
  props.glossaryId
    ? [
        {
          fullyQualifiedName: props.glossaryFqn,
          id: props.glossaryId,
          name: props.glossaryFqn ?? props.glossaryId,
        },
      ]
    : [],
);

/** The graph currently on screen: the data graph in data mode, the model graph otherwise. */
const displayGraph = computed<OntologyGraphData | null>(() =>
  graphMode.value === 'data' ? dataGraph.value ?? visibleGraph.value : visibleGraph.value,
);

const highlight = computed(() =>
  displayGraph.value
    ? computeOntologySearchHighlight(
        displayGraph.value.nodes,
        displayGraph.value.edges,
        searchQuery.value,
        highlightGroups.value,
      )
    : null,
);

const searchNoHit = computed(
  () =>
    searchQuery.value.trim().length > 0 &&
    highlight.value !== null &&
    highlight.value.highlightedNodeIds.length === 0,
);

const isEmpty = computed(
  () => fullGraph.value !== null && (visibleGraph.value?.nodes.length ?? 0) === 0,
);

const statsLabel = computed(() =>
  visibleGraph.value
    ? t('ontology.browser.statsTermsRelations', {
        relations: visibleGraph.value.edges.length,
        terms: visibleGraph.value.nodes.length,
      })
    : '',
);

/** Data-mode seeds are capped like pin's data-mode render cap. */
const dataModeCapped = computed(
  () => (visibleGraph.value?.nodes.length ?? 0) > DATA_MODE_MAX_RENDER_COUNT,
);

const heightStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}));

function resetState(): void {
  fullGraph.value = null;
  assetCounts.value = {};
  loadError.value = '';
  graphMode.value = 'model';
  searchQuery.value = '';
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  dataGraph.value = null;
  dataLoadedOnce.value = false;
  loadingTermIds.value = new Set();
}

async function load(): Promise<void> {
  const token = ++loadToken;
  loading.value = true;
  loadError.value = '';
  try {
    const { counts, graph } = await fetchTermRelationsGraphData({
      glossaryFqn: props.glossaryFqn,
      glossaryId: props.glossaryId,
      termId: props.entityId,
    });
    if (token !== loadToken) {
      return;
    }
    fullGraph.value = graph;
    assetCounts.value = counts;
  } catch (error) {
    if (token !== loadToken) {
      return;
    }
    fullGraph.value = null;
    loadError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    if (token === loadToken) {
      loading.value = false;
    }
  }
}

async function onRefresh(): Promise<void> {
  dataGraph.value = null;
  dataLoadedOnce.value = false;
  await load();
  // Refresh must restore the mode the user is looking at: load() only
  // re-fetches the model graph, so a data-mode refresh re-enters data
  // mode (lazily — counts only, no asset fetch). Skip it when the
  // reload failed, so the load-error state stays visible instead.
  if (graphMode.value === 'data' && fullGraph.value) {
    enterDataMode();
  }
}

/**
 * Pin loadAssetsForDataMode: entering data mode only takes the asset
 * counts (already applied to visibleGraph) — assets are fetched per
 * term on expand (onLoadMoreAssets), never eagerly for all seeds.
 */
function enterDataMode(): void {
  dataModeLoading.value = false;
  dataGraph.value = visibleGraph.value
    ? { edges: [...visibleGraph.value.edges], nodes: [...visibleGraph.value.nodes] }
    : null;
  dataLoadedOnce.value = true;
}

function changeMode(mode: 'model' | 'data'): void {
  if (graphMode.value === mode) {
    return;
  }
  graphMode.value = mode;
  if (mode === 'data' && !dataLoadedOnce.value) {
    void enterDataMode();
  }
}

async function onLoadMoreAssets(termId: string): Promise<void> {
  const node = dataGraph.value?.nodes.find((item) => item.id === termId);
  if (!node || node.type !== 'glossaryTerm' || !dataGraph.value) {
    return;
  }
  assetControllers.get(termId)?.abort();
  const controller = new AbortController();
  assetControllers.set(termId, controller);
  loadingTermIds.value = new Set([...loadingTermIds.value, termId]);
  const size = termAssetPageSize(DATA_MODE_ASSET_LOAD_PAGE_SIZE);
  const fromOffset = node.loadedAssetCount ?? 0;
  try {
    const response = await getGlossaryTermAssets(termId, size, fromOffset, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    dataGraph.value = appendTermAssets(
      dataGraph.value,
      termId,
      response.data ?? [],
      response.total ?? 0,
      t('label.tagged-with'),
      fromOffset,
    );
  } catch (error) {
    if (!controller.signal.aborted) {
      message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
    }
  } finally {
    const next = new Set(loadingTermIds.value);
    next.delete(termId);
    loadingTermIds.value = next;
    if (assetControllers.get(termId) === controller) {
      assetControllers.delete(termId);
    }
  }
}

function onSelectNode(nodeId: string | null): void {
  selectedNodeId.value = nodeId;
  if (nodeId !== null) {
    selectedEdgeId.value = null;
  }
}

function onSelectEdge(edge: { id: string } | null): void {
  selectedEdgeId.value = edge?.id ?? null;
  if (edge !== null) {
    selectedNodeId.value = null;
  }
}

function onNodeDblClick(nodeId: string): void {
  const node = visibleGraph.value?.nodes.find((item) => item.id === nodeId);
  if (!node || node.type !== 'glossaryTerm' || nodeId === props.entityId) {
    return;
  }
  // Pin handleGraphNodeDoubleClick opens the node in a new tab.
  window.open(
    router.resolve({ name: 'governance-term', params: { id: nodeId } }).href,
    '_blank',
    'noopener,noreferrer',
  );
}

async function onExportPng(): Promise<void> {
  try {
    await canvasRef.value?.exportAsPng();
  } catch {
    message.error(t('ontology.browser.exportFailed'));
  }
}

async function onExportSvg(): Promise<void> {
  try {
    await canvasRef.value?.exportAsSvg();
  } catch {
    message.error(t('ontology.browser.exportFailed'));
  }
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive && !loadedOnce.value) {
      loadedOnce.value = true;
      void load();
    }
  },
  { immediate: true },
);

watch(
  () => props.entityId,
  () => {
    loadToken += 1;
    loadedOnce.value = false;
    resetState();
    if (props.active) {
      loadedOnce.value = true;
      void load();
    }
  },
);
</script>

<template>
  <div data-testid="ontology-term-relations" :style="heightStyle">
    <Empty
      v-if="!entityId"
      :description="t('ontology.browser.termRelationsNoTerm')"
      data-testid="ontology-term-relations-no-term"
    />
    <template v-else>
      <Space wrap data-testid="ontology-term-relations-toolbar" style="margin-bottom: 12px">
        <OntologyGraphModeTabs :mode="graphMode" :data-disabled="loading" @change="changeMode" />
        <Input
          v-model:value="searchQuery"
          allow-clear
          data-testid="ontology-term-relations-search"
          :placeholder="t('ontology.browser.termSearchPlaceholder')"
          style="width: 240px"
        />
        <template v-if="graphMode === 'model'">
          <GraphSettingsPanel :settings="graphSettings" @settings-change="(next) => (graphSettings = next)" />
          <Button
            data-testid="ontology-term-relations-export-png"
            :disabled="loading || !visibleGraph"
            @click="onExportPng"
          >
            <DownloadOutlined /> {{ t('ontology.browser.exportPng') }}
          </Button>
          <Button
            data-testid="ontology-term-relations-export-svg"
            :disabled="loading || !visibleGraph"
            @click="onExportSvg"
          >
            <DownloadOutlined /> {{ t('ontology.browser.exportSvg') }}
          </Button>
          <Button
            data-testid="ontology-term-relations-zoom-in"
            :aria-label="t('ontology.browser.zoomIn')"
            :disabled="loading || !visibleGraph"
            @click="canvasRef?.zoomIn?.()"
          >
            <ZoomInOutlined />
          </Button>
          <Button
            data-testid="ontology-term-relations-zoom-out"
            :aria-label="t('ontology.browser.zoomOut')"
            :disabled="loading || !visibleGraph"
            @click="canvasRef?.zoomOut?.()"
          >
            <ZoomOutOutlined />
          </Button>
          <Button
            data-testid="ontology-term-relations-fit"
            :aria-label="t('ontology.browser.fitToScreen')"
            :disabled="loading || !visibleGraph"
            @click="canvasRef?.fitView?.()"
          >
            <FullscreenOutlined />
          </Button>
        </template>
        <Button
          data-testid="ontology-term-relations-refresh"
          :aria-label="t('crud.refresh')"
          :disabled="loading"
          @click="onRefresh"
        >
          <ReloadOutlined />
        </Button>
      </Space>
      <Typography.Text
        v-if="statsLabel"
        type="secondary"
        data-testid="ontology-term-relations-stats"
        style="display: block; margin-bottom: 12px"
      >
        {{ statsLabel }}
      </Typography.Text>
      <!-- Data-mode edge legend, at toolbar layer like pin's
        renderDataModeEdgeLegend (renderGraphToolbar, outside the graph
        body): it stays visible in data mode even when the search-empty,
        loading or error state replaces the graph. -->
      <div
        v-if="graphMode === 'data'"
        data-testid="ontology-term-relations-data-legend"
        style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px"
      >
        <span style="display: inline-block; width: 28px; border-top: 2px dashed #005587" />
        <Typography.Text type="secondary">{{ t('label.semantic-edge-inferred') }}</Typography.Text>
      </div>
      <Card v-if="loading" :loading="true" data-testid="ontology-term-relations-loading" />
      <Alert
        v-else-if="loadError"
        type="error"
        show-icon
        data-testid="ontology-term-relations-error"
        :message="loadError"
      >
        <template #action>
          <Button size="small" data-testid="ontology-term-relations-retry" @click="onRefresh">
            {{ t('crud.refresh') }}
          </Button>
        </template>
      </Alert>
      <Empty
        v-else-if="isEmpty"
        :description="t('ontology.browser.termRelationsEmpty')"
        data-testid="ontology-term-relations-empty"
      />
      <Empty
        v-else-if="searchNoHit"
        :description="t('ontology.browser.searchEmpty')"
        data-testid="ontology-term-relations-search-empty"
      />
      <template v-else-if="graphMode === 'model' && visibleGraph">
        <OntologyGraphCanvas
          ref="canvasRef"
          :graph="visibleGraph"
          :can-edit="false"
          :highlight="highlight"
          :scope-key="`term:${entityId}`"
          :selected-node-id="selectedNodeId"
          :selected-edge-id="selectedEdgeId"
          :settings="graphSettings"
          @select-node="onSelectNode"
          @node-dblclick="onNodeDblClick"
          @select-edge="onSelectEdge"
          @canvas-click="onSelectNode(null)"
        />
      </template>
      <template v-else-if="graphMode === 'data'">
        <Card
          v-if="dataModeLoading && !dataGraph"
          :loading="true"
          data-testid="ontology-term-relations-data-loading"
          style="margin-bottom: 16px"
        />
        <OntologyDataGraph
          v-if="dataGraph"
          variant="glossary"
          :data="dataGraph"
          :selected-node-id="selectedNodeId"
          :limit-message="
            dataModeCapped ? t('ontology.browser.dataContextFull', { limit: DATA_MODE_MAX_RENDER_COUNT }) : undefined
          "
          @load-more="onLoadMoreAssets"
          @pane-click="onSelectNode(null)"
          @select-node="onSelectNode"
        />
      </template>
    </template>
  </div>
</template>
