<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Menu } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
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

/**
 * The official PipelineActions row (PipelineActions.tsx + the
 * more-dropdown of PipelineActionsDropdown.tsx, pin a3012259ca),
 * rendered as the product's single row dropdown: Pause/Resume +
 * Logs + Run / Deploy-Re-deploy / Edit / Kill / Delete. Run and
 * Deploy/Re-deploy follow official's deployed/enabled branches
 * (deployed -> Run + Re-deploy, undeployed -> Deploy, both only while
 * enabled); every item carries its official permission bit plus the
 * P-24 orchestrator gate. One component serves the global list and
 * the service-detail mini-table — no second Run/Deploy/Edit/Delete/
 * Logs implementation.
 */
</script>

<template>
  <Menu.Item
    v-if="showView"
    key="view"
    data-testid="row-overflow-view"
    @click="emit('view', pipeline)"
  >
    {{ t('crud.view') }}
  </Menu.Item>
  <Menu.Item
    key="toggle-status"
    :data-testid="pipeline.enabled === false ? 'resume-button' : 'pause-button'"
    :disabled="
      !canTogglePipelineStatus(isAdminUser, ops) ||
      pipeline.deployed !== true ||
      orchestratorUnavailable
    "
    @click="emit('toggle', pipeline)"
  >
    {{ t(pipeline.enabled === false ? 'ingestion.pipelines.resume' : 'ingestion.pipelines.pause') }}
  </Menu.Item>
  <Menu.Item
    key="logs"
    data-testid="logs-button"
    :disabled="orchestratorUnavailable"
    @click="emit('logs', pipeline)"
  >
    {{ t('ingestion.pipelines.logs') }}
  </Menu.Item>
  <template v-if="pipeline.enabled !== false">
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
    key="edit"
    data-testid="row-overflow-edit"
    :disabled="!canEditPipeline(isAdminUser, ops)"
    @click="emit('edit', pipeline)"
  >
    {{ t('crud.edit') }}
  </Menu.Item>
  <Menu.Item
    key="kill"
    data-testid="kill-button"
    :disabled="!canKillPipeline(isAdminUser, ops) || orchestratorUnavailable"
    @click="emit('kill', pipeline)"
  >
    {{ t('ingestion.pipelines.kill') }}
  </Menu.Item>
  <Menu.Item
    key="delete"
    danger
    data-testid="row-overflow-delete"
    :disabled="!canDeletePipeline(isAdminUser, ops)"
    @click="emit('delete', pipeline)"
  >
    {{ t('crud.delete') }}
  </Menu.Item>
</template>
