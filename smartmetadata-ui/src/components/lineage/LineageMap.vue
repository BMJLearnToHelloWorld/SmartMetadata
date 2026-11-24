<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Space, Tooltip, message } from 'ant-design-vue';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Edge, Node, NodeTypesObject } from '@vue-flow/core';
import { asRecord, asString } from '@/api/json';
import { getLineageEdgeDetails, getLineageScene } from '@/api/lineage';
import SmState from '@/components/shared/SmState.vue';
import { LINEAGE_PLATFORM_LENSES } from '@/lineage/config';
import { clampLineageDepth } from '@/lineage/depth';
import { captureLineagePng, lineagePngFileName } from '@/lineage/exportPng';
import { layoutLineageGraph, lineageNodeSize, type LineageGraphModel, type PositionedLineageGraph } from '@/lineage/graphModel';
import type { LayoutOptions } from '@/lineage/elkLayout';
import {
  getBoxNearestPoint,
  getBreadcrumbSceneRequest,
  getDrillBand,
  getDrilledRootBreadcrumb,
  getEndpointNodeId,
  getLensRootLabelKey,
  getLineageMapEmptyState,
  getParentSceneRequest,
  getRailDrillFallbackNode,
  getRailStop,
  getRailStopLabelKey,
  getRealEntityRef,
  getSceneCacheKey,
  getSceneLevelLabelKey,
  getSceneNodeCount,
  getSceneNodeTypeSubtitle,
  getSemanticZoomDirection,
  hasSeenLineageMapOnboarding,
  isSceneNodeDrillable,
  LINEAGE_MAP_RAIL_STOPS,
  LineageSceneCache,
  mapSceneToGraphModel,
  markLineageMapOnboardingSeen,
  prefetchSceneBands,
  type LineageBand,
  type LineageLens,
  type LineageScene,
  type LineageSceneBreadcrumb,
  type LineageSceneEdge,
  type LineageSceneFocus,
  type LineageSceneNode,
  type LineageSceneRequest,
  type SceneTranslator,
} from '@/lineage/scene';
import LineageMapNode, { type LineageMapNodeData } from './LineageMapNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

// The platform map is view and export only; lineage is edited on asset
// tabs. This component therefore has no connect handler, no delete
// control and no add-lineage affordance: nodes are draggable, edges are
// selectable, and the only write-adjacent action is PNG export.
const SEMANTIC_ZOOM_COOLDOWN = 450;
// A drill waits for the zoom gesture to settle, so overshooting a pinch
// while zooming in to read a card does not open the next level.
const SEMANTIC_ZOOM_IN_SETTLE_MS = 250;
// Button and keyboard zoom drill the drillable node nearest the canvas
// centre, looking only inside this share of the canvas on each axis.
const ZOOM_TARGET_CENTRE_REGION = 0.5;
const PROGRAMMATIC_ZOOM_SUPPRESSION_MS = 1200;
const MAP_MIN_ZOOM = 0.1;
const MAP_MAX_ZOOM = 2.5;

/**
 * Per-band ELK spacing overrides (pin `SCENE_LAYOUT_OPTIONS`,
 * `LineageMap.component.tsx:212-241`, a3012259ca): denser bands pack
 * tighter, the field band spreads widest. Merged over the base options
 * by `ELKLayout.layoutGraph`.
 */
const SCENE_LAYOUT_OPTIONS: Record<LineageBand, LayoutOptions> = {
  LAYER: {
    'elk.spacing.componentComponent': '64',
    'elk.spacing.edgeEdge': '16',
    'elk.spacing.edgeNode': '24',
    'elk.spacing.nodeNode': '48',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
    'elk.layered.spacing.edgeNodeBetweenLayers': '28',
    'elk.layered.spacing.nodeNodeBetweenLayers': '150',
  },
  ASSET: {
    'elk.spacing.componentComponent': '80',
    'elk.spacing.edgeEdge': '18',
    'elk.spacing.edgeNode': '28',
    'elk.spacing.nodeNode': '64',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
    'elk.layered.spacing.edgeNodeBetweenLayers': '36',
    'elk.layered.spacing.nodeNodeBetweenLayers': '190',
  },
  FIELD: {
    'elk.spacing.componentComponent': '96',
    'elk.spacing.edgeEdge': '20',
    'elk.spacing.edgeNode': '32',
    'elk.spacing.nodeNode': '80',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '28',
    'elk.layered.spacing.edgeNodeBetweenLayers': '44',
    'elk.layered.spacing.nodeNodeBetweenLayers': '230',
  },
};

const props = withDefaults(
  defineProps<{
    lens?: LineageLens;
    band?: LineageBand;
    focusFqn?: string;
    entityType?: string;
    queryFilter?: string;
    upstreamDepth?: number;
    downstreamDepth?: number;
    nodesPerLayer?: number;
    isPlatformLineage?: boolean;
    deleted?: boolean;
  }>(),
  {
    lens: 'service',
    band: undefined,
    focusFqn: undefined,
    entityType: undefined,
    queryFilter: '',
    upstreamDepth: 1,
    downstreamDepth: 1,
    nodesPerLayer: 200,
    isPlatformLineage: true,
    deleted: false,
  },
);

const emit = defineEmits<{
  'update:lens': [lens: LineageLens];
  'update:band': [band: LineageBand];
  'update:focus': [focus: LineageSceneFocus];
  'request-change': [request: LineageSceneRequest];
  'select-node': [node: LineageSceneNode];
  'select-edge': [edge: LineageSceneEdge];
  navigate: [node: LineageSceneNode];
  'scene-loaded': [scene: LineageScene];
  'scene-error': [error: unknown];
}>();

const { t } = useI18n();
const translate: SceneTranslator = (key, params) =>
  t(
    key as Parameters<typeof t>[0],
    (params ?? {}) as Record<string, unknown>,
  ) as string;

function requestFromProps(): LineageSceneRequest {
  const band =
    props.band ?? (props.isPlatformLineage && !props.focusFqn ? 'LAYER' : 'ASSET');
  const request: LineageSceneRequest = { lens: props.lens, band };
  if (props.focusFqn && props.entityType) {
    return { ...request, focusFqn: props.focusFqn, entityType: props.entityType };
  }
  return request;
}

const currentRequest = ref<LineageSceneRequest>(requestFromProps());
const scene = ref<LineageScene | undefined>();
const loading = ref(true);
const sceneError = ref<unknown>();
const requestId = ref(0);
const cache = new LineageSceneCache();
const selectedNodeId = ref<string | undefined>();
const selectedEdgeId = ref<string | undefined>();
const edgeDetails = ref<unknown>();
const edgeDetailsLoading = ref(false);
const miniMapVisible = ref(true);
const showOnboarding = ref(false);
const expandedIds = ref<string[]>([]);
const restingZoom = ref<number | undefined>();
const lastSemanticZoomAt = ref(0);
const semanticZoomSuppressedUntil = ref(0);
const settleTimer = ref<number | undefined>();

const fetchOptions = computed(() => ({
  upstreamDepth: clampLineageDepth(props.upstreamDepth),
  downstreamDepth: clampLineageDepth(props.downstreamDepth),
  nodesPerLayer: props.nodesPerLayer,
  pipelineViewMode: 'Node' as const,
}));

const emptyState = computed(() =>
  getLineageMapEmptyState({ scene: scene.value, loading: loading.value, hasError: sceneError.value !== undefined }),
);
const showGraph = computed(() => Boolean(scene.value && scene.value.nodes.length > 0));

const graphModel = computed(() => (scene.value ? mapSceneToGraphModel(scene.value) : undefined));
const expandedSet = computed(() => new Set(expandedIds.value));

/**
 * ELK layout is async (pin `LineageMap.component.tsx:667` `layoutNodes`),
 * so positions arrive in a ref, not a computed — same shape as
 * LineageGraph: a run id drops stale results, a new scene clears the old
 * positions and fits the view once (the map's `fit-view-on-init` cannot
 * see nodes that arrive after mount), and an expand toggle re-lays out
 * over the previous positions.
 */
const positioned = ref<PositionedLineageGraph | undefined>();
const layoutRunId = ref(0);
let lastLayoutModel: LineageGraphModel | undefined;

async function runLayout(fitAfter: boolean): Promise<void> {
  const run = ++layoutRunId.value;
  const model = graphModel.value;
  if (!model) {
    positioned.value = undefined;
    return;
  }
  const result = await layoutLineageGraph(
    model,
    expandedSet.value,
    SCENE_LAYOUT_OPTIONS[currentRequest.value.band],
  );
  if (run !== layoutRunId.value) {
    return;
  }
  positioned.value = result;
  if (fitAfter && flowRef.value) {
    await nextTick();
    await flowRef.value.fitView({ padding: 0.1 });
  }
}

watch(
  [graphModel, expandedSet],
  () => {
    const modelChanged = graphModel.value !== lastLayoutModel;
    if (modelChanged) {
      lastLayoutModel = graphModel.value;
      positioned.value = undefined;
    }
    void runLayout(modelChanged);
  },
  { immediate: true },
);

const sceneNodeById = computed(
  () => new Map((scene.value?.nodes ?? []).map((node) => [node.id, node])),
);

const nodes = computed<Node<LineageMapNodeData>[]>(() => {
  if (!positioned.value) {
    return [];
  }
  return positioned.value.nodes.map((node) => {
    const sceneNode = sceneNodeById.value.get(node.id);
    const count = sceneNode ? getSceneNodeCount(sceneNode, translate) : undefined;
    const isFieldBand = currentRequest.value.band === 'FIELD';
    return {
      id: node.id,
      type: 'scene',
      position: node.position,
      draggable: true,
      class: [
        sceneNode?.isGhost ? 'lineage-map-node--ghost' : '',
        sceneNode?.isOrigin ? 'lineage-map-node--origin' : '',
      ]
        .filter(Boolean)
        .join(' '),
      data: {
        ...node,
        sceneNode: sceneNode ?? {
          band: currentRequest.value.band,
          id: node.id,
          label: node.name,
          levelKind: 'asset',
        },
        subtitle: sceneNode ? getSceneNodeTypeSubtitle(sceneNode, translate) : undefined,
        countLabel: count ? `${count.count} ${count.entity}` : undefined,
        drillable: isSceneNodeDrillable(sceneNode),
        expanded: isFieldBand ? true : expandedSet.value.has(node.id),
        highlighted: selectedNodeId.value === node.id,
        highlightedColumns: [],
        onToggleColumns: () => toggleExpand(node.id),
        onDrill: (target) => drillInto(target),
      },
    };
  });
});

const edges = computed<Edge[]>(() => {
  if (!positioned.value) {
    return [];
  }
  return positioned.value.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label || undefined,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
    class: selectedEdgeId.value === edge.id ? 'lineage-map-edge--active' : undefined,
    style: {
      strokeWidth: selectedEdgeId.value === edge.id ? 2.5 : 2,
    },
  }));
});

const breadcrumbs = computed<LineageSceneBreadcrumb[]>(() => {
  if (!scene.value) {
    return [];
  }
  if (scene.value.breadcrumb.length > 0) {
    return scene.value.breadcrumb;
  }
  const root = getDrilledRootBreadcrumb(scene.value);
  return root ? [root] : [];
});

const levelLabelKey = computed(() =>
  scene.value ? getSceneLevelLabelKey(scene.value) : undefined,
);

const railStop = computed(() =>
  scene.value ? getRailStop(scene.value) : currentRequest.value.band,
);

const selectedNode = computed(() =>
  selectedNodeId.value ? sceneNodeById.value.get(selectedNodeId.value) : undefined,
);
const selectedEdge = computed(() =>
  selectedEdgeId.value
    ? scene.value?.edges.find((edge) => edge.id === selectedEdgeId.value)
    : undefined,
);

const selectedEdgeInfo = computed(() => {
  const edge = selectedEdge.value;
  if (!edge) {
    return undefined;
  }
  const details = asRecord(edgeDetails.value);
  const detailsPipeline = asRecord(details?.pipeline);
  return {
    pipelineName:
      asString(detailsPipeline?.displayName) ||
      asString(detailsPipeline?.name) ||
      edge.pipeline?.displayName ||
      edge.pipeline?.name,
    source: asString(details?.source) || edge.source,
    description: asString(details?.description) || edge.description,
    sqlQuery: asString(details?.sqlQuery) || edge.sqlQuery,
  };
});

function toggleExpand(nodeId: string): void {
  expandedIds.value = expandedIds.value.includes(nodeId)
    ? expandedIds.value.filter((id) => id !== nodeId)
    : [...expandedIds.value, nodeId];
}

function suppressSemanticZoom(durationMs = PROGRAMMATIC_ZOOM_SUPPRESSION_MS): void {
  semanticZoomSuppressedUntil.value = Math.max(
    semanticZoomSuppressedUntil.value,
    Date.now() + durationMs,
  );
}

async function loadScene(request: LineageSceneRequest, refresh = false): Promise<void> {
  const id = ++requestId.value;
  loading.value = true;
  sceneError.value = undefined;
  const key = getSceneCacheKey(request, fetchOptions.value, props.queryFilter ?? '');
  try {
    const next = await cache.load(
      key,
      () =>
        getLineageScene({
          ...request,
          upstreamDepth: fetchOptions.value.upstreamDepth,
          downstreamDepth: fetchOptions.value.downstreamDepth,
          nodesPerLayer: fetchOptions.value.nodesPerLayer,
          queryFilter: props.queryFilter || undefined,
        }),
      refresh,
    );
    if (id !== requestId.value) {
      return;
    }
    scene.value = next;
    selectedNodeId.value = undefined;
    selectedEdgeId.value = undefined;
    edgeDetails.value = undefined;
    emit('scene-loaded', next);
    prefetchSceneBands(
      cache,
      next,
      request,
      { ...fetchOptions.value, queryFilter: props.queryFilter },
      (prefetchRequest) =>
        getLineageScene({
          ...prefetchRequest,
          upstreamDepth: fetchOptions.value.upstreamDepth,
          downstreamDepth: fetchOptions.value.downstreamDepth,
          nodesPerLayer: fetchOptions.value.nodesPerLayer,
          queryFilter: props.queryFilter || undefined,
        }),
    );
  } catch (error) {
    if (id !== requestId.value) {
      return;
    }
    scene.value = undefined;
    sceneError.value = error;
    emit('scene-error', error);
  } finally {
    if (id === requestId.value) {
      loading.value = false;
    }
  }
}

function updateRequest(nextRequest: LineageSceneRequest): void {
  suppressSemanticZoom();
  currentRequest.value = nextRequest;
  emit('update:lens', nextRequest.lens);
  emit('update:band', nextRequest.band);
  const focus: LineageSceneFocus =
    nextRequest.focusFqn && nextRequest.entityType
      ? { focusFqn: nextRequest.focusFqn, entityType: nextRequest.entityType }
      : {};
  emit('update:focus', focus);
  emit('request-change', nextRequest);
  void loadScene(nextRequest);
}

function onLensChange(lens: LineageLens): void {
  if (lens === currentRequest.value.lens) {
    return;
  }
  // A lens switch opens the new lens at its root.
  updateRequest({ lens, band: 'LAYER' });
}

function onRailStopSelect(stop: LineageBand): void {
  if (stop === currentRequest.value.band) {
    return;
  }
  updateRequest({ ...currentRequest.value, band: stop });
}

function onBreadcrumbFocus(crumb: LineageSceneBreadcrumb): void {
  if (!scene.value) {
    return;
  }
  updateRequest(getBreadcrumbSceneRequest(scene.value, crumb));
}

function drillInto(node: LineageSceneNode): void {
  if (!isSceneNodeDrillable(node)) {
    return;
  }
  updateRequest({
    lens: currentRequest.value.lens,
    band: getDrillBand(node),
    focusFqn: node.fullyQualifiedName,
    entityType: node.entityType,
  });
}

function showFields(): void {
  updateRequest({ ...currentRequest.value, band: 'FIELD' });
}

function reload(): void {
  void loadScene(currentRequest.value, true);
}

function onNodeClick(payload: { node: Node<LineageMapNodeData> }): void {
  const sceneNode = payload.node.data?.sceneNode;
  if (!sceneNode) {
    return;
  }
  selectedNodeId.value = sceneNode.id;
  selectedEdgeId.value = undefined;
  emit('select-node', sceneNode);
}

function onNodeDoubleClick(payload: { node: Node<LineageMapNodeData> }): void {
  const sceneNode = payload.node.data?.sceneNode;
  if (sceneNode) {
    drillInto(sceneNode);
  }
}

async function onEdgeClick(payload: { edge: Edge }): Promise<void> {
  const sceneEdge = scene.value?.edges.find((edge) => edge.id === payload.edge.id);
  if (!sceneEdge) {
    return;
  }
  selectedEdgeId.value = sceneEdge.id;
  selectedNodeId.value = undefined;
  edgeDetails.value = undefined;
  emit('select-edge', sceneEdge);
  // Hydrate a single concrete edge with its details; rollups and edges
  // without real entity refs keep the scene edge's own fields.
  const nodeById = sceneNodeById.value;
  const fromRef = getRealEntityRef(nodeById.get(getEndpointNodeId(sceneEdge.from)));
  const toRef = getRealEntityRef(nodeById.get(getEndpointNodeId(sceneEdge.to)));
  if (
    !sceneEdge.isRollup &&
    (sceneEdge.weight ?? 1) === 1 &&
    fromRef &&
    toRef
  ) {
    edgeDetailsLoading.value = true;
    try {
      const details = await getLineageEdgeDetails(fromRef.id, toRef.id);
      if (selectedEdgeId.value === sceneEdge.id) {
        edgeDetails.value = details;
      }
    } catch {
      // Details are enrichment only; the scene edge fields still render.
    } finally {
      edgeDetailsLoading.value = false;
    }
  }
}

function extractViewport(payload: unknown): { x: number; y: number; zoom: number } | undefined {
  const record = payload as { flowTransform?: unknown; viewport?: unknown; zoom?: unknown } | null;
  if (!record || typeof record !== 'object') {
    return undefined;
  }
  const candidate = (record.flowTransform ?? record.viewport ?? record) as {
    x?: unknown;
    y?: unknown;
    zoom?: unknown;
  };
  if (typeof candidate.zoom !== 'number') {
    return undefined;
  }
  return {
    x: typeof candidate.x === 'number' ? candidate.x : 0,
    y: typeof candidate.y === 'number' ? candidate.y : 0,
    zoom: candidate.zoom,
  };
}

function maybeSemanticZoom(previousZoom: number, viewport: { x: number; y: number; zoom: number }): void {
  const currentScene = scene.value;
  const laidOut = positioned.value;
  const flowElement = flowRef.value?.$el as HTMLElement | undefined;
  if (!currentScene || !laidOut || !flowElement) {
    return;
  }
  const screen = { width: flowElement.clientWidth, height: flowElement.clientHeight };
  if (screen.width <= 0 || screen.height <= 0) {
    return;
  }
  const boxes = laidOut.nodes.map((node) => ({
    ...node.position,
    ...lineageNodeSize(node, expandedSet.value),
  }));
  const bounds = boxes.reduce(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.x),
      minY: Math.min(acc.minY, box.y),
      maxX: Math.max(acc.maxX, box.x + box.width),
      maxY: Math.max(acc.maxY, box.y + box.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const graph = { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
  const focusIndex = laidOut.nodes.findIndex((node) => node.isCenter);
  const cardBox = boxes[focusIndex >= 0 ? focusIndex : 0] ?? { width: graph.width, height: graph.height };
  const card = { width: cardBox.width, height: cardBox.height };
  const direction = getSemanticZoomDirection({
    previousZoom,
    zoom: viewport.zoom,
    graph,
    card,
    screen,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
  });
  if (!direction) {
    return;
  }
  lastSemanticZoomAt.value = Date.now();
  if (direction === 'in') {
    // Drill the drillable node nearest the canvas centre, inside the
    // centre region; fall back to the first drillable node with children.
    const centre = {
      x: (screen.width / 2 - viewport.x) / viewport.zoom,
      y: (screen.height / 2 - viewport.y) / viewport.zoom,
    };
    const halfWidth = ((screen.width * ZOOM_TARGET_CENTRE_REGION) / 2) * viewport.zoom;
    const halfHeight = ((screen.height * ZOOM_TARGET_CENTRE_REGION) / 2) * viewport.zoom;
    const inRegion = laidOut.nodes
      .map((node, index) => ({ node, box: boxes[index] }))
      .filter(
        ({ node, box }) =>
          isSceneNodeDrillable(sceneNodeById.value.get(node.id)) &&
          Math.abs(box.x + box.width / 2 - centre.x) <= halfWidth &&
          Math.abs(box.y + box.height / 2 - centre.y) <= halfHeight,
      )
      .map(({ node, box }) => ({ ...box, id: node.id }));
    const nearest = getBoxNearestPoint(inRegion, centre);
    const target =
      (nearest ? sceneNodeById.value.get(nearest.id) : undefined) ??
      getRailDrillFallbackNode(currentScene.nodes);
    if (target && isSceneNodeDrillable(target)) {
      drillInto(target);
    }
    return;
  }
  const parent = getParentSceneRequest(currentScene);
  if (parent) {
    updateRequest(parent);
  }
}

function onMoveEnd(payload: unknown): void {
  const viewport = extractViewport(payload);
  if (!viewport) {
    return;
  }
  const now = Date.now();
  if (now < semanticZoomSuppressedUntil.value) {
    restingZoom.value = viewport.zoom;
    return;
  }
  if (now - lastSemanticZoomAt.value < SEMANTIC_ZOOM_COOLDOWN) {
    restingZoom.value = viewport.zoom;
    return;
  }
  const previous = restingZoom.value;
  restingZoom.value = viewport.zoom;
  if (previous === undefined) {
    return;
  }
  window.clearTimeout(settleTimer.value);
  settleTimer.value = window.setTimeout(() => {
    maybeSemanticZoom(previous, viewport);
  }, SEMANTIC_ZOOM_IN_SETTLE_MS);
}

function handleOnboardingClose(): void {
  markLineageMapOnboardingSeen();
  showOnboarding.value = false;
}

// Structural subset of the VueFlow instance API, as in LineageGraph.
type FlowApi = {
  getViewport: () => { x: number; y: number; zoom: number };
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  fitView: (options?: { padding?: number }) => Promise<boolean>;
  $el: HTMLElement;
};

const flowRef = ref<FlowApi | null>(null);

async function exportPng(): Promise<void> {
  const flow = flowRef.value;
  if (!flow) {
    throw new Error('Lineage map flow is not mounted');
  }
  const saved = flow.getViewport();
  try {
    await flow.fitView({ padding: 0.1 });
    await nextTick();
    const element = flow.$el?.querySelector?.('.vue-flow') as HTMLElement | null;
    const target = element ?? (flow.$el as HTMLElement | null);
    if (!target) {
      throw new Error('Lineage map flow element not found');
    }
    await captureLineagePng(
      target,
      lineagePngFileName('map', `${currentRequest.value.lens}-${currentRequest.value.band.toLowerCase()}`),
    );
    message.success(t('lineage.exportPngDone'));
  } finally {
    flow.setViewport(saved);
  }
}

defineExpose({ exportPng, reload, request: currentRequest });

const propsRequestKey = computed(() =>
  [props.lens, props.band ?? '', props.focusFqn ?? '', props.entityType ?? ''].join('|'),
);

watch(propsRequestKey, () => {
  const next = requestFromProps();
  if (getSceneCacheKey(next, fetchOptions.value) !== getSceneCacheKey(currentRequest.value, fetchOptions.value)) {
    currentRequest.value = next;
    void loadScene(next);
  }
});

watch(
  () => [props.upstreamDepth, props.downstreamDepth, props.nodesPerLayer, props.queryFilter],
  () => {
    void loadScene(currentRequest.value);
  },
);

onMounted(() => {
  void loadScene(currentRequest.value);
  const isOnboardingContext = Boolean(props.isPlatformLineage) && !props.deleted;
  showOnboarding.value = isOnboardingContext && !hasSeenLineageMapOnboarding();
});

onUnmounted(() => {
  window.clearTimeout(settleTimer.value);
});

const nodeTypes = {
  scene: markRaw(LineageMapNode),
  // NodeTypesObject requires node components to expose NodeProps on their
  // instance; <script setup> SFCs receive those as props instead, so the
  // cast bridges the type gap (LineageGraph's asset nodes carry the same
  // pre-existing mismatch).
} as unknown as NodeTypesObject;
</script>

<template>
  <div class="lineage-map" data-testid="lineage-map">
    <div class="lineage-map__toolbar">
      <Space wrap align="center">
        <span class="lineage-map__lens-label">{{ t('lineage.mapLensLabel') }}</span>
        <span class="lineage-map__lens-group" role="group" :aria-label="t('lineage.mapLensLabel')">
          <Button
            v-for="lens in LINEAGE_PLATFORM_LENSES"
            :key="lens.value"
            :type="currentRequest.lens === lens.value ? 'primary' : 'default'"
            :data-testid="`lineage-layer-${lens.value}-btn`"
            :aria-pressed="currentRequest.lens === lens.value"
            @click="onLensChange(lens.value)"
          >
            {{ t(lens.labelKey) }}
          </Button>
        </span>
        <span class="lineage-map__rail" role="group" :aria-label="t('lineage.mapLayerView')">
          <Button
            v-for="stop in LINEAGE_MAP_RAIL_STOPS"
            :key="stop"
            :type="railStop === stop ? 'primary' : 'default'"
            :data-testid="`lineage-map-rail-${stop.toLowerCase()}`"
            :aria-pressed="railStop === stop"
            @click="onRailStopSelect(stop)"
          >
            {{ t(getRailStopLabelKey(stop, currentRequest.lens)) }}
          </Button>
        </span>
        <Tooltip :title="t('lineage.reloadHelp')">
          <Button data-testid="lineage-map-reload" :aria-label="t('lineage.reloadHelp')" @click="reload">
            {{ t('lineage.reload') }}
          </Button>
        </Tooltip>
        <Tooltip :title="miniMapVisible ? t('lineage.mapHideMiniMap') : t('lineage.mapShowMiniMap')">
          <Button
            data-testid="lineage-map-toggle-minimap"
            :aria-label="miniMapVisible ? t('lineage.mapHideMiniMap') : t('lineage.mapShowMiniMap')"
            @click="miniMapVisible = !miniMapVisible"
          >
            {{ miniMapVisible ? t('lineage.mapHideMiniMap') : t('lineage.mapShowMiniMap') }}
          </Button>
        </Tooltip>
      </Space>
      <div class="lineage-map__view-only" data-testid="lineage-map-view-only">
        {{ t('lineage.mapViewOnly') }}
      </div>
    </div>
    <nav
      v-if="breadcrumbs.length"
      class="lineage-map__breadcrumbs"
      data-testid="lineage-map-breadcrumbs"
      :aria-label="t(getLensRootLabelKey(currentRequest.lens))"
    >
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
        <span v-if="index > 0" class="lineage-map__crumb-separator" aria-hidden="true">/</span>
        <button
          type="button"
          class="lineage-map__crumb"
          :class="{ 'lineage-map__crumb--current': index === breadcrumbs.length - 1 }"
          :data-testid="`lineage-map-crumb-${crumb.id}`"
          @click="onBreadcrumbFocus(crumb)"
        >
          {{ crumb.label }}
        </button>
      </template>
    </nav>
    <div v-if="scene && levelLabelKey" class="lineage-map__level" data-testid="lineage-map-level">
      {{ t(levelLabelKey) }}
      <span v-if="scene.hiddenNodeCount" class="lineage-map__hidden">
        {{ t('lineage.mapHiddenNodes', { count: scene.hiddenNodeCount }) }}
      </span>
    </div>
    <div class="lineage-map__canvas" data-testid="lineage-map-canvas">
      <SmState
        v-if="!showGraph"
        :state="emptyState"
        test-id="lineage-map-state"
        :empty-text="t('lineage.mapEmpty')"
        :error-text="t('lineage.loadFailed')"
        show-retry
        @retry="reload"
      />
      <VueFlow
        v-else
        ref="flowRef"
        :nodes="nodes"
        :edges="edges"
        :node-types="nodeTypes"
        :nodes-draggable="true"
        :nodes-connectable="false"
        :min-zoom="MAP_MIN_ZOOM"
        :max-zoom="MAP_MAX_ZOOM"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @edge-click="onEdgeClick"
        @move-end="onMoveEnd"
      >
        <Background :gap="18" :size="1" />
        <Controls />
        <MiniMap v-if="miniMapVisible" pannable zoomable />
      </VueFlow>
    </div>
    <div
      v-if="selectedNode"
      class="lineage-map__selection"
      data-testid="lineage-map-selection"
    >
      <span class="lineage-map__selection-name">{{ selectedNode.displayName || selectedNode.label }}</span>
      <Space>
        <Button
          v-if="isSceneNodeDrillable(selectedNode)"
          data-testid="lineage-map-drill"
          :aria-label="t('lineage.mapDrillHelp')"
          @click="drillInto(selectedNode)"
        >
          {{ t('lineage.mapDrill') }}
        </Button>
        <Button
          v-if="currentRequest.band !== 'FIELD'"
          data-testid="lineage-map-show-fields"
          @click="showFields"
        >
          {{ t('lineage.mapShowFields') }}
        </Button>
        <Button data-testid="lineage-map-open-asset" @click="emit('navigate', selectedNode)">
          {{ t('lineage.openAsset') }}
        </Button>
      </Space>
    </div>
    <div
      v-if="selectedEdge && selectedEdgeInfo"
      class="lineage-map__edge"
      data-testid="lineage-map-edge-details"
    >
      <span class="lineage-map__edge-title">{{ t('lineage.mapEdgeLabel') }}</span>
      <span v-if="selectedEdgeInfo.pipelineName" class="lineage-map__edge-field">
        {{ t('lineage.edgePipeline') }}: {{ selectedEdgeInfo.pipelineName }}
      </span>
      <span v-if="selectedEdgeInfo.source" class="lineage-map__edge-field">
        {{ t('lineage.edgeSource') }}: {{ selectedEdgeInfo.source }}
      </span>
      <span v-if="selectedEdgeInfo.description" class="lineage-map__edge-field">
        {{ selectedEdgeInfo.description }}
      </span>
      <span v-if="selectedEdgeInfo.sqlQuery" class="lineage-map__edge-field">
        {{ t('lineage.mapEdgeSql') }}: {{ selectedEdgeInfo.sqlQuery }}
      </span>
      <span v-if="edgeDetailsLoading" class="lineage-map__edge-field">{{ t('shared.loading') }}</span>
    </div>
    <Modal
      v-if="showOnboarding"
      :open="true"
      :width="560"
      :footer="null"
      :closable="true"
      @cancel="handleOnboardingClose"
    >
      <div data-testid="lineage-map-onboarding-dialog">
        <div class="lineage-map__onboarding-header">
          <span class="lineage-map__onboarding-eyebrow">{{ t('lineage.mapOnboardingEyebrow') }}</span>
          <span class="lineage-map__onboarding-title">{{ t('lineage.mapOnboardingTitle') }}</span>
          <span class="lineage-map__onboarding-description">{{
            t('lineage.mapOnboardingDescription')
          }}</span>
        </div>
        <div class="lineage-map__onboarding-body">
          <div class="lineage-map__onboarding-row">
            <span class="lineage-map__onboarding-row-title">{{ t('lineage.mapOnboardingAltitude') }}</span>
            <span class="lineage-map__onboarding-row-description">{{
              t('lineage.mapOnboardingAltitudeDescription')
            }}</span>
          </div>
          <div class="lineage-map__onboarding-row">
            <span class="lineage-map__onboarding-row-title">{{ t('lineage.mapOnboardingLayer') }}</span>
            <span class="lineage-map__onboarding-row-description">{{
              t('lineage.mapOnboardingLayerDescription')
            }}</span>
          </div>
        </div>
        <div class="lineage-map__onboarding-footer">
          <span class="lineage-map__onboarding-hint">{{ t('lineage.mapOnboardingHint') }}</span>
          <Button
            type="primary"
            data-testid="lineage-map-onboarding-explore"
            @click="handleOnboardingClose"
          >
            {{ t('lineage.mapExplore') }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
/* Pin `components/Lineage/Lineage.component.tsx`: the card is a flex
   column and the map container is `flex-1 min-h-0` — the canvas fills
   whatever the viewport-derived page wrapper leaves, with no fixed
   floor (the old `min-height: 420px` is what capped the home canvas at
   420px with 150px of blank below it). */
.lineage-map {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card);
  background: var(--sm-content-bg);
}
.lineage-map__toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sm-border-secondary);
  background: var(--sm-bg-container);
}
.lineage-map__lens-label {
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.lineage-map__view-only {
  margin-top: 6px;
  color: var(--sm-text-tertiary);
  font-size: 12px;
}
.lineage-map__breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 0;
}
.lineage-map__crumb {
  border: 0;
  background: none;
  padding: 0;
  color: var(--sm-color-primary);
  cursor: pointer;
  font-size: 12px;
}
.lineage-map__crumb--current {
  color: var(--sm-text-primary);
  cursor: default;
  font-weight: 600;
}
.lineage-map__crumb-separator {
  color: var(--sm-text-quaternary);
}
.lineage-map__level {
  padding: 8px 10px 0;
  color: var(--sm-text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.lineage-map__hidden {
  margin-inline-start: 8px;
  color: var(--sm-text-tertiary);
  font-weight: 400;
}
.lineage-map__canvas {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.lineage-map__canvas :deep(.vue-flow) {
  flex: 1 1 auto;
  min-height: 0;
}
.lineage-map__canvas :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
.lineage-map__canvas :deep(.lineage-map-edge--active .vue-flow__edge-path) {
  stroke: var(--sm-color-warning);
}
.lineage-map__canvas :deep(.lineage-map-node--ghost) {
  opacity: 0.45;
}
.lineage-map__canvas :deep(.vue-flow__controls) {
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
  box-shadow: var(--sm-shadow-card);
}
.lineage-map__canvas :deep(.vue-flow__minimap) {
  overflow: hidden;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-border-radius);
}
.lineage-map__selection,
.lineage-map__edge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--sm-border-secondary);
  background: var(--sm-bg-container);
  font-size: 12px;
}
.lineage-map__selection-name,
.lineage-map__edge-title {
  font-weight: 600;
  color: var(--sm-text-primary);
}
.lineage-map__edge-field {
  color: var(--sm-text-secondary);
}
.lineage-map__onboarding-header {
  padding: 8px 8px 16px;
  border-radius: var(--sm-border-radius) var(--sm-border-radius) 0 0;
  background: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
}
.lineage-map__onboarding-eyebrow {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.lineage-map__onboarding-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}
.lineage-map__onboarding-description {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.9;
}
.lineage-map__onboarding-body {
  padding: 8px;
}
.lineage-map__onboarding-row {
  padding: 12px 0;
}
.lineage-map__onboarding-row + .lineage-map__onboarding-row {
  border-top: 1px solid var(--sm-border-secondary);
}
.lineage-map__onboarding-row-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--sm-text-primary);
}
.lineage-map__onboarding-row-description {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-text-tertiary);
}
.lineage-map__onboarding-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px;
}
.lineage-map__onboarding-hint {
  font-size: 13px;
  color: var(--sm-text-tertiary);
}
</style>
