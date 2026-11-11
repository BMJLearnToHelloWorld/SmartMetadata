/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import type { OperationPermissions } from '@/api/permissions';
import {
  deleteIngestionPipeline,
  deployIngestionPipeline,
  isPipelineClientDisabled,
  toggleIngestionPipeline,
  triggerIngestionPipeline,
} from '@/api/ingestionPipelines';
import { confirmDelete } from '@/features/crud/confirmDelete';
import {
  canDeletePipeline,
  canDeployPipeline,
  canEditPipeline,
  canKillPipeline,
  canTogglePipelineStatus,
  canTriggerPipeline,
} from '@/ingestion/pipelineActions';
import type { IngestionPipeline } from '@/types/ingestion';

/**
 * Shared row-action handlers for the global list and the service-detail
 * mini-table (one implementation; P-09/P-38). Every operation applies
 * C-01: a 200 with reason "Pipeline Client Disabled" is an error, never
 * a success toast; on success the row's status is re-fetched after
 * 500ms (official MetadataAgentsWidget.tsx:130-131,157-158 — "give the
 * pipeline service time to update the status").
 */
export function usePipelineRowActions(options: {
  isAdminUser: Ref<boolean> | (() => boolean);
  getOps: (pipeline: IngestionPipeline) => OperationPermissions | undefined;
  /** Re-fetch after the 500ms delay (list: full load; service detail: pipelines reload). */
  refresh: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const logsPipeline = ref<IngestionPipeline | null>(null);
  const killPipeline = ref<IngestionPipeline | null>(null);

  const isAdmin = (): boolean =>
    typeof options.isAdminUser === 'function' ? options.isAdminUser() : options.isAdminUser.value;

  function refreshAfterDelay(): void {
    setTimeout(() => {
      void options.refresh();
    }, 500);
  }

  function actionSuccess(actionKey: 'actionDeployed' | 'actionTriggered'): void {
    message.success(
      t('ingestion.pipelines.actionSuccess', { action: t(`ingestion.pipelines.${actionKey}`) }),
    );
  }

  /** C-01: report a client response as success or as the disabled-client error. Returns true on success. */
  function reportClientResult(
    result: { code?: number; reason?: string },
    actionKey: 'actionDeployed' | 'actionTriggered',
  ): boolean {
    if (isPipelineClientDisabled(result)) {
      message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
      return false;
    }
    if (result.code !== undefined && result.code !== 200) {
      message.error(result.reason ?? t('ingestion.pipelines.actionFailed'));
      return false;
    }
    actionSuccess(actionKey);
    return true;
  }

  async function onRun(pipeline: IngestionPipeline): Promise<void> {
    if (!canTriggerPipeline(isAdmin(), options.getOps(pipeline), pipeline)) {
      message.error(t('errors.forbidden'));
      return;
    }
    try {
      const result = await triggerIngestionPipeline(pipeline.id);
      if (reportClientResult(result, 'actionTriggered')) {
        refreshAfterDelay();
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
    }
  }

  async function onDeploy(pipeline: IngestionPipeline): Promise<void> {
    if (!canDeployPipeline(isAdmin(), options.getOps(pipeline), pipeline)) {
      message.error(t('errors.forbidden'));
      return;
    }
    try {
      const result = await deployIngestionPipeline(pipeline.id);
      if (reportClientResult(result, 'actionDeployed')) {
        refreshAfterDelay();
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
    }
  }

  async function onToggle(pipeline: IngestionPipeline): Promise<void> {
    if (!canTogglePipelineStatus(isAdmin(), options.getOps(pipeline))) {
      message.error(t('errors.forbidden'));
      return;
    }
    try {
      // A disabled client answers 200 with the plain string reason; the
      // API layer throws it, so it lands here as a failure, never a flip.
      await toggleIngestionPipeline(pipeline.id);
      refreshAfterDelay();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('ingestion.pipelines.actionFailed'));
    }
  }

  function onLogs(pipeline: IngestionPipeline): void {
    logsPipeline.value = pipeline;
  }

  function onKill(pipeline: IngestionPipeline): void {
    if (!canKillPipeline(isAdmin(), options.getOps(pipeline))) {
      message.error(t('errors.forbidden'));
      return;
    }
    killPipeline.value = pipeline;
  }

  function onKillDone(): void {
    killPipeline.value = null;
    void options.refresh();
  }

  function onEdit(pipeline: IngestionPipeline): void {
    if (!canEditPipeline(isAdmin(), options.getOps(pipeline))) {
      message.error(t('errors.forbidden'));
      return;
    }
    void router.push({ name: 'ingestion-pipeline-edit', params: { id: pipeline.id } });
  }

  async function onDelete(pipeline: IngestionPipeline): Promise<void> {
    if (!canDeletePipeline(isAdmin(), options.getOps(pipeline))) {
      message.error(t('errors.forbidden'));
      return;
    }
    // P-18: the confirm stays open with the confirm button loading until
    // the hard delete completes (official DeleteModal isDeleting). A
    // failed delete toasts and rethrows, which keeps the modal open for
    // a retry or cancel under antd's async-onOk semantics.
    const confirmed = await confirmDelete({
      title: t('crud.deleteTitle'),
      content: t('ingestion.pipelines.deleteConfirm', { name: pipeline.name }),
      okText: t('crud.delete'),
      cancelText: t('crud.cancel'),
      onOk: async () => {
        try {
          await deleteIngestionPipeline(pipeline.id);
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
          throw error;
        }
      },
    });
    if (!confirmed) {
      return;
    }
    message.success(t('ingestion.pipelines.deleted', { name: pipeline.name }));
    await options.refresh();
  }

  return {
    logsPipeline,
    killPipeline,
    onRun,
    onDeploy,
    onToggle,
    onLogs,
    onKill,
    onKillDone,
    onEdit,
    onDelete,
  };
}
