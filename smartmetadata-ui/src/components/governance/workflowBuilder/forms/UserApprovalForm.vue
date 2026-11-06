<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Checkbox, Input, Switch, Tooltip, Typography } from 'ant-design-vue';
import { InfoCircleOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import type { EntityRef } from '@/types/api';
import { DEFAULT_USER_APPROVAL_TRANSITIONS } from '@/constants/workflowBuilder';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';
import ModeAwareFormField from './ModeAwareFormField.vue';
import UserTeamPicker from './UserTeamPicker.vue';
import WorkflowFormField from './WorkflowFormField.vue';

/**
 * Official UserApprovalForm (pin a3012259ca): name, description, who
 * approves (owners and reviewers are tracked separately from additional
 * approvers), thresholds, and — only when the workflow enforces approval
 * — whether a partial decision may still complete the step. The saved
 * transition pair is preserved when one was already stored; otherwise
 * the approve / reject pair is stored.
 */
const props = defineProps<{
  node: WorkflowFlowNode;
  isEnforceMode: boolean;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
  onSave: (nodeId: string, config: Record<string, unknown>) => void;
}>();

const { t } = useI18n();

interface UserApprovalFormState {
  displayName: string;
  description: string;
  approvalThreshold: number;
  rejectionThreshold: number;
  addReviewers: boolean;
  addOwners: boolean;
  emptyAssigneeStrategy: string;
  candidates: EntityRef[];
  allowPartialDecisions: boolean;
}

function buildInitialState(node: WorkflowFlowNode): UserApprovalFormState {
  const config = (node.data?.config ?? {}) as Record<string, unknown>;
  // Official shape (UserApprovalForm.tsx:88-111, userApprovalTask.json:41):
  // the approver settings live under config.assignees, never flat on config.
  const assignees = (config.assignees ?? {}) as {
    addReviewers?: boolean;
    addOwners?: boolean;
    emptyAssigneeStrategy?: string;
    candidates?: EntityRef[];
  };
  return {
    displayName: node.data?.displayName || node.data?.label || '',
    description: node.data?.description || '',
    approvalThreshold: (config.approvalThreshold as number) || 1,
    rejectionThreshold: (config.rejectionThreshold as number) || 1,
    addReviewers: assignees.addReviewers ?? true,
    addOwners: assignees.addOwners ?? false,
    emptyAssigneeStrategy: assignees.emptyAssigneeStrategy || 'none',
    candidates: Array.isArray(assignees.candidates) ? assignees.candidates : [],
    allowPartialDecisions: Boolean(config.allowPartialDecisions),
  };
}

const state = ref<UserApprovalFormState>(buildInitialState(props.node));

function syncFromNode(): void {
  state.value = buildInitialState(props.node);
}
watch(() => props.node.id, syncFromNode, { immediate: true });

function handleSave(): void {
  const savedConfig = (props.node.data?.config ?? {}) as Record<string, unknown>;
  const savedAssignees = (savedConfig.assignees ?? {}) as Record<string, unknown>;
  const savedTransitionMetadata = savedConfig.transitionMetadata;
  const transitionMetadata =
    Array.isArray(savedTransitionMetadata) && savedTransitionMetadata.length > 0
      ? savedTransitionMetadata
      : DEFAULT_USER_APPROVAL_TRANSITIONS;
  const candidatesPayload = state.value.candidates.map((candidate) => ({
    id: candidate.id,
    type: candidate.type ?? 'user',
    fullyQualifiedName: candidate.fullyQualifiedName,
    name: candidate.name,
  }));
  // Drop stale flat assignee keys a previous product save may have left at the
  // top level: the canonical shape nests them under config.assignees
  // (userApprovalTask.json, additionalProperties: false).
  const cleanSavedConfig: Record<string, unknown> = { ...savedConfig };
  delete cleanSavedConfig.addReviewers;
  delete cleanSavedConfig.addOwners;
  delete cleanSavedConfig.emptyAssigneeStrategy;
  delete cleanSavedConfig.candidates;
  props.onSave(
    props.node.id,
    createNodeConfig({
      displayName: state.value.displayName,
      description: state.value.description,
      type: 'userTask',
      subType: 'userApprovalTask',
      config: {
        ...cleanSavedConfig,
        approvalThreshold: state.value.approvalThreshold,
        rejectionThreshold: state.value.rejectionThreshold,
        allowPartialDecisions:
          props.isEnforceMode && state.value.allowPartialDecisions,
        assignees: {
          ...savedAssignees,
          addReviewers: state.value.addReviewers,
          addOwners: state.value.addOwners,
          emptyAssigneeStrategy: state.value.emptyAssigneeStrategy,
          candidates: candidatesPayload,
        },
        transitionMetadata,
      },
    }),
  );
  props.onClose();
}

function handleDelete(): void {
  props.onDelete?.(props.node.id);
  props.onClose();
}
</script>

<template>
  <div style="flex: 1; display: flex; flex-direction: column">
    <MetadataFormSection
      :is-start-node="false"
      :name="state.displayName"
      :description="state.description"
      :on-name-change="(value) => { state.displayName = value; }"
      :on-description-change="(value) => { state.description = value; }"
    />

    <WorkflowFormField
      :label="t('workflows.builder.approvalThreshold')"
      :description="t('workflows.builder.approvalThresholdHint')"
    >
      <Input
        type="number"
        :value="String(state.approvalThreshold)"
        @update:value="
          (value) => { state.approvalThreshold = value === '' ? 0 : parseInt(String(value)) || 0; }
        "
      />
    </WorkflowFormField>

    <WorkflowFormField
      :label="t('workflows.builder.rejectionThreshold')"
      :description="t('workflows.builder.rejectionThresholdHint')"
    >
      <Input
        type="number"
        :value="String(state.rejectionThreshold)"
        @update:value="
          (value) => { state.rejectionThreshold = value === '' ? 0 : parseInt(String(value)) || 0; }
        "
      />
    </WorkflowFormField>

    <WorkflowFormField
      v-if="isEnforceMode"
      :label="t('workflows.builder.allowPartialDecisions')"
      :description="t('workflows.builder.allowPartialDecisionsHint')"
    >
      <Switch
        :checked="state.allowPartialDecisions"
        @change="(value) => { state.allowPartialDecisions = Boolean(value); }"
      />
    </WorkflowFormField>

    <WorkflowFormField :label="t('workflows.builder.approvers')">
      <div style="display: flex; align-items: center; gap: 8px">
        <Checkbox
          :checked="state.addReviewers"
          @change="(e) => { state.addReviewers = Boolean((e.target as HTMLInputElement).checked); }"
        >
          {{ t('workflows.builder.reviewers') }}
        </Checkbox>
        <Tooltip :title="t('workflows.builder.approversTooltip')">
          <InfoCircleOutlined />
        </Tooltip>
      </div>
      <div>
        <Checkbox
          :checked="state.addOwners"
          @change="(e) => { state.addOwners = Boolean((e.target as HTMLInputElement).checked); }"
        >
          {{ t('workflows.builder.owners') }}
        </Checkbox>
      </div>
      <Typography.Paragraph type="secondary" style="margin: 0; font-size: 14px">
        {{ t('workflows.builder.noReviewersInfo') }}
      </Typography.Paragraph>
    </WorkflowFormField>

    <WorkflowFormField
      :label="t('workflows.builder.additionalApprovers')"
      :description="t('workflows.builder.approverUsersHelper')"
    >
      <ModeAwareFormField v-slot="{ disabled }">
        <UserTeamPicker
          v-model="state.candidates"
          :disabled="disabled"
          test-id="user-approval-candidates-trigger"
        />
      </ModeAwareFormField>
    </WorkflowFormField>

    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="!isValidString(state.displayName)"
      :on-cancel="onClose"
      :on-delete="handleDelete"
      :on-save="handleSave"
    />
  </div>
</template>
