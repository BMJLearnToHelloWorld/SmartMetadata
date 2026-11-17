<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Menu } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
import { agentOverflowPermissions } from '@/ingestion/agentsUtils';
import {
  canDeletePipeline,
  canDeployPipeline,
  canEditPipeline,
  canKillPipeline,
  canTogglePipelineStatus,
  canTriggerPipeline,
} from '@/ingestion/pipelineActions';
import type { IngestionPipeline } from '@/types/ingestion';

const props = defineProps<{
  pipeline: IngestionPipeline;
  /** Per-pipeline entity permission by FQN; undefined while loading denies (fail-closed). */
  ops?: OperationPermissions;
  isAdminUser: boolean;
  /** P-24: the orchestrator probe says the pipeline service is down or disabled. */
  orchestratorUnavailable: boolean;
  /** The list view's View item lives in EntityListShell; the service mini-table needs its own. */
  showView?: boolean;
  /**
   * 'card' renders the official AgentOverflowMenu composition
   * (pause/resume + kill-or-redeploy + edit + delete) for the agent
   * card: no View, Logs, or Run item — the card carries its own
   * Logs and Run buttons. Card gating is the pin triad (V11): items
   * hide (v-if) on the pin useAgentPermissions bits with no admin
   * input; only the non-permission conditions stay as disabled
   * (toggle needs deployed, kill/deploy need the orchestrator).
   * Edit/delete stay enabled while the orchestrator is down
   * (catalog operations, not Airflow calls).
   */
  variant?: 'row' | 'card';
  /** Card variant: the agent is running or queued, so Kill replaces Re-deploy. */
  active?: boolean;
}>();
const emit = defineEmits<{
  view: [pipeline: IngestionPipeline];
  run: [pipeline: IngestionPipeline];
  deploy: [pipeline: IngestionPipeline];
  toggle: [pipeline: IngestionPipeline];
  logs: [pipeline: IngestionPipeline];
  edit: [pipeline: IngestionPipeline];
  kill: [pipeline: IngestionPipeline];
  delete: [pipeline: IngestionPipeline];
}>();

const { t } = useI18n();

/** Pin AgentOverflowMenu PERMISSION_BY_ITEM: pause/resume, kill, redeploy, and edit ride `edit`; delete rides `delete`. */
const cardPermissions = computed(() => agentOverflowPermissions(props.ops));
const isCard = computed(() => props.variant === 'card');

/**
 * The official PipelineActions row (PipelineActions.tsx + the
 * more-dropdown of PipelineActionsDropdown.tsx, pin a3012259ca),
 * rendered as the product's single row dropdown: Pause/Resume +
 * Logs + Run / Deploy-Re-deploy / Edit / Kill / Delete. Run and
 * Deploy/Re-deploy follow official's deployed/enabled branches
 * (deployed -> Run + Re-deploy, undeployed -> Deploy, both only while
 * enabled); every item carries its official permission bit plus the
 * P-24 orchestrator gate. One component serves the global list and
 * the agent card (variant="card" renders the official
 * AgentOverflowMenu composition) — no second Run/Deploy/Edit/Delete/
 * Logs implementation.
 */
</script>

<template>
  <Menu.Item
    v-if="showView && variant !== 'card'"
    key="view"
    data-testid="row-overflow-view"
    @click="emit('view', pipeline)"
  >
    {{ t('crud.view') }}
  </Menu.Item>
  <Menu.Item
    v-if="!isCard || cardPermissions.edit"
    key="toggle-status"
    :data-testid="pipeline.enabled === false ? 'resume-button' : 'pause-button'"
    :disabled="
      isCard
        ? pipeline.deployed !== true || orchestratorUnavailable
        : !canTogglePipelineStatus(isAdminUser, ops) ||
          pipeline.deployed !== true ||
          orchestratorUnavailable
    "
    @click="emit('toggle', pipeline)"
  >
    {{ t(pipeline.enabled === false ? 'ingestion.pipelines.resume' : 'ingestion.pipelines.pause') }}
  </Menu.Item>
  <Menu.Item
    v-if="variant !== 'card'"
    key="logs"
    data-testid="logs-button"
    :disabled="orchestratorUnavailable"
    @click="emit('logs', pipeline)"
  >
    {{ t('ingestion.pipelines.logs') }}
  </Menu.Item>
  <template v-if="variant === 'card'">
    <Menu.Item
      v-if="active && cardPermissions.edit"
      key="kill"
      data-testid="kill-button"
      :disabled="orchestratorUnavailable"
      @click="emit('kill', pipeline)"
    >
      {{ t('label.killRun') }}
    </Menu.Item>
    <Menu.Item
      v-else-if="!active && cardPermissions.edit"
      key="deploy"
      :data-testid="pipeline.deployed === true ? 're-deploy-button' : 'deploy-button'"
      :disabled="pipeline.enabled === false || orchestratorUnavailable"
      @click="emit('deploy', pipeline)"
    >
      {{ t(pipeline.deployed === true ? 'label.redeploySentence' : 'ingestion.pipelines.deploy') }}
    </Menu.Item>
  </template>
  <template v-else-if="pipeline.enabled !== false">
    <Menu.Item
      v-if="pipeline.deployed === true"
      key="run"
      data-testid="run-button"
      :disabled="!canTriggerPipeline(isAdminUser, ops, pipeline) || orchestratorUnavailable"
      @click="emit('run', pipeline)"
    >
      {{ t('ingestion.pipelines.run') }}
    </Menu.Item>
    <Menu.Item
      key="deploy"
      :data-testid="pipeline.deployed === true ? 're-deploy-button' : 'deploy-button'"
      :disabled="!canDeployPipeline(isAdminUser, ops, pipeline) || orchestratorUnavailable"
      @click="emit('deploy', pipeline)"
    >
      {{ t(pipeline.deployed === true ? 'ingestion.pipelines.redeploy' : 'ingestion.pipelines.deploy') }}
    </Menu.Item>
  </template>
  <Menu.Item
    v-if="!isCard || cardPermissions.edit"
    key="edit"
    :data-testid="variant === 'card' ? 'edit-button' : 'row-overflow-edit'"
    :disabled="!isCard && !canEditPipeline(isAdminUser, ops)"
    @click="emit('edit', pipeline)"
  >
    {{ t(isCard ? 'label.editConfiguration' : 'crud.edit') }}
  </Menu.Item>
  <Menu.Item
    v-if="variant !== 'card'"
    key="kill"
    data-testid="kill-button"
    :disabled="!canKillPipeline(isAdminUser, ops) || orchestratorUnavailable"
    @click="emit('kill', pipeline)"
  >
    {{ t('ingestion.pipelines.kill') }}
  </Menu.Item>
  <Menu.Item
    v-if="!isCard || cardPermissions.delete"
    key="delete"
    danger
    :data-testid="variant === 'card' ? 'delete-button' : 'row-overflow-delete'"
    :disabled="!isCard && !canDeletePipeline(isAdminUser, ops)"
    @click="emit('delete', pipeline)"
  >
    {{ t(isCard ? 'label.deleteAgent' : 'crud.delete') }}
  </Menu.Item>
</template>
