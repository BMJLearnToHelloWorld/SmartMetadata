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
import { computed } from 'vue';
import { Divider } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowNodeSubType } from '@/types/governance';
import { NODE_TYPE_MAPPINGS } from '@/constants/workflowBuilder';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import { getWorkflowNodeIcon } from '@/utils/workflowNodeIcon';

/**
 * Official WorkflowSidebar (pin a3012259ca), ported to Vue + antd. The
 * palette lists the start/end events, automated tasks, sinks (Git Sink is
 * Beta), and user tasks from NODE_TYPE_MAPPINGS; dragging an item writes
 * the node type and label to the dataTransfer under the same keys official
 * uses ('application/reactflow' / 'application/reactflow-label'), which
 * the canvas drop handler reads.
 *
 * The palette itself is gated by the page (renderSidebar: only when
 * canAccessSidebar && showWorkflowNodePalette) — in the OSS build
 * showWorkflowNodePalette is false, so this component never renders there;
 * it is ported with the same gating, present in the tree, not live
 * behavior. Items are individually disabled via isNodeDragEnabled.
 */

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isNodeDragEnabled = builder.logic.isNodeDragEnabled;

interface PaletteItem {
  icon: ReturnType<typeof getWorkflowNodeIcon>;
  label: string;
  type: WorkflowNodeSubType;
  isBeta?: boolean;
}

function toPaletteItem(
  subType: WorkflowNodeSubType,
  isBeta = false,
): PaletteItem {
  const mapping = NODE_TYPE_MAPPINGS[subType];
  return {
    icon: getWorkflowNodeIcon(subType),
    // The palette only iterates the map's own keys, so the lookup always
    // hits; the fallback only satisfies the Partial index type.
    label: mapping?.label ?? subType,
    type: subType,
    isBeta,
  };
}

const automatedTasks = computed<PaletteItem[]>(() =>
  (Object.entries(NODE_TYPE_MAPPINGS) as [WorkflowNodeSubType, (typeof NODE_TYPE_MAPPINGS)[WorkflowNodeSubType]][])
    .filter(
      ([, mapping]) =>
        mapping?.type === 'automatedTask' && !(mapping && 'category' in mapping),
    )
    .map(([subType]) => toPaletteItem(subType)),
);

const sinkTasks = computed<PaletteItem[]>(() =>
  (Object.entries(NODE_TYPE_MAPPINGS) as [WorkflowNodeSubType, (typeof NODE_TYPE_MAPPINGS)[WorkflowNodeSubType]][])
    .filter(
      ([, mapping]) => mapping && 'category' in mapping && mapping.category === 'sink',
    )
    .map(([subType]) => toPaletteItem(subType, subType === 'sinkTask')),
);

const userTasks = computed<PaletteItem[]>(() =>
  (Object.entries(NODE_TYPE_MAPPINGS) as [WorkflowNodeSubType, (typeof NODE_TYPE_MAPPINGS)[WorkflowNodeSubType]][])
    .filter(([, mapping]) => mapping?.type === 'userTask')
    .map(([subType]) => toPaletteItem(subType)),
);

const isStartDisabled = computed(
  () => !isNodeDragEnabled('startEvent'),
);
const isEndDisabled = computed(() => !isNodeDragEnabled('endEvent'));

function onDragStart(
  event: DragEvent,
  subType: WorkflowNodeSubType,
  label: string,
): void {
  const mapping = NODE_TYPE_MAPPINGS[subType];
  const customNodeType = mapping?.type || 'automatedTask';
  if (!event.dataTransfer) {
    return;
  }
  event.dataTransfer.setData('application/reactflow', customNodeType);
  event.dataTransfer.setData('application/reactflow-label', label);
  event.dataTransfer.effectAllowed = 'move';
}

function onItemDragStart(
  event: DragEvent,
  item: PaletteItem,
  disabled: boolean,
): void {
  if (disabled) {
    event.preventDefault();
    return;
  }
  onDragStart(event, item.type, item.label);
}

function onEventDragStart(
  event: DragEvent,
  subType: WorkflowNodeSubType,
  label: string,
  disabled: boolean,
): void {
  if (disabled) {
    event.preventDefault();
    return;
  }
  onDragStart(event, subType, label);
}
</script>

<template>
  <div class="workflow-sidebar" data-testid="workflow-node-sidebar">
    <p class="workflow-sidebar__hint">{{ t('workflows.builder.dragAndDropNodes') }}</p>
    <Divider class="workflow-sidebar__divider" />

    <div class="workflow-sidebar__events">
      <div
        class="workflow-sidebar__event"
        :class="{ 'workflow-sidebar__event--disabled': isStartDisabled }"
        data-testid="workflow-start-node-draggable"
        :draggable="!isStartDisabled"
        @dragstart="onEventDragStart($event, 'startEvent', t('workflows.builder.start'), isStartDisabled)"
      >
        <component
          :is="getWorkflowNodeIcon('startEvent').icon"
          :style="{ color: getWorkflowNodeIcon('startEvent').color }"
        />
        <p class="workflow-sidebar__event-label">{{ t('workflows.builder.start') }}</p>
      </div>

      <div
        class="workflow-sidebar__event"
        :class="{ 'workflow-sidebar__event--disabled': isEndDisabled }"
        data-testid="workflow-end-node-draggable"
        :draggable="!isEndDisabled"
        @dragstart="onEventDragStart($event, 'endEvent', t('workflows.builder.end'), isEndDisabled)"
      >
        <component
          :is="getWorkflowNodeIcon('endEvent').icon"
          :style="{ color: getWorkflowNodeIcon('endEvent').color }"
        />
        <p class="workflow-sidebar__event-label">{{ t('workflows.builder.end') }}</p>
      </div>
    </div>

    <p class="workflow-sidebar__section-title">{{ t('workflows.builder.automatedTasks') }}</p>
    <div class="workflow-sidebar__section" data-testid="workflow-automated-tasks-section">
      <div
        v-for="task in automatedTasks"
        :key="task.type"
        class="workflow-sidebar__item"
        :class="{ 'workflow-sidebar__item--disabled': !isNodeDragEnabled(task.type) }"
        :data-testid="`workflow-task-item-${task.type}`"
        :draggable="isNodeDragEnabled(task.type)"
        @dragstart="onItemDragStart($event, task, !isNodeDragEnabled(task.type))"
      >
        <span class="workflow-sidebar__item-icon">
          <component :is="task.icon.icon" :style="{ color: task.icon.color }" />
        </span>
        <span class="workflow-sidebar__item-label">{{ task.label }}</span>
        <span v-if="task.isBeta" class="workflow-sidebar__beta">{{ t('shared.beta') }}</span>
        <PlusOutlined class="workflow-sidebar__item-plus" />
      </div>
    </div>

    <p class="workflow-sidebar__section-title">{{ t('workflows.builder.sinks') }}</p>
    <div class="workflow-sidebar__section" data-testid="workflow-sinks-section">
      <div
        v-for="task in sinkTasks"
        :key="task.type"
        class="workflow-sidebar__item"
        :class="{ 'workflow-sidebar__item--disabled': !isNodeDragEnabled(task.type) }"
        :data-testid="`workflow-task-item-${task.type}`"
        :draggable="isNodeDragEnabled(task.type)"
        @dragstart="onItemDragStart($event, task, !isNodeDragEnabled(task.type))"
      >
        <span class="workflow-sidebar__item-icon">
          <component :is="task.icon.icon" :style="{ color: task.icon.color }" />
        </span>
        <span class="workflow-sidebar__item-label">{{ task.label }}</span>
        <span v-if="task.isBeta" class="workflow-sidebar__beta">{{ t('shared.beta') }}</span>
        <PlusOutlined class="workflow-sidebar__item-plus" />
      </div>
    </div>

    <p class="workflow-sidebar__section-title">{{ t('workflows.builder.userTasks') }}</p>
    <div class="workflow-sidebar__section" data-testid="workflow-user-tasks-section">
      <div
        v-for="task in userTasks"
        :key="task.type"
        class="workflow-sidebar__item"
        :class="{ 'workflow-sidebar__item--disabled': !isNodeDragEnabled(task.type) }"
        :data-testid="`workflow-task-item-${task.type}`"
        :draggable="isNodeDragEnabled(task.type)"
        @dragstart="onItemDragStart($event, task, !isNodeDragEnabled(task.type))"
      >
        <span class="workflow-sidebar__item-icon">
          <component :is="task.icon.icon" :style="{ color: task.icon.color }" />
        </span>
        <span class="workflow-sidebar__item-label">{{ task.label }}</span>
        <span v-if="task.isBeta" class="workflow-sidebar__beta">{{ t('shared.beta') }}</span>
        <PlusOutlined class="workflow-sidebar__item-plus" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-sidebar {
  padding: 0 0 16px;
}

.workflow-sidebar__hint {
  margin: 0;
  padding: 10px 18px;
  font-size: 12px;
  font-weight: 600;
  color: var(--sm-text-primary);
}

.workflow-sidebar__divider {
  margin: 0;
}

.workflow-sidebar__events {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
}

.workflow-sidebar__event {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 112px;
  height: 60px;
  font-size: 16px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  cursor: grab;
  transition: box-shadow 0.2s ease;
}

.workflow-sidebar__event:hover {
  box-shadow: 0 1px 4px rgb(16 24 40 / 0.12);
}

.workflow-sidebar__event--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.workflow-sidebar__event-label {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sm-text-primary);
}

.workflow-sidebar__section-title {
  margin: 8px 0 16px;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sm-text-secondary);
}

.workflow-sidebar__section {
  margin-bottom: 24px;
  padding: 0 14px;
}

.workflow-sidebar__item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-radius-card, 6px);
  cursor: grab;
}

.workflow-sidebar__item:hover {
  box-shadow: 0 1px 4px rgb(16 24 40 / 0.08);
}

.workflow-sidebar__item--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.workflow-sidebar__item-icon {
  display: flex;
  align-items: center;
  margin-right: 8px;
  font-size: 16px;
}

.workflow-sidebar__item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sm-text-primary);
}

.workflow-sidebar__beta {
  margin-right: 8px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 20px;
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-radius: 999px;
}

.workflow-sidebar__item-plus {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--sm-text-quaternary);
}
</style>
