/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  Agent,
  AgentRecentRun,
  AgentStatus,
  IngestionPipeline,
  PipelineStatus,
  PipelineStepStatus,
  RunStatus,
} from '@/types/ingestion';
import { getShortRelativeTime } from '@/utils/relativeTime';

/**
 * Agent view-model mapping, ported from official
 * components/ServiceAgents/utils/agentsDataMapper.ts
 * (openmetadata-ui, pin a3012259ca). The run-history / log-viewer helpers of that module
 * (`mapPipelineStatusToRun`, `mapStepSummaryToRunStep`,
 * `parseLogLines`) are not ported: the fork reuses its existing run
 * details modal and log modal instead.
 */

/** Official constants/ServiceType.constant.ts `SERVICE_INGESTION_PIPELINE_TYPES` (8). */
export const SERVICE_INGESTION_PIPELINE_TYPES: readonly string[] = [
  'metadata',
  'usage',
  'lineage',
  'profiler',
  'autoClassification',
  'dbt',
  'policyAgent',
  'reverseMetadata',
];

export const PIPELINE_TYPE_TO_AGENT_TYPE: Record<string, string> = {
  metadata: 'Metadata',
  usage: 'Usage',
  lineage: 'Lineage',
  profiler: 'Profiler',
  autoClassification: 'Auto Classification',
  dbt: 'dbt',
  application: 'Metadata',
  dataInsight: 'Metadata',
  elasticSearchReindex: 'Metadata',
  policyAgent: 'Metadata',
  reverseMetadata: 'Metadata',
  TestSuite: 'Data Quality',
};

export const PIPELINE_TYPE_TO_UNIT_VERB: Record<string, { unit: string; verb: string }> = {
  usage: { unit: 'queries', verb: 'scanned' },
  lineage: { unit: 'queries', verb: 'processed' },
  metadata: { unit: 'assets', verb: 'ingested' },
  profiler: { unit: 'assets', verb: 'profiled' },
  dbt: { unit: 'models', verb: 'parsed' },
};

type AgentStatusLabel = 'Successful' | 'Failed' | 'Running' | 'Pending';

/**
 * Official `STATUS_TO_AGENT_STATUS`: pipelineState values (lowercase
 * enum values) to agent status labels. Anything unlisted — including
 * 'stopped' — falls through to Pending.
 */
const PIPELINE_STATE_TO_STATUS_LABEL: Record<string, AgentStatusLabel> = {
  success: 'Successful',
  partialSuccess: 'Successful',
  active: 'Successful',
  activeError: 'Successful',
  completed: 'Successful',
  failed: 'Failed',
  running: 'Running',
  started: 'Running',
  stopInProgress: 'Running',
  queued: 'Pending',
  pending: 'Pending',
  NO_RUNS: 'Pending',
};

const STATUS_LABEL_TO_AGENT_STATUS: Record<AgentStatusLabel, AgentStatus> = {
  Successful: 'success',
  Failed: 'failed',
  Running: 'running',
  Pending: 'queued',
};

export function getAgentStatusFromPipelineState(pipelineState?: string): AgentStatus {
  const label = PIPELINE_STATE_TO_STATUS_LABEL[pipelineState ?? ''] ?? 'Pending';
  return STATUS_LABEL_TO_AGENT_STATUS[label];
}

const PIPELINE_STATE_TO_RUN_STATUS: Record<string, RunStatus> = {
  success: 'success',
  partialSuccess: 'partial',
  failed: 'failed',
  running: 'running',
  queued: 'skipped',
  stopped: 'skipped',
};

/** Completed states shown as recent-run dots (official `COMPLETED_PIPELINE_STATES`). */
const COMPLETED_PIPELINE_STATES: readonly string[] = [
  'success',
  'partialSuccess',
  'failed',
  'stopped',
];

interface ProgressFields {
  pct: number;
  eta: number | null;
  assets: number;
  target: number;
  errors: number;
  warnings: number;
  finishedAt?: string;
}

const EMPTY_PROGRESS: ProgressFields = {
  pct: 0,
  eta: null,
  assets: 0,
  target: 0,
  errors: 0,
  warnings: 0,
};

/**
 * Official `aggregateProgress`: collapses the per-step progress maps
 * of a running run. Every step carries an identical copy of the whole
 * map (the tracker is a process-wide singleton), so the highest
 * `processed` per entity type wins — summing across steps would
 * multiply the counts.
 */
export function aggregateProgress(steps: readonly PipelineStepStatus[]): ProgressFields {
  const bestByEntityType = new Map<
    string,
    { processed: number; total: number; eta: number | undefined }
  >();
  for (const step of steps) {
    for (const [entityType, progress] of Object.entries(step.progress ?? {})) {
      const processed = progress.processed ?? 0;
      const current = bestByEntityType.get(entityType);
      if (current === undefined || processed > current.processed) {
        bestByEntityType.set(entityType, {
          processed,
          total: progress.total ?? 0,
          eta: progress.estimatedRemainingSeconds,
        });
      }
    }
  }
  let assets = 0;
  let target = 0;
  let eta: number | null = null;
  for (const entry of bestByEntityType.values()) {
    assets += entry.processed;
    target += entry.total;
    if (entry.eta !== undefined) {
      eta = Math.max(eta ?? 0, entry.eta);
    }
  }
  const resolvedTarget = target > 0 ? target : Math.max(assets, 1);
  return {
    pct: Math.round((assets / resolvedTarget) * 100),
    eta,
    assets,
    target: resolvedTarget,
    errors: 0,
    warnings: 0,
  };
}

/**
 * Official `aggregateStepTotals`: a finished run's totals. `assets`
 * is the MAX `records` across steps (a high-water mark — steps
 * overlap), while errors and warnings are summed.
 */
export function aggregateStepTotals(
  steps: readonly PipelineStepStatus[],
  endDate?: number,
): ProgressFields {
  let assets = 0;
  let errors = 0;
  let warnings = 0;
  for (const step of steps) {
    assets = Math.max(assets, step.records ?? 0);
    errors += step.errors ?? 0;
    warnings += step.warnings ?? 0;
  }
  return {
    pct: 100,
    eta: 0,
    assets,
    target: Math.max(assets, 1),
    errors,
    warnings,
    finishedAt: endDate === undefined ? undefined : getShortRelativeTime(endDate),
  };
}

/**
 * Official `getRecentRuns`: the newest five completed runs, oldest
 * first (the dots render left-to-right, oldest to newest).
 */
export function getRecentRuns(statuses: readonly PipelineStatus[]): AgentRecentRun[] {
  return [...statuses]
    .filter((status) => COMPLETED_PIPELINE_STATES.includes(status.pipelineState ?? ''))
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 5)
    .reverse()
    .map((status) => ({
      id:
        status.runId ??
        (status.timestamp === undefined ? '' : String(status.timestamp)),
      status: PIPELINE_STATE_TO_RUN_STATUS[status.pipelineState ?? ''] ?? 'skipped',
    }));
}

export function mapPipelineToAgent(pipeline: IngestionPipeline): Agent {
  const statuses = pipeline.pipelineStatuses ?? [];
  const latestStatus = statuses[0];
  const status: AgentStatus =
    latestStatus?.pipelineState === undefined
      ? 'none'
      : getAgentStatusFromPipelineState(latestStatus.pipelineState);

  let progress: ProgressFields = EMPTY_PROGRESS;
  const steps = latestStatus?.status ?? [];
  if (status === 'running') {
    progress = aggregateProgress(steps);
  } else if (status === 'success' || status === 'failed') {
    progress = aggregateStepTotals(steps, latestStatus?.endDate);
  }
  // Counts are computed independently of the progress branch: the
  // pin sums step errors/warnings whenever a latest status exists,
  // so a running run shows its accumulated counts too.
  const { errors, warnings } = latestStatus
    ? aggregateStepTotals(steps)
    : { errors: 0, warnings: 0 };

  const unitVerb = PIPELINE_TYPE_TO_UNIT_VERB[pipeline.pipelineType ?? ''] ?? {
    unit: 'assets',
    verb: 'ingested',
  };

  return {
    id: pipeline.id ?? '',
    fqn: pipeline.fullyQualifiedName ?? '',
    pipelineType: pipeline.pipelineType ?? '',
    name: pipeline.displayName ?? pipeline.name ?? '',
    type: PIPELINE_TYPE_TO_AGENT_TYPE[pipeline.pipelineType ?? ''] ?? 'Metadata',
    unit: unitVerb.unit,
    verb: unitVerb.verb,
    status,
    pct: progress.pct,
    eta: progress.eta,
    assets: progress.assets,
    target: progress.target,
    errors,
    warnings,
    recentRuns: getRecentRuns(statuses),
    currentRunId: latestStatus?.runId,
    schedule: pipeline.airflowConfig?.scheduleInterval,
    finishedAt: progress.finishedAt,
    lastRunAt: latestStatus?.timestamp,
    enabled: pipeline.enabled,
  };
}
