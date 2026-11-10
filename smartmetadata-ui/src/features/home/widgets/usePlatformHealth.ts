/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { listIngestionPipelines } from '@/api/ingestionPipelines';
import type { IngestionPipeline } from '@/types/ingestion';
import {
  getServicesOverview,
  type ServiceHealth,
  type ServicesOverview,
  type ServiceSummary,
} from '@/api/services';
import { useWidgetLoad, WIDGET_LOAD_TTL_MS } from '@/features/home/widgetLoad';
import { SERVICE_ENTITY_TYPE_BY_KIND } from '@/ingestion/connections';
import type { ServiceKind } from '@/types/ingestion';
import { computed, type Ref } from 'vue';

export type FailingServiceState = 'failed' | 'partialSuccess';

// One row of the Platform Health widget: a connection service whose worst
// pipeline last run failed / partially failed, plus the culprit run's details.
export interface FailingService {
  id: string;
  name: string;
  displayName: string;
  serviceType: string;
  serviceKind?: ServiceKind;
  fqn: string;
  pipelineType?: string;
  /** FQN of the culprit pipeline — lets the AI agent pull its run data/logs directly. */
  pipelineFqn?: string;
  state: FailingServiceState;
  /**
   * The culprit run's own error, condensed to one line. Empty when the server
   * gave nothing usable (no step failure, or only "Workflow failed…"): the row
   * then shows a translated fallback built from `pipelineType` and `state`, so
   * no English sentence is ever composed here.
   */
  reason: string;
  lastRunTs?: number;
}

// The health bucket a service belongs to, used to filter the Connections list.
export type ServiceHealthFilter = 'failing' | 'healthy' | 'notRun';

// A bucket other than failing lists services as they are: they have no
// culprit run to read, so their rows need nothing beyond the summary.
export type QuietHealthFilter = Exclude<ServiceHealthFilter, 'failing'>;

/** One row of the healthy or not-run bucket. */
export interface BucketService {
  id: string;
  displayName: string;
  fqn: string;
  serviceType: string;
  serviceKind?: ServiceKind;
}

export interface IngestionPipelineStats {
  connectedServices: number;
  healthyServices: number;
  warningServices: number;
  failedServices: number;
  pendingServices: number;
  /**
   * The worst offenders, failed before partially failed — at most
   * MAX_FAILING_ROWS. Their count is `failedServices + warningServices`,
   * never this array's length.
   */
  failingServices: FailingService[];
}

/**
 * How many failing services get a detailed row. The card shows three; the rest
 * ride along to the deployment's insight block, which caps its own prompt at
 * the same ten. (The product has no insight block — see the widget ADR —
 * but the fetch shape stays official.)
 */
export const MAX_FAILING_ROWS = 10;

/** Pipelines read per failing service when looking for the culprit run. */
const PIPELINES_PER_SERVICE = 50;

const EMPTY_PIPELINE_STATS: IngestionPipelineStats = {
  connectedServices: 0,
  failedServices: 0,
  failingServices: [],
  healthyServices: 0,
  pendingServices: 0,
  warningServices: 0,
};

const REASON_MAX_LENGTH = 90;
// Raw messages that carry no signal — the row shows a typed fallback instead.
const GENERIC_ERROR_PATTERN = /workflow failed/i;

/**
 * The connection estate, as the Connections page counts it: every service type
 * it tabs over, minus the built-in OpenMetadata service (`excludeProvider`).
 */
export const CONNECTIONS_ENTITY_TYPES = Object.values(SERVICE_ENTITY_TYPE_BY_KIND).filter(
  (entityType) => entityType !== 'llmService' && entityType !== 'mcpService',
);

export const KIND_BY_ENTITY_TYPE = Object.fromEntries(
  Object.entries(SERVICE_ENTITY_TYPE_BY_KIND).map(([kind, entityType]) => [entityType, kind]),
) as Record<string, ServiceKind>;

export const OVERVIEW_PARAMS = {
  entityType: CONNECTIONS_ENTITY_TYPES,
  excludeProvider: 'system' as const,
  includeHealth: true,
  offset: 0,
};

const HEALTH_TO_STATE: Partial<Record<ServiceHealth, FailingServiceState>> = {
  failed: 'failed',
  partialSuccess: 'partialSuccess',
};

const STATE_TO_PIPELINE_STATE: Record<FailingServiceState, string> = {
  failed: 'failed',
  partialSuccess: 'partialSuccess',
};

const latestRun = (pipeline: IngestionPipeline) => pipeline.pipelineStatuses?.[0];

// Pull the first step-level failure message off a pipeline's latest run.
function firstFailureMessage(pipeline: IngestionPipeline): string {
  const steps = latestRun(pipeline)?.status ?? [];
  const failingStep = steps.find((step) => (step.failures?.length ?? 0) > 0);
  return failingStep?.failures?.[0]?.error ?? '';
}

/**
 * Turn a raw stack-trace error into one concise line, or nothing when the raw
 * message is generic ("Workflow failed…") or empty.
 */
export function cleanReason(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const afterBracket = collapsed.includes(']: ')
    ? collapsed.slice(collapsed.lastIndexOf(']: ') + 3).replace(/^\[|\]$/g, '')
    : collapsed;
  const usable = !GENERIC_ERROR_PATTERN.test(afterBracket);
  const chosen = usable ? afterBracket : '';

  return chosen.length > REASON_MAX_LENGTH ? `${chosen.slice(0, REASON_MAX_LENGTH).trimEnd()}…` : chosen;
}

// The pipeline that explains a failing service's row: the most recent run in
// the service's worst state.
function findCulprit(
  pipelines: IngestionPipeline[],
  state: FailingServiceState,
): IngestionPipeline | undefined {
  return pipelines
    .filter((p) => latestRun(p)?.pipelineState === STATE_TO_PIPELINE_STATE[state])
    .sort((a, b) => (latestRun(b)?.timestamp ?? 0) - (latestRun(a)?.timestamp ?? 0))[0];
}

/**
 * One request per row, never per estate: only a service already known to be
 * failing has its pipelines read, so the cost is bounded by
 * MAX_FAILING_ROWS however large the deployment is.
 */
async function toFailingService(summary: ServiceSummary): Promise<FailingService> {
  const state = HEALTH_TO_STATE[summary.health as ServiceHealth] ?? 'failed';
  const fqn = summary.fullyQualifiedName ?? summary.name;
  const page = await listIngestionPipelines({
    fields: 'pipelineStatuses',
    limit: PIPELINES_PER_SERVICE,
    serviceFilter: fqn,
    // A database and a dashboard service may share a name; the type keeps one
    // service's pipelines from bleeding into the other's row.
    serviceType: summary.entityType,
  });
  const culprit = findCulprit(page.data, state);

  return {
    displayName: summary.displayName || summary.name,
    fqn,
    id: summary.id,
    lastRunTs: culprit ? latestRun(culprit)?.timestamp : undefined,
    name: summary.name,
    pipelineFqn: culprit?.fullyQualifiedName,
    pipelineType: culprit?.pipelineType,
    reason: culprit ? cleanReason(firstFailureMessage(culprit)) : '',
    serviceKind: KIND_BY_ENTITY_TYPE[summary.entityType],
    serviceType: summary.serviceType ?? '',
    state,
  };
}

// Failed services rank before partial ones; within a state, most recent first.
function sortFailingServices(services: FailingService[]): FailingService[] {
  return [...services].sort((a, b) => {
    const stateRank = (s: FailingServiceState) => (s === 'failed' ? 0 : 1);
    const byState = stateRank(a.state) - stateRank(b.state);
    return byState !== 0 ? byState : (b.lastRunTs ?? 0) - (a.lastRunTs ?? 0);
  });
}

/** `healthCounts` is per entity type; the card only wants the estate total. */
function sumHealth(overview: ServicesOverview, health: ServiceHealth): number {
  return Object.values(overview.healthCounts ?? {}).reduce(
    (total, byHealth) => total + (byHealth[health] ?? 0),
    0,
  );
}

function fetchFailingPage(health: ServiceHealth, limit: number) {
  return getServicesOverview({ ...OVERVIEW_PARAMS, health: [health], limit });
}

/**
 * The health buckets come from the server's own tally — the overview endpoint
 * reduces every service's pipelines worst-wins, exactly as this card used to do
 * client-side over the whole estate. Its `health` filter narrows only the page,
 * never the counts, so the first page of failed services and the estate-wide
 * numbers arrive in one response. Partially failed services are only read when
 * the failed ones leave room in the rows.
 */
async function fetchPipelineStats(): Promise<IngestionPipelineStats> {
  const overview = await fetchFailingPage('failed', MAX_FAILING_ROWS);
  const room = MAX_FAILING_ROWS - overview.data.length;
  const partial =
    room > 0 && sumHealth(overview, 'partialSuccess') > 0
      ? (await fetchFailingPage('partialSuccess', room)).data
      : [];
  const failingServices = await Promise.all([...overview.data, ...partial].map(toFailingService));

  return {
    connectedServices: overview.total,
    failedServices: sumHealth(overview, 'failed'),
    failingServices: sortFailingServices(failingServices),
    healthyServices: sumHealth(overview, 'success'),
    pendingServices: sumHealth(overview, 'notRun'),
    warningServices: sumHealth(overview, 'partialSuccess'),
  };
}

const QUIET_FILTER_TO_HEALTH: Record<QuietHealthFilter, ServiceHealth> = {
  healthy: 'success',
  notRun: 'notRun',
};

function toBucketService(summary: ServiceSummary): BucketService {
  return {
    displayName: summary.displayName || summary.name,
    fqn: summary.fullyQualifiedName ?? summary.name,
    id: summary.id,
    serviceKind: KIND_BY_ENTITY_TYPE[summary.entityType],
    serviceType: summary.serviceType ?? '',
  };
}

export interface BucketServicesResult {
  services: Ref<BucketService[]>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

/**
 * The first services of a healthy or not-run bucket, read only once the card
 * shows that bucket. A supplementary query: its failure is isolated — the
 * counts and failing rows stay visible with a retry on the bucket alone.
 */
export function useBucketServices(filter: Ref<QuietHealthFilter | undefined>, limit: number): BucketServicesResult {
  const key = computed(() =>
    filter.value ? `platform-health-bucket:${filter.value}:${limit}` : 'platform-health-bucket:unset',
  );
  const loaded = useWidgetLoad<BucketService[]>(
    key,
    async () => {
      const current = filter.value;
      if (!current) {
        return [];
      }
      const overview = await getServicesOverview({
        ...OVERVIEW_PARAMS,
        health: [QUIET_FILTER_TO_HEALTH[current]],
        limit,
      });
      return overview.data.map(toBucketService);
    },
    { ttlMs: WIDGET_LOAD_TTL_MS },
  );

  return {
    services: computed(() => loaded.data.value ?? []),
    isLoading: loaded.isLoading,
    isError: loaded.isError,
    refetch: loaded.refetch,
  };
}

export interface PlatformHealthStats {
  stats: Ref<IngestionPipelineStats>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  dataUpdatedAt: Ref<number>;
  refetch: () => Promise<void>;
}

/**
 * The connection estate's health. The caller gates on ViewAll/ViewBasic
 * before mounting (the widget does the permission check first and only
 * mounts this when the viewer may read ingestion pipelines), so no
 * request is ever issued for a viewer who may not see inside.
 */
export function useIngestionPipelineStats(enabled?: Ref<boolean>): PlatformHealthStats {
  const loaded = useWidgetLoad<IngestionPipelineStats>(
    'platform-health-stats',
    fetchPipelineStats,
    { ttlMs: WIDGET_LOAD_TTL_MS, enabled },
  );
  return {
    stats: computed(() => loaded.data.value ?? EMPTY_PIPELINE_STATS),
    isLoading: loaded.isLoading,
    isError: loaded.isError,
    dataUpdatedAt: loaded.dataUpdatedAt,
    refetch: loaded.refetch,
  };
}
