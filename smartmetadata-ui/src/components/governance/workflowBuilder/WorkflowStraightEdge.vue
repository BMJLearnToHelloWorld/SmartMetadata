<script setup lang="ts">
/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref } from 'vue';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  useVueFlow,
} from '@vue-flow/core';
import { useI18n } from 'vue-i18n';
import { CloseOutlined } from '@ant-design/icons-vue';
import type { WorkflowFlowEdge } from '@/types/governance';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';

/**
 * Official StraightEdge (pin a3012259ca), ported to Vue Flow: a clean
 * straight path with 8px rounded corners when the endpoints differ in Y, a
 * themed condition label (StartCase display), parallel-edge label offsets
 * (44px gap), and a hover delete button gated by structural edits. The
 * delete callback arrives in the edge data, injected by the canvas render
 * mapping exactly as official does.
 */

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  label?: string;
  markerEnd?: Record<string, unknown>;
  style?: Record<string, unknown>;
  labelStyle?: Record<string, unknown>;
  labelBgStyle?: Record<string, unknown>;
  data?: WorkflowFlowEdge['data'];
}>();

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const { edges } = useVueFlow();
const isHovered = ref(false);

const PARALLEL_LABEL_GAP = 44;

const sameDirectionEdges = computed(() =>
  (edges.value ?? []).filter(
    (edge) => edge.source === props.source && edge.target === props.target,
  ),
);
const parallelCount = computed(() => sameDirectionEdges.value.length);
const parallelIndex = computed(() => {
  const index = sameDirectionEdges.value.findIndex(
    (edge) => edge.id === props.id,
  );
  return index === -1 ? 0 : index;
});

const isHorizontalEdge = computed(
  () => Math.abs(props.sourceY - props.targetY) < 10,
);

function getCleanStraightPath(): [string, number, number] {
  const adjustedSourceX =
    props.sourcePosition === Position.Right
      ? props.sourceX + 10
      : props.sourceX - 10;
  const adjustedTargetX =
    props.targetPosition === Position.Left
      ? props.targetX - 10
      : props.targetX + 10;

  if (Math.abs(props.sourceY - props.targetY) < 10) {
    const path = `M ${adjustedSourceX} ${props.sourceY} L ${adjustedTargetX} ${props.targetY}`;
    const labelX = adjustedSourceX + (adjustedTargetX - adjustedSourceX) / 2;
    return [path, labelX, props.sourceY];
  }

  const midX = adjustedSourceX + (adjustedTargetX - adjustedSourceX) / 2;
  const radius = 8;
  const corner1X = midX - radius;
  const corner2X = midX + radius;
  const direction = props.targetY > props.sourceY ? 1 : -1;
  const startCurveY = props.sourceY + direction * radius;
  const endCurveY = props.targetY - direction * radius;
  const path = [
    `M ${adjustedSourceX} ${props.sourceY}`,
    `L ${corner1X} ${props.sourceY}`,
    `Q ${midX} ${props.sourceY} ${midX} ${startCurveY}`,
    `L ${midX} ${endCurveY}`,
    `Q ${midX} ${props.targetY} ${corner2X} ${props.targetY}`,
    `L ${adjustedTargetX} ${props.targetY}`,
  ].join(' ');
  return [path, midX, props.sourceY + (props.targetY - props.sourceY) / 2];
}

// lodash startCase + capitalize, reimplemented locally: the product has no
// lodash dependency, and the label set here is small (approve/reject/
// TRUE/FALSE/quality-band names).
function formatEdgeLabel(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const pathInfo = computed(() => getCleanStraightPath());
const path = computed(() => pathInfo.value[0]);
const labelX = computed(() => pathInfo.value[1]);
const labelY = computed(() => pathInfo.value[2]);
const stackedLabelY = computed(() => {
  const offset =
    parallelCount.value > 1
      ? (parallelIndex.value - (parallelCount.value - 1) / 2) *
        PARALLEL_LABEL_GAP
      : 0;
  return labelY.value + offset;
});

const displayLabel = computed(() =>
  typeof props.label === 'string' && props.label.length > 0
    ? formatEdgeLabel(props.label)
    : props.label,
);

const hasStyleOverrides = computed(
  () => Boolean(props.labelBgStyle?.fill) || Boolean(props.labelStyle?.color),
);
const labelStyleOverrides = computed(() =>
  hasStyleOverrides.value
    ? {
        backgroundImage: props.labelBgStyle?.fill
          ? `linear-gradient(${props.labelBgStyle.fill as string}, ${props.labelBgStyle.fill as string})`
          : undefined,
        borderColor: props.labelBgStyle?.stroke as string | undefined,
        color: props.labelStyle?.color as string | undefined,
        ...(props.labelStyle as Record<string, string> | undefined),
      }
    : undefined,
);

const showDeleteButton = computed(
  () =>
    isHovered.value &&
    builder.mode.allowStructuralGraphEdits.value &&
    Boolean(props.data?.onEdgeDelete),
);

const deleteButtonTransform = computed(() => {
  const x =
    props.label && isHorizontalEdge.value ? labelX.value + 48 : labelX.value;
  const y =
    props.label && !isHorizontalEdge.value
      ? stackedLabelY.value - 36
      : stackedLabelY.value;
  return `translate(-50%, -50%) translate(${x}px, ${y}px)`;
});

function handleDelete(event: MouseEvent): void {
  event.stopPropagation();
  props.data?.onEdgeDelete?.(props.id);
}
</script>

<template>
  <BaseEdge
    :id="props.id"
    :path="path"
    :marker-end="props.markerEnd as never"
    :style="props.style as never"
  />
  <path
    :d="path"
    fill="none"
    stroke="transparent"
    :stroke-width="20"
    style="pointer-events: all"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  />
  <EdgeLabelRenderer>
    <div
      v-if="props.label"
      class="workflow-edge-label"
      :class="{ 'workflow-edge-label--clickable': hasStyleOverrides }"
      role="presentation"
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${stackedLabelY}px)`,
        pointerEvents: 'all',
        ...labelStyleOverrides,
      }"
      @mouseenter="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <span class="workflow-edge-label__text">{{ displayLabel }}</span>
    </div>
    <div
      v-if="showDeleteButton"
      class="workflow-edge-delete"
      :style="{ transform: deleteButtonTransform }"
    >
      <button
        type="button"
        class="workflow-edge-delete__button"
        :aria-label="t('crud.delete')"
        :title="t('crud.delete')"
        @click="handleDelete"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
        <CloseOutlined />
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.workflow-edge-label {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-secondary);
  border-radius: 4px;
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.05);
}

.workflow-edge-label--clickable {
  cursor: pointer;
}

.workflow-edge-label__text {
  font-size: 12px;
  font-weight: 600;
}

.workflow-edge-delete {
  position: absolute;
  pointer-events: auto;
}

.workflow-edge-delete__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--sm-color-error-text);
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgb(16 24 40 / 0.08);
  cursor: pointer;
}
</style>
