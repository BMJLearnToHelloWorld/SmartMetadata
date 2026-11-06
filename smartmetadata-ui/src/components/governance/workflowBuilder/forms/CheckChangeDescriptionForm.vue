<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type {
  WorkflowCheckChangeDescConditionPayload,
  WorkflowFlowNode,
} from '@/types/governance';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import {
  buildConditionBuilderPayload,
  parseConditionBuilderPayload,
} from '@/utils/conditionBuilderTransformer';
import ConditionBuilder from './ConditionBuilder.vue';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';

/**
 * Official CheckChangeDescriptionForm (pin a3012259ca): name + description
 * + the condition builder. Saving re-parses legacy payloads (config.include
 * or a rules object) through the transformer so what is stored is always
 * the normalized {condition, rules} shape; a node with neither stores no
 * config at all.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
}>();

const displayName = ref('');
const description = ref('');
const conditionPayload = ref<WorkflowCheckChangeDescConditionPayload | null>(null);

function syncFromNode(): void {
  displayName.value = props.node.data?.displayName || props.node.data?.label || '';
  description.value = props.node.data?.description || '';
  const cfg = props.node.data?.config as
    | { rules?: unknown; include?: unknown }
    | undefined;
  if (cfg && typeof cfg === 'object' && (cfg.rules || cfg.include)) {
    conditionPayload.value = { config: cfg } as WorkflowCheckChangeDescConditionPayload;
  } else {
    conditionPayload.value = null;
  }
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function handleSave(): void {
  let configPayload = conditionPayload.value?.config as
    | { condition?: 'AND' | 'OR'; rules?: unknown; include?: unknown }
    | undefined;
  const hasLegacyInclude = (configPayload as { include?: unknown } | undefined)
    ?.include;
  const hasRulesObject =
    configPayload?.rules &&
    typeof configPayload.rules === 'object' &&
    !Array.isArray(configPayload.rules);
  if (configPayload && (hasLegacyInclude || hasRulesObject)) {
    const parsed = parseConditionBuilderPayload({
      config: configPayload,
    } as WorkflowCheckChangeDescConditionPayload);
    configPayload = buildConditionBuilderPayload(
      parsed.condition,
      parsed.rows,
    ).config;
  }
  props.onSave(
    props.node.id,
    createNodeConfig({
      displayName: displayName.value,
      description: description.value,
      type: 'automatedTask',
      subType: 'checkChangeDescriptionTask',
      ...(configPayload && {
        config: {
          condition: configPayload.condition,
          rules: configPayload.rules ?? {},
        },
      }),
    }),
  );
  props.onClose();
}

function handleDeleteNode(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="displayName"
      :description="description"
      :on-name-change="(value) => { displayName = value; }"
      :on-description-change="(value) => { description = value; }"
    />
    <ConditionBuilder
      :show-condition="true"
      :data-testid="'check-change-desc-condition-builder'"
      :value="conditionPayload"
      :on-change="(payload) => { conditionPayload = payload; }"
    />
    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="!isValidString(displayName)"
      :on-cancel="onClose"
      :on-delete="handleDeleteNode"
      :on-save="handleSave"
    />
  </div>
</template>
