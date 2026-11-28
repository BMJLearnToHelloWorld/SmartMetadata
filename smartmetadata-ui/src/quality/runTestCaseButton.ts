/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { OperationPermissions } from '@/api/permissions';
import type { IngestionPipeline, PipelineStatus } from '@/types/ingestion';

/** Official default timeout (ms) when airflowConfig.workflowTimeout is unset. */
const DEFAULT_RUN_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Official getRunnablePipeline: of the suite's enabled, deployed
 * pipelines, the one with the lowest id — the same rule the run
 * endpoint applies.
 */
export function getRunnablePipeline(pipelines: IngestionPipeline[]): IngestionPipeline | undefined {
  return [...pipelines]
    .filter((pipeline) => pipeline.enabled && pipeline.deployed)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
}

/**
 * Official getTriggerPermissions: check Trigger against the runnable
 * pipeline's entity permissions, or the resource-level grant when there
 * is no runnable pipeline.
 */
export function getTriggerPermissions(
  pipeline: IngestionPipeline | undefined,
  pipelinePermissions: OperationPermissions,
  resourcePermissions?: OperationPermissions,
): OperationPermissions {
  return pipeline ? pipelinePermissions : (resourcePermissions ?? pipelinePermissions);
}

export function getRunButtonLabelKey(activeRunState?: string): string {
  if (activeRunState === 'Queued') {
    return 'label.queued';
  }
  if (activeRunState === 'Running') {
    return 'label.running';
  }
  return 'label.run-now';
}

function statusTimestampMs(status: PipelineStatus): number | undefined {
  if (status.timestamp === undefined) {
    return undefined;
  }
  return status.timestamp < 1e12 ? status.timestamp * 1000 : status.timestamp;
}

/** Official getActiveRunState: running wins over queued; running expires after workflowTimeout. */
export function getActiveRunState(pipeline: IngestionPipeline | undefined, now = Date.now()): string | undefined {
  if (!pipeline) {
    return undefined;
  }
  const runningTimeoutMs = pipeline.airflowConfig?.workflowTimeout
    ? pipeline.airflowConfig.workflowTimeout * 1000
    : DEFAULT_RUN_TIMEOUT_MS;
  const statuses = pipeline.pipelineStatuses ?? [];
  const isRunning = statuses.some((status) => {
    const timestamp = statusTimestampMs(status);
    return status.pipelineState === 'Running' && timestamp !== undefined && timestamp >= now - runningTimeoutMs;
  });
  if (isRunning) {
    return 'Running';
  }
  return statuses.some((status) => status.pipelineState === 'Queued') ? 'Queued' : undefined;
}

export function isRunInProgress(pipeline: IngestionPipeline, now = Date.now()): boolean {
  return getActiveRunState(pipeline, now) !== undefined;
}

export function getRunDisabledReasonKey(pipelines: IngestionPipeline[], hasPipelineLoadError = false): string | undefined {
  if (hasPipelineLoadError) {
    return 'message.pipelines-could-not-be-loaded';
  }
  if (pipelines.length === 0) {
    return 'message.no-pipeline-linked';
  }
  return getRunnablePipeline(pipelines) ? undefined : 'message.pipeline-not-deployed';
}
