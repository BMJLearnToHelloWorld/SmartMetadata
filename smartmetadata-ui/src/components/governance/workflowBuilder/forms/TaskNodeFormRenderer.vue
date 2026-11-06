<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { WorkflowFlowNode } from '@/types/governance';
import CheckChangeDescriptionForm from './CheckChangeDescriptionForm.vue';
import CheckConditionForm from './CheckConditionForm.vue';
import CollectMetadataForm from './CollectMetadataForm.vue';
import DataCompletenessForm from './DataCompletenessForm.vue';
import EndNodeForm from './EndNodeForm.vue';
import RevertBackForm from './RevertBackForm.vue';
import SchemaBasedNodeForm from './SchemaBasedNodeForm.vue';
import SetActionForm from './SetActionForm.vue';
import SinkTaskForm from './SinkTaskForm.vue';
import UserApprovalForm from './UserApprovalForm.vue';

/**
 * Official TaskNodeFormRenderer (pin a3012259ca): dispatches on the node
 * subtype — the end node and the 8 dedicated forms each get their own
 * component; every other subtype falls back to the read-only
 * SchemaBasedNodeForm. Only the approval form receives isEnforceMode.
 * entityTypes comes from the sidebar (start-node data assets, else the
 * definition trigger, else 'all'); the check-condition form falls back
 * to ['all'] on its own when the sidebar passes nothing.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  isEnforceMode: boolean;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  entityTypes?: string[];
}>();
</script>

<template>
  <EndNodeForm
    v-if="node.data?.subType === 'endEvent'"
    :node="node"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <SetActionForm
    v-else-if="node.data?.subType === 'setEntityAttributeTask'"
    :node="node"
    :entity-types="entityTypes"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <CheckConditionForm
    v-else-if="node.data?.subType === 'checkEntityAttributesTask'"
    :node="node"
    :entity-types="entityTypes || ['all']"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <CheckChangeDescriptionForm
    v-else-if="node.data?.subType === 'checkChangeDescriptionTask'"
    :node="node"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <DataCompletenessForm
    v-else-if="node.data?.subType === 'dataCompletenessTask'"
    :node="node"
    :entity-types="entityTypes"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <RevertBackForm
    v-else-if="node.data?.subType === 'rollbackEntityTask'"
    :node="node"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <CollectMetadataForm
    v-else-if="node.data?.subType === 'collectMetadataTask'"
    :node="node"
    :entity-types="entityTypes"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <UserApprovalForm
    v-else-if="node.data?.subType === 'userApprovalTask'"
    :node="node"
    :is-enforce-mode="isEnforceMode"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <SinkTaskForm
    v-else-if="node.data?.subType === 'sinkTask'"
    :node="node"
    :on-close="onClose"
    :on-delete="onDelete"
    :on-save="onSave"
  />
  <SchemaBasedNodeForm v-else :node="node" :on-close="onClose" />
</template>
