<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'ant-design-vue';
import { MarkerType, VueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import type { Edge, Node, NodeComponent, NodeTypesObject } from '@vue-flow/core';
import { SM_SURFACES } from '@/theme/tokens';
import type { EntityRef } from '@/types/api';
import type { DataProduct } from '@/types/governance';
import PortsLineageDataProductNode from './PortsLineageDataProductNode.vue';
import PortsLineagePortNode from './PortsLineagePortNode.vue';
import {
  buildPortsLineageGraph,
  type PortsLineageDataProductNodeData,
  type PortsLineagePortNodeData,
} from './portsLineage';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

/**
 * Pin `PortsLineageView.component.tsx` (a3012259ca), ported to Vue Flow:
 * a dedicated three-column graph (NOT the entity-lineage canvas) with the
 * data product at the center, input ports left, output ports right.
 * Geometry comes from `portsLineage.ts` (pin constants verbatim). After
 * the graph mounts it fits the view and zooms to 0.4, as pin does (100 ms
 * timeout, once). Empty state mirrors pin's `NoDataPlaceholder` choice:
 * zero assets → the "assign assets" message, otherwise the "no ports"
 * message. Fullscreen is owned by the parent (pin `InputOutputPortsTab`
 * owns `isLineageFullScreen` + the Escape handler); this view only
 * renders the toggle and emits `toggle-fullscreen`.
 */
const props = withDefaults(
  defineProps<{
    dataProduct: DataProduct;
    inputPorts: EntityRef[];
    outputPorts: EntityRef[];
    assetCount: number;
    height?: number;
    isFullScreen?: boolean;
  }>(),
  { height: 350, isFullScreen: false },
);

const emit = defineEmits<{
  'toggle-fullscreen': [];
  'port-click': [port: EntityRef];
}>();

const { t } = useI18n();

/** Custom node type registration (same cast pattern as LineageGraph). */
const nodeTypes: NodeTypesObject = {
  portNode: markRaw(PortsLineagePortNode) as unknown as NodeComponent,
  dataProductNode: markRaw(PortsLineageDataProductNode) as unknown as NodeComponent,
};

const hasAnyPorts = computed(
  () => props.inputPorts.length > 0 || props.outputPorts.length > 0,
);

const graph = computed(() =>
  buildPortsLineageGraph(props.dataProduct, props.inputPorts, props.outputPorts),
);

const nodes = computed<Node<PortsLineagePortNodeData | PortsLineageDataProductNodeData>[]>(
  () => graph.value.nodes,
);

/** Pin edge presentation: smoothstep, primary stroke, closed arrow. */
const edges = computed<Edge[]>(() =>
  graph.value.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    style: { stroke: 'var(--sm-color-primary)', strokeWidth: 2 },
    markerEnd: MarkerType.ArrowClosed,
  })),
);

const containerHeight = computed(() =>
  props.isFullScreen ? '100vh' : `${props.height}px`,
);

const emptyMessage = computed(() =>
  props.assetCount === 0
    ? t('governance.dataProducts.noAssetsForPortsLineage')
    : t('governance.dataProducts.noPortsToDisplayLineage'),
);

function onNodeClick(payload: { node: Node }): void {
  const node = payload.node as Node<PortsLineagePortNodeData | PortsLineageDataProductNodeData>;
  if (node.type === 'portNode') {
    emit('port-click', (node.data as PortsLineagePortNodeData).port);
  }
}

// Structural subset of the VueFlow instance API (same shape LineageGraph
// uses for its flow ref); zoomTo is optional — the test stub exposes
// fitView only, and the call is skipped when it is absent.
type FlowApi = {
  fitView: (options?: { padding?: number }) => Promise<boolean>;
  zoomTo?: (zoom: number) => void;
};

const flowRef = ref<FlowApi | null>(null);
let fitTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;

/** Pin `useEffect`: fit + zoom to 0.4 once nodes exist (100 ms delay). */
function fitAndZoom(): void {
  window.clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    if (!alive || !hasAnyPorts.value) {
      return;
    }
    void nextTick()
      .then(() => flowRef.value?.fitView({ padding: 0.2 }))
      .then(() => flowRef.value?.zoomTo?.(0.4))
      .catch(() => undefined);
  }, 100);
}

onMounted(() => {
  alive = true;
  if (hasAnyPorts.value) {
    fitAndZoom();
  }
});

watch(hasAnyPorts, (has) => {
  if (has) {
    fitAndZoom();
  }
});

onUnmounted(() => {
  alive = false;
  window.clearTimeout(fitTimer);
});
</script>

<template>
  <div
    v-if="!hasAnyPorts"
    class="ports-lineage-view-empty"
    data-testid="no-ports-placeholder"
  >
    {{ emptyMessage }}
  </div>
  <div
    v-else
    class="ports-lineage-view"
    :class="{ 'ports-lineage-view--fullscreen': isFullScreen }"
    data-testid="ports-lineage-view"
    :style="{ height: containerHeight }"
  >
    <div class="ports-lineage-view__fullscreen">
      <Button
        data-testid="toggle-fullscreen-btn"
        :aria-label="isFullScreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen')"
        :title="isFullScreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen')"
        @click="emit('toggle-fullscreen')"
      >
        {{ isFullScreen ? t('lineage.exitFullscreen') : t('lineage.fullscreen') }}
      </Button>
    </div>
    <VueFlow
      ref="flowRef"
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      pan-on-drag
      zoom-on-scroll
      @node-click="onNodeClick"
    >
      <Background :color="SM_SURFACES.borderSecondary" :gap="16" :size="1" />
      <Controls position="bottom-left" :show-fit-view="true" :show-zoom="true" :show-interactive="false" />
    </VueFlow>
  </div>
</template>

<style scoped>
.ports-lineage-view {
  position: relative;
  width: 100%;
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  background: var(--sm-bg-container);
}
.ports-lineage-view--fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--sm-z-modal);
  border: none;
  border-radius: 0;
}
.ports-lineage-view-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  padding: 16px;
  text-align: center;
  color: var(--sm-text-tertiary);
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
}
.ports-lineage-view__fullscreen {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
}
.ports-lineage-view :deep(.vue-flow) {
  width: 100%;
  height: 100%;
}
.ports-lineage-view :deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}
</style>
