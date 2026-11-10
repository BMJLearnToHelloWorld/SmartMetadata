<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Select, Space, Typography } from 'ant-design-vue';
import type { GraphData } from '@antv/g6';
import {
  createGraphEditState,
  HIERARCHICAL_RELATION_NAMES,
  type OntologyGraphData,
  type OntologyGraphEdge,
  type OntologyGraphNode,
} from './ontologyGraph';
import { ontologyEdgeKey, type GraphSearchHighlight } from './ontologySearchHighlight';
import {
  DEFAULT_ONTOLOGY_GRAPH_SETTINGS,
  type OntologyGraphSettings,
} from '@/types/ontologyDataGraph';

/**
 * G6 canvas (official OntologyGraphG6.tsx + useOntologyGraphEdit.ts, Vue
 * port). The graph itself is @antv/g6 (official package.json: ^5.1.1):
 * drag-canvas / zoom-canvas for navigation, drag-element for node
 * repositioning. Repositioning is layout-only — it never emits an edit.
 *
 * Editing follows the official draw-to-connect gesture, adapted to clicks
 * (G6 node:click is the reliable Vue-side signal): click a node to arm it,
 * click a different node to open the pending relation, pick a relation
 * type and confirm. Confirm emits `create-relation`; the caller must turn
 * it into a change-set operation — this component never mutates the graph
 * as if the edit had landed.
 *
 * Read-only mode (the browser) has its own selection path, strictly
 * separate from the edit state machine (see ADR:2026-11-08-ontology-browser-canvas-stage-1):
 * node click selects, double-click opens the concept detail, edge click
 * selects the edge, canvas click clears. View mode never produces a write.
 *
 * Handle (official OntologyGraphHandle, export methods excluded — stage
 * 3): fitView / zoomIn / zoomOut / runLayout / focusNode /
 * getNodePositions, exposed for the caller. fit follows the official
 * fitViewWithMinZoom rule (fit, then clamp zoom to <= 1).
 */

/** Official OntologyExplorer.constants.ts zoom bounds. */
const MIN_ZOOM = 0.001;
const MAX_ZOOM = 3;
const PRACTICAL_MAX_ZOOM_INITIAL = 1;

/** Product-token combo strokes (theme.css: primary + bright accents). */
const COMBO_STROKES = ['#005587', '#00a1de', '#00a19c', '#94c120', '#4087a9', '#0c7bc0'];
const COMBO_FILL = '#e7f3fb';

const props = defineProps<{
  graph: OntologyGraphData;
  canEdit: boolean;
  highlight?: GraphSearchHighlight | null;
  scopeKey?: string;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  /**
   * Graph settings (G-18 stage 2, official GraphSettingsPanel): layout +
   * edge-label visibility. Optional — unset keeps the stage-1 behaviour
   * (hierarchical dagre + labels shown), so the studio and glossary
   * relations callers are unaffected.
   */
  settings?: OntologyGraphSettings;
}>();

const emit = defineEmits<{
  (event: 'create-relation', payload: { fromId: string; toId: string; relationType: string }): void;
  (event: 'select-node', nodeId: string | null): void;
  (event: 'node-dblclick', nodeId: string): void;
  (event: 'select-edge', edge: OntologyGraphEdge | null): void;
  (event: 'canvas-click'): void;
}>();

const { t } = useI18n();
const container = ref<HTMLDivElement | null>(null);
const loadError = ref('');
const edit = createGraphEditState(() => props.canEdit);
const armedId = ref<string | null>(null);
const pending = ref<{ fromId: string; toId: string } | null>(null);
const relationType = ref('subClassOf');
const readOnlyNodeId = ref<string | null>(props.selectedNodeId ?? null);
const readOnlyEdgeId = ref<string | null>(props.selectedEdgeId ?? null);

const selectedNodeLabel = computed(() => {
  if (!readOnlyNodeId.value) {
    return '';
  }
  return props.graph.nodes.find((node) => node.id === readOnlyNodeId.value)?.label ?? readOnlyNodeId.value;
});

type GraphLike = {
  on: (event: string, handler: (event: { target?: { id?: string } }) => void) => void;
  setData: (data: unknown) => void;
  render: () => Promise<void>;
  destroy: () => void;
  fitView: (options?: unknown, animation?: unknown) => Promise<void>;
  zoomBy: (ratio: number, animation?: unknown) => Promise<void>;
  zoomTo: (zoom: number, animation?: unknown, origin?: unknown) => Promise<void>;
  getZoom: () => number;
  getCanvasCenter: () => { x: number; y: number };
  layout: () => Promise<void>;
  focusElement: (id: string, animation?: unknown) => Promise<void>;
  getNodeData: () => Array<{ id: string; style?: { x?: number; y?: number } }>;
  updateNodeData: (data: Array<Record<string, unknown>>) => void;
  updateEdgeData: (data: Array<Record<string, unknown>>) => void;
  setSize: (width: number, height: number) => void;
};
let graph: GraphLike | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastScopeKey = props.scopeKey ?? '';
/** Element flags already applied via updateNodeData/updateEdgeData. */
const appliedFlags = new Map<string, string>();

function syncEditState(): void {
  armedId.value = edit.armedFromId();
  pending.value = edit.pendingRelation();
}

function comboIdFor(node: OntologyGraphNode): string | undefined {
  if (node.ontologyId) {
    return `ontology:${node.ontologyId}`;
  }
  if (node.glossaryId) {
    return `glossary:${node.glossaryId}`;
  }
  return undefined;
}

function toG6Data(data: OntologyGraphData): GraphData {
  const combos: Array<{ id: string; data: { label: string; colorIndex: number } }> = [];
  const comboIndex = new Map<string, number>();
  const nodes = data.nodes.map((node) => {
    const comboId = comboIdFor(node);
    if (comboId !== undefined && !comboIndex.has(comboId)) {
      comboIndex.set(comboId, combos.length);
      combos.push({ data: { colorIndex: combos.length, label: node.group ?? '' }, id: comboId });
    }
    return { combo: comboId, data: { dimmed: false, ontologyNode: node, selected: false }, id: node.id };
  });
  const edges = data.edges.map((edge) => ({
    data: { dimmed: false, ontologyEdge: edge, selected: false },
    id: edge.id,
    source: edge.source,
    target: edge.target,
  }));
  return { combos, edges, nodes };
}

function nodeFlags(node: OntologyGraphNode): { dimmed: boolean; selected: boolean } {
  const highlight = props.highlight;
  return {
    dimmed: !!highlight && !highlight.highlightedNodeIds.includes(node.id),
    selected: readOnlyNodeId.value === node.id,
  };
}

function edgeFlags(edge: OntologyGraphEdge): { dimmed: boolean; selected: boolean } {
  const highlight = props.highlight;
  return {
    dimmed: !!highlight && !highlight.highlightedEdgeKeys.includes(ontologyEdgeKey(edge)),
    selected: readOnlyEdgeId.value === edge.id,
  };
}

/** Push flag changes into the live graph (style functions read the flags). */
function syncElementStyles(): void {
  if (!graph) {
    return;
  }
  const nodeUpdates: Array<Record<string, unknown>> = [];
  for (const node of props.graph.nodes) {
    const flags = nodeFlags(node);
    const key = `n:${node.id}:${flags.selected ? 1 : 0}:${flags.dimmed ? 1 : 0}`;
    if (appliedFlags.get(`n:${node.id}`) !== key) {
      appliedFlags.set(`n:${node.id}`, key);
      nodeUpdates.push({ data: { dimmed: flags.dimmed, ontologyNode: node, selected: flags.selected }, id: node.id });
    }
  }
  if (nodeUpdates.length) {
    graph.updateNodeData(nodeUpdates);
  }
  const edgeUpdates: Array<Record<string, unknown>> = [];
  for (const edge of props.graph.edges) {
    const flags = edgeFlags(edge);
    // The label-visibility setting is part of the applied key, so a
    // showEdgeLabels flip re-pushes the edge data and the style function
    // re-evaluates the label.
    const key = `e:${edge.id}:${flags.selected ? 1 : 0}:${flags.dimmed ? 1 : 0}:${showEdgeLabels() ? 1 : 0}`;
    if (appliedFlags.get(`e:${edge.id}`) !== key) {
      appliedFlags.set(`e:${edge.id}`, key);
      edgeUpdates.push({ data: { dimmed: flags.dimmed, ontologyEdge: edge, selected: flags.selected }, id: edge.id });
    }
  }
  if (edgeUpdates.length) {
    graph.updateEdgeData(edgeUpdates);
  }
}

/** Official toLayoutEngineType (OntologyExplorer.constants.ts):
 * Hierarchical -> dagre, Circular -> circular. */
function layoutConfig(): { type: string; rankdir?: string } {
  const layout = props.settings?.layout ?? DEFAULT_ONTOLOGY_GRAPH_SETTINGS.layout;
  return layout === 'Circular' ? { type: 'circular' } : { type: 'dagre', rankdir: 'TB' };
}

function showEdgeLabels(): boolean {
  return props.settings?.showEdgeLabels ?? DEFAULT_ONTOLOGY_GRAPH_SETTINGS.showEdgeLabels;
}

async function remountGraph(): Promise<void> {
  graph?.destroy();
  graph = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  await mountGraph();
}

function getNodePositions(): Record<string, { x: number; y: number }> {
  if (!graph) {
    return {};
  }
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of graph.getNodeData()) {
    positions[node.id] = { x: node.style?.x ?? 0, y: node.style?.y ?? 0 };
  }
  return positions;
}

async function fitView(): Promise<void> {
  if (!graph) {
    return;
  }
  await graph.fitView({ direction: 'both', when: 'always' }, { duration: 300 });
  if (graph.getZoom() > PRACTICAL_MAX_ZOOM_INITIAL) {
    graph.zoomTo(PRACTICAL_MAX_ZOOM_INITIAL, { duration: 0 }, graph.getCanvasCenter());
  }
}

function clearReadOnlySelection(): void {
  const hadSelection = readOnlyNodeId.value !== null || readOnlyEdgeId.value !== null;
  readOnlyNodeId.value = null;
  readOnlyEdgeId.value = null;
  syncElementStyles();
  if (hadSelection) {
    emit('select-node', null);
    emit('select-edge', null);
  }
}

function onNodeClick(nodeId: string): void {
  if (props.canEdit) {
    if (edit.armedFromId() === null && edit.pendingRelation() === null) {
      edit.startArm(nodeId);
    } else if (edit.armedFromId() !== null) {
      edit.selectTarget(nodeId);
    }
    syncEditState();
    return;
  }
  readOnlyNodeId.value = nodeId;
  readOnlyEdgeId.value = null;
  syncElementStyles();
  emit('select-node', nodeId);
  emit('select-edge', null);
}

function onNodeDblClick(nodeId: string): void {
  if (!props.canEdit) {
    emit('node-dblclick', nodeId);
  }
}

function onEdgeClick(edgeId: string): void {
  if (props.canEdit) {
    return;
  }
  const edge = props.graph.edges.find((item) => item.id === edgeId);
  if (!edge) {
    return;
  }
  readOnlyEdgeId.value = edgeId;
  readOnlyNodeId.value = null;
  syncElementStyles();
  emit('select-edge', edge);
  emit('select-node', null);
}

function onCanvasClick(): void {
  if (props.canEdit) {
    edit.cancel();
    syncEditState();
  }
  clearReadOnlySelection();
  emit('canvas-click');
}

function onConfirm(): void {
  const confirmed = edit.confirmRelationType(relationType.value);
  syncEditState();
  if (confirmed) {
    emit('create-relation', confirmed);
  }
}

function onCancel(): void {
  edit.cancel();
  syncEditState();
}

async function applyGraphData(next: OntologyGraphData, scopeKey: string): Promise<void> {
  if (!graph) {
    return;
  }
  const sameScope = scopeKey === lastScopeKey;
  const positions = sameScope ? getNodePositions() : {};
  graph.setData(toG6Data(next));
  // setData replaces the element data (flags reset to false), so the
  // applied-flag record must restart too or sync would skip re-applying.
  appliedFlags.clear();
  await graph.render();
  if (sameScope) {
    const updates = Object.entries(positions)
      .filter(([id]) => next.nodes.some((node) => node.id === id))
      .map(([id, position]) => ({ id, style: { x: position.x, y: position.y } }));
    if (updates.length) {
      graph.updateNodeData(updates);
    }
  } else {
    lastScopeKey = scopeKey;
    await fitView();
  }
  syncElementStyles();
}

async function mountGraph(): Promise<void> {
  if (!container.value) {
    return;
  }
  try {
    const { Graph } = await import('@antv/g6');
    const width = container.value.clientWidth || 900;
    const height = container.value.clientHeight || 520;
    graph = new Graph({
      container: container.value,
      width,
      height,
      zoomRange: [MIN_ZOOM, MAX_ZOOM],
      data: toG6Data(props.graph),
      node: {
        type: 'rect',
        style: (datum) => {
          const data = (datum.data ?? {}) as {
            ontologyNode?: OntologyGraphNode;
            selected?: boolean;
            dimmed?: boolean;
          };
          const node = data.ontologyNode;
          return {
            size: [160, 40],
            radius: 6,
            fill: '#ffffff',
            stroke: data.selected ? '#005587' : node?.isolated ? '#d5d7da' : '#80afc7',
            lineWidth: data.selected ? 2 : 1,
            lineDash: node?.isolated ? [4, 4] : undefined,
            opacity: data.dimmed ? 0.25 : 1,
            labelText: node?.label ?? String(datum.id),
            labelFontSize: 12,
            labelFill: '#181d27',
          };
        },
      },
      edge: {
        type: 'line',
        style: (datum) => {
          const data = (datum.data ?? {}) as {
            ontologyEdge?: OntologyGraphEdge;
            selected?: boolean;
            dimmed?: boolean;
          };
          const edge = data.ontologyEdge;
          return {
            stroke: data.selected ? '#005587' : '#d5d7da',
            lineWidth: data.selected ? 2 : 1,
            opacity: data.dimmed ? 0.15 : 1,
            labelText: showEdgeLabels() ? (edge?.label ?? edge?.relationType ?? '') : '',
            labelFontSize: 11,
            labelFill: '#535862',
          };
        },
      },
      combo: {
        type: 'rect',
        style: (datum) => {
          const data = (datum.data ?? {}) as { label?: string; colorIndex?: number };
          const stroke = COMBO_STROKES[(data.colorIndex ?? 0) % COMBO_STROKES.length] ?? '#005587';
          return {
            fill: COMBO_FILL,
            fillOpacity: 0.6,
            stroke,
            lineWidth: 1,
            radius: 6,
            labelText: data.label ?? '',
            labelFontSize: 12,
            labelFill: '#005587',
          };
        },
      },
      layout: layoutConfig(),
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    }) as unknown as GraphLike;
    graph.on('node:click', (event) => {
      const id = event.target?.id;
      if (id) {
        onNodeClick(id);
      }
    });
    graph.on('node:dblclick', (event) => {
      const id = event.target?.id;
      if (id) {
        onNodeDblClick(id);
      }
    });
    graph.on('edge:click', (event) => {
      const id = event.target?.id;
      if (id) {
        onEdgeClick(id);
      }
    });
    graph.on('canvas:click', () => {
      onCanvasClick();
    });
    await graph.render();
    await fitView();
    syncElementStyles();
    if (typeof ResizeObserver !== 'undefined' && container.value) {
      resizeObserver = new ResizeObserver(() => {
        if (!graph || !container.value) {
          return;
        }
        graph.setSize(container.value.clientWidth, container.value.clientHeight);
      });
      resizeObserver.observe(container.value);
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('ontology.edit.canvasFailed');
  }
}

watch(
  () => props.canEdit,
  (next) => {
    if (!next) {
      edit.reset();
      syncEditState();
    } else {
      clearReadOnlySelection();
    }
  },
);

watch(
  () => props.selectedNodeId,
  (next) => {
    readOnlyNodeId.value = next ?? null;
    syncElementStyles();
  },
);

watch(
  () => props.selectedEdgeId,
  (next) => {
    readOnlyEdgeId.value = next ?? null;
    syncElementStyles();
  },
);

watch(
  () => props.highlight,
  () => {
    syncElementStyles();
  },
);

watch(
  () => props.settings,
  (next, previous) => {
    if (!graph) {
      return;
    }
    // A layout change re-lays-out the whole graph (a new layout
    // repositions everything anyway); a label-only change re-pushes the
    // edge styles in place.
    if (next?.layout !== previous?.layout) {
      void remountGraph();
    } else {
      syncElementStyles();
    }
  },
  { deep: true },
);

watch(
  () => [props.graph, props.scopeKey] as const,
  ([next, scopeKey]) => {
    void applyGraphData(next, scopeKey ?? '');
  },
  { deep: true },
);

defineExpose({
  fitView,
  zoomIn: () => graph?.zoomBy(1.2, { duration: 100 }),
  zoomOut: () => graph?.zoomBy(0.8, { duration: 100 }),
  runLayout: () => graph?.layout(),
  focusNode: (nodeId: string) => graph?.focusElement(nodeId, { duration: 0 }),
  getNodePositions,
});

onMounted(() => {
  void mountGraph();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  graph?.destroy();
  graph = null;
});
</script>

<template>
  <Card data-testid="ontology-graph-canvas" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.canvasTitle') }}</Typography.Text>
      <Typography.Text type="secondary">{{ t('ontology.edit.canvasLead') }}</Typography.Text>
      <Typography.Text v-if="loadError" type="danger">{{ loadError }}</Typography.Text>
      <div ref="container" data-testid="ontology-graph-container" style="width: 100%; height: 520px" />
      <div v-if="canEdit && armedId" data-testid="ontology-graph-armed">
        <Typography.Text>{{ t('ontology.edit.canvasArmed', { node: armedId }) }}</Typography.Text>
        <Button size="small" data-testid="ontology-graph-cancel-arm" @click="onCancel">
          {{ t('crud.cancel') }}
        </Button>
      </div>
      <div v-if="canEdit && pending" data-testid="ontology-graph-pending">
        <Typography.Text>
          {{ t('ontology.edit.canvasPending', { from: pending.fromId, to: pending.toId }) }}
        </Typography.Text>
        <Select
          v-model:value="relationType"
          style="width: 180px"
          data-testid="ontology-graph-relation-type"
        >
          <Select.Option v-for="name in HIERARCHICAL_RELATION_NAMES" :key="name" :value="name">
            {{ name }}
          </Select.Option>
        </Select>
        <Button type="primary" size="small" data-testid="ontology-graph-confirm" @click="onConfirm">
          {{ t('ontology.edit.canvasConfirmRelation') }}
        </Button>
        <Button size="small" data-testid="ontology-graph-cancel-pending" @click="onCancel">
          {{ t('crud.cancel') }}
        </Button>
      </div>
      <div v-if="!canEdit && readOnlyNodeId" data-testid="ontology-graph-selected">
        <Typography.Text>{{ selectedNodeLabel }}</Typography.Text>
        <Button size="small" data-testid="ontology-graph-clear-selection" @click="onCanvasClick">
          {{ t('crud.clear') }}
        </Button>
      </div>
      <Typography.Text v-if="!canEdit" type="secondary">{{ t('ontology.edit.canvasReadOnly') }}</Typography.Text>
    </Space>
  </Card>
</template>
