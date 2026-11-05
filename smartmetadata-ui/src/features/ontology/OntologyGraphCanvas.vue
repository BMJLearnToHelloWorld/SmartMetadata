<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Select, Space, Typography } from 'ant-design-vue';
import {
  createGraphEditState,
  HIERARCHICAL_RELATION_NAMES,
  type OntologyGraphData,
} from './ontologyGraph';

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
 */
const props = defineProps<{
  graph: OntologyGraphData;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (event: 'create-relation', payload: { fromId: string; toId: string; relationType: string }): void;
}>();

const { t } = useI18n();
const container = ref<HTMLDivElement | null>(null);
const loadError = ref('');
const edit = createGraphEditState(props.canEdit);
const armedId = ref<string | null>(null);
const pending = ref<{ fromId: string; toId: string } | null>(null);
const relationType = ref('subClassOf');

type GraphLike = {
  on: (event: string, handler: (event: { target?: { id?: string } }) => void) => void;
  setData: (data: unknown) => void;
  render: () => Promise<void>;
  destroy: () => void;
};
let graph: GraphLike | null = null;

function syncEditState(): void {
  armedId.value = edit.armedFromId();
  pending.value = edit.pendingRelation();
}

function onNodeClick(nodeId: string): void {
  if (!props.canEdit) {
    return;
  }
  if (edit.armedFromId() === null && edit.pendingRelation() === null) {
    edit.startArm(nodeId);
  } else if (edit.armedFromId() !== null) {
    edit.selectTarget(nodeId);
  }
  syncEditState();
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

async function mountGraph(): Promise<void> {
  if (!container.value) {
    return;
  }
  try {
    const { Graph } = await import('@antv/g6');
    graph = new Graph({
      container: container.value,
      width: 900,
      height: 520,
      data: {
        nodes: props.graph.nodes.map((node) => ({ id: node.id, data: { label: node.label } })),
        edges: props.graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      },
      node: {
        type: 'rect',
        style: {
          size: [160, 40],
          labelText: (datum) => String((datum.data as Record<string, unknown> | undefined)?.label ?? datum.id),
        },
      },
      edge: { type: 'line' },
      layout: { type: 'dagre', rankdir: 'TB' },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
    }) as unknown as GraphLike;
    graph.on('node:click', (event) => {
      const id = event.target?.id;
      if (id) {
        onNodeClick(id);
      }
    });
    await graph.render();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t('ontology.edit.canvasFailed');
  }
}

watch(
  () => props.graph,
  (next) => {
    if (graph) {
      graph.setData({
        nodes: next.nodes.map((node) => ({ id: node.id, data: { label: node.label } })),
        edges: next.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
      });
      void graph.render();
    }
  },
  { deep: true },
);

onMounted(() => {
  void mountGraph();
});

onBeforeUnmount(() => {
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
      <Typography.Text v-if="!canEdit" type="secondary">{{ t('ontology.edit.canvasReadOnly') }}</Typography.Text>
    </Space>
  </Card>
</template>
