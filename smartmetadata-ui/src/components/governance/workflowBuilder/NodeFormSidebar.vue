<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Drawer, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import type {
  WorkflowDefinitionFull,
  WorkflowFlowNode,
} from '@/types/governance';
import { isStartNode } from '@/utils/workflowNodeUtils';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import NodeConfigSidebar from './NodeConfigSidebar.vue';
import TaskNodeFormRenderer from './forms/TaskNodeFormRenderer.vue';

/**
 * Official NodeFormSidebar (pin a3012259ca): the drawer that hosts the
 * node forms — the start node gets the NodeConfigSidebar, every other
 * node gets the TaskNodeFormRenderer. The entity types the forms work
 * with resolve from the start node's current data assets first, then
 * the definition trigger, then 'all'.
 */
const props = defineProps<{
  node: WorkflowFlowNode | null;
  isOpen: boolean;
  onClose: () => void;
}>();

const { t } = useI18n();
const builder = useWorkflowBuilderContext();

function getTriggerConfig(definition?: WorkflowDefinitionFull | null) {
  const trigger = definition?.trigger;
  if (!trigger || typeof trigger !== 'object' || Array.isArray(trigger)) {
    return null;
  }
  return (trigger as { config?: Record<string, unknown> }).config ?? null;
}

function getEntityTypesFromTriggerConfig(
  triggerConfig: Record<string, unknown> | null,
): string[] | null {
  if (!triggerConfig) {
    return null;
  }
  const multipleEntityTypes = triggerConfig.entityTypes;
  if (multipleEntityTypes && Array.isArray(multipleEntityTypes)) {
    return multipleEntityTypes as string[];
  }
  const singleEntityType = triggerConfig.entityType;
  if (singleEntityType) {
    return [singleEntityType as string];
  }
  return null;
}

function resolveEntityTypes(
  definition?: WorkflowDefinitionFull | null,
  currentDataAssets?: string[],
): string[] {
  if (currentDataAssets && currentDataAssets.length > 0) {
    return currentDataAssets;
  }
  const triggerEntityTypes = getEntityTypesFromTriggerConfig(
    getTriggerConfig(definition),
  );
  if (triggerEntityTypes) {
    return triggerEntityTypes;
  }
  return ['all'];
}

const entityTypes = computed(() => {
  const startNode = builder.state.state.nodes.find((n) => isStartNode(n));
  const dataAssets = (startNode?.data?.dataAssets as string[] | undefined) ?? [];
  return resolveEntityTypes(builder.state.state.workflowDefinition, dataAssets);
});

const nodeTitle = computed(() =>
  props.node && isStartNode(props.node)
    ? t('workflows.builder.workflowConfiguration')
    : props.node?.data?.displayName ||
      props.node?.data?.label ||
      t('workflows.builder.nodeConfiguration'),
);

function handleDeleteNode(nodeId: string): void {
  builder.state.setNodes(
    builder.state.state.nodes.filter((n) => n.id !== nodeId),
  );
  builder.state.setEdges(
    builder.state.state.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    ),
  );
  const definition = builder.state.state.workflowDefinition;
  if (definition) {
    builder.state.setWorkflowDefinition({
      ...definition,
      nodes: (definition.nodes ?? []).filter((n) => n.name !== nodeId),
      edges: (definition.edges ?? []).filter(
        (e) => e.from !== nodeId && e.to !== nodeId,
      ),
    });
  }
  props.onClose();
}
</script>

<template>
  <NodeConfigSidebar
    v-if="node && isStartNode(node)"
    :node="node"
    :is-open="isOpen"
    :on-close="onClose"
  />
  <Drawer
    v-else-if="node"
    :open="isOpen"
    width="640"
    :closable="false"
    @close="onClose"
  >
    <template #title>
      <Typography.Text style="font-size: 14px; font-weight: 600; color: var(--sm-color-primary)">
        {{ nodeTitle }}
      </Typography.Text>
    </template>
    <TaskNodeFormRenderer
      :node="node"
      :entity-types="entityTypes"
      :is-enforce-mode="builder.isEnforceMode"
      :on-close="onClose"
      :on-delete="handleDeleteNode"
      :on-save="builder.handleNodeConfigSave"
    />
  </Drawer>
</template>
