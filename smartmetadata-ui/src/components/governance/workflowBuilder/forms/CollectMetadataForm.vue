<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Radio, Tag, Typography } from 'ant-design-vue';
import { ArrowRightOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { WorkflowFlowNode } from '@/types/governance';
import type { EntityRef } from '@/types/api';
import { getRequiredFieldLabel } from '@/utils/workflowConfig';
import { createNodeConfig, isValidString } from '@/utils/workflowBuilderUtils';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import AskedGroupWarning from './AskedGroupWarning.vue';
import FormActionButtons from './FormActionButtons.vue';
import MetadataFormSection from './MetadataFormSection.vue';
import ModeAwareFormField from './ModeAwareFormField.vue';
import QueryBuilderSection from './QueryBuilderSection.vue';
import UserTeamPicker from './UserTeamPicker.vue';
import WorkflowFormField from './WorkflowFormField.vue';

/**
 * Official CollectMetadataForm (pin a3012259ca): the stage, its required
 * fields and its conditions belong to the lifecycle that compiled this
 * node, so they are shown read-only; who is asked to complete them can
 * change here. Assignees: owners / reviewers (hidden when the workflow
 * covers domains) / specific users and teams. A step that only closes a
 * revision request (revision 'resubmit') asks nobody.
 */
const props = withDefaults(
  defineProps<{
    node: WorkflowFlowNode;
    entityTypes?: string[];
    onSave: (nodeId: string, config: Record<string, unknown>) => void;
    onClose: () => void;
    onDelete?: (nodeId: string) => void;
  }>(),
  { entityTypes: undefined },
);

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const isFormDisabled = builder.mode.isFormDisabled;

interface CollectConfig {
  stage?: string;
  targetStage?: string;
  fields?: { field: string }[];
  revision?: 'request' | 'resubmit';
  conditions?: string;
  taskAssignees?: 'owners' | 'reviewers' | 'candidates';
  candidates?: EntityRef[];
}

const config = computed<CollectConfig>(
  () => (props.node.data?.config ?? {}) as CollectConfig,
);

const displayName = ref('');
const description = ref('');
const taskAssignees = ref<'owners' | 'reviewers' | 'candidates'>('owners');
const candidates = ref<EntityRef[]>([]);

function syncFromNode(): void {
  const nodeConfig = (props.node.data?.config ?? {}) as CollectConfig;
  displayName.value = props.node.data?.displayName ?? props.node.data?.label ?? '';
  description.value = props.node.data?.description ?? '';
  taskAssignees.value = nodeConfig.taskAssignees ?? 'owners';
  candidates.value = (nodeConfig.candidates ?? []) as EntityRef[];
}
watch(() => props.node.id, syncFromNode, { immediate: true });

/** Whether the node asks specific users or teams; a step closing a revision request asks nobody. */
function asksCandidates(cfg: CollectConfig, assignees: string): boolean {
  return cfg.revision !== 'resubmit' && assignees === 'candidates';
}

const ASSIGNEE_ORDER = ['owners', 'reviewers', 'candidates'] as const;
const ASSIGNEE_LABEL_KEYS: Record<string, string> = {
  owners: 'workflows.builder.owners',
  reviewers: 'workflows.builder.reviewers',
  candidates: 'workflows.builder.specificUsersAndTeams',
};

const assigneeOptions = computed(() =>
  ASSIGNEE_ORDER.filter(
    (assignees) =>
      assignees !== 'reviewers' || !props.entityTypes?.includes('domain'),
  ).map((assignees) => ({
    value: assignees,
    label: t(ASSIGNEE_LABEL_KEYS[assignees]),
  })),
);

function handleSave(): void {
  props.onSave(
    props.node.id,
    createNodeConfig({
      displayName: displayName.value,
      description: description.value,
      type: 'automatedTask',
      subType: 'collectMetadataTask',
      config: {
        ...config.value,
        taskAssignees: taskAssignees.value,
        candidates: asksCandidates(config.value, taskAssignees.value)
          ? candidates.value
          : [],
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
      :name="displayName"
      :description="description"
      :on-name-change="(value) => { displayName = value; }"
      :on-description-change="(value) => { description = value; }"
    />

    <WorkflowFormField :label="t('workflows.builder.stage')">
      <div style="display: flex; align-items: center; gap: 8px" data-testid="collect-metadata-stage">
        <Tag>{{ config.stage }}</Tag>
        <template v-if="config.targetStage">
          <ArrowRightOutlined style="font-size: 16px; color: var(--sm-text-secondary)" />
          <Tag color="blue">{{ config.targetStage }}</Tag>
        </template>
      </div>
    </WorkflowFormField>

    <WorkflowFormField
      v-if="config.fields?.length"
      :label="t('workflows.builder.requiredFields')"
      :description="t('workflows.builder.collectMetadataFieldsHint')"
    >
      <ul style="display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none" data-testid="collect-metadata-fields">
        <li v-for="entry in config.fields ?? []" :key="entry.field">
          <Tag color="blue">{{ getRequiredFieldLabel(entry.field, (key: string) => t(key)) }}</Tag>
        </li>
      </ul>
    </WorkflowFormField>

    <WorkflowFormField v-if="config.revision" :label="t('workflows.builder.reviseAndResubmit')">
      <Typography.Paragraph
        type="secondary"
        data-testid="collect-metadata-revision"
        style="margin: 0; font-size: 14px"
      >
        {{
          t(
            config.revision === 'request'
              ? 'workflows.builder.collectMetadataRevisionRequestHint'
              : 'workflows.builder.collectMetadataRevisionResubmitHint',
            { stage: config.stage },
          )
        }}
      </Typography.Paragraph>
    </WorkflowFormField>

    <div v-if="config.conditions" data-testid="collect-metadata-conditions">
      <QueryBuilderSection
        :force-read-only="true"
        :label="t('workflows.builder.conditions')"
        :value="config.conditions"
        :on-change="() => {}"
      />
    </div>

    <template v-if="config.revision !== 'resubmit'">
      <WorkflowFormField
        :label="t('workflows.builder.assignTo')"
        :description="
          t(
            config.revision === 'request'
              ? 'workflows.builder.collectMetadataRevisionAssigneesHint'
              : 'workflows.builder.collectMetadataAssigneesHint',
          )
        "
      >
        <Radio.Group
          v-model:value="taskAssignees"
          :disabled="isFormDisabled"
          data-testid="collect-metadata-assignees"
          :aria-label="t('workflows.builder.assignTo')"
        >
          <Radio
            v-for="opt in assigneeOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </Radio>
        </Radio.Group>
      </WorkflowFormField>
      <AskedGroupWarning
        :assignees="taskAssignees"
        :fields="config.fields"
        :group-label="t(ASSIGNEE_LABEL_KEYS[taskAssignees])"
      />
    </template>

    <WorkflowFormField
      v-if="asksCandidates(config, taskAssignees)"
      :label="t('workflows.builder.specificUsersAndTeams')"
    >
      <ModeAwareFormField v-slot="{ disabled }">
        <UserTeamPicker
          v-model="candidates"
          :disabled="disabled"
          test-id="collect-metadata-candidates-trigger"
        />
      </ModeAwareFormField>
    </WorkflowFormField>

    <div style="flex: 1" />
    <FormActionButtons
      :show-delete="true"
      :is-disabled="
        !isValidString(displayName) ||
        (asksCandidates(config, taskAssignees) && candidates.length === 0)
      "
      :on-cancel="onClose"
      :on-delete="handleDelete"
      :on-save="handleSave"
    />
  </div>
</template>
