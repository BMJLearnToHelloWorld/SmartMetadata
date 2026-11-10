/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asString, parsePaged } from '@/api/json';
import type { Paged } from '@/types/admin';
import { apiRequest } from './client';

/**
 * Pipeline summary, mirroring openmetadata-spec
 * schema/type/pipelineSummary.json (PipelineResource listPipelineSummaries,
 * GET /v1/pipelines/summary). lastRunStatus is the generated
 * LastRunStatus enum: Successful | Failed | Pending | Skipped | Running,
 * or null when the pipeline never ran.
 */
export type PipelineLastRunStatus = 'Successful' | 'Failed' | 'Pending' | 'Skipped' | 'Running';

export interface PipelineSummary {
  pipelineId: string;
  pipelineName?: string;
  pipelineFqn: string;
  serviceType?: string;
  startTime?: number;
  endTime?: number;
  lastRunTime?: number;
  lastRunStatus?: PipelineLastRunStatus;
  scheduleInterval?: string;
  impactedAssetsCount?: number;
  impactedAssets?: string[];
}

export interface ListPipelineSummariesQuery {
  fields?: string;
  service?: string;
  search?: string;
  status?: PipelineLastRunStatus;
  domain?: string;
  owner?: string;
  tier?: string;
  startTs?: number;
  endTs?: number;
  limit?: number;
  before?: string;
  after?: string;
  include?: string;
}

function mapPipelineSummary(raw: Record<string, unknown>): PipelineSummary | null {
  const pipelineId = asString(raw.pipelineId);
  const pipelineFqn = asString(raw.pipelineFqn);
  if (!pipelineId || !pipelineFqn) {
    return null;
  }
  const lastRunStatus = asString(raw.lastRunStatus);
  return {
    pipelineId,
    pipelineName: asString(raw.pipelineName) || undefined,
    pipelineFqn,
    serviceType: asString(raw.serviceType) || undefined,
    startTime: asNumber(raw.startTime),
    endTime: asNumber(raw.endTime),
    lastRunTime: asNumber(raw.lastRunTime),
    lastRunStatus:
      lastRunStatus === 'Successful' ||
      lastRunStatus === 'Failed' ||
      lastRunStatus === 'Pending' ||
      lastRunStatus === 'Skipped' ||
      lastRunStatus === 'Running'
        ? lastRunStatus
        : undefined,
    scheduleInterval: asString(raw.scheduleInterval) || undefined,
    impactedAssetsCount: asNumber(raw.impactedAssetsCount),
    impactedAssets: Array.isArray(raw.impactedAssets)
      ? raw.impactedAssets.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

/**
 * Official pipelineAPI.listPipelineSummaries (rest/pipelineAPI.ts):
 * GET /v1/pipelines/summary. Run history per pipeline reuses the
 * existing listCatalogPipelineStatuses (GET /v1/pipelines/{fqn}/status,
 * official getPipelineStatus), not a second client.
 */
export function listPipelineSummaries(
  query: ListPipelineSummariesQuery = {},
): Promise<Paged<PipelineSummary>> {
  return apiRequest<unknown>('/v1/pipelines/summary', {
    query: {
      fields: query.fields,
      service: query.service,
      search: query.search,
      status: query.status,
      domain: query.domain,
      owner: query.owner,
      tier: query.tier,
      startTs: query.startTs,
      endTs: query.endTs,
      limit: query.limit ?? 10,
      before: query.before,
      after: query.after,
      include: query.include,
    },
  }).then((payload) => parsePaged(payload, mapPipelineSummary));
}
