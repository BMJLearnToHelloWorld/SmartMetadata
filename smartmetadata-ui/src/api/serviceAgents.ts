/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { entityTypeForKind } from '@/ingestion/connections';
import type { Paged } from '@/types/admin';
import type { IngestionPipeline, ServiceKind } from '@/types/ingestion';
import { getEncodedFqn } from '@/utils/fqnPaths';
import { listIngestionPipelines, mapIngestionPipeline } from './ingestionPipelines';
import { escapeESReservedCharacters } from './search';
import {
  getServiceDisplayNameQueryFilter,
  searchServiceIndex,
  SERVICE_SEARCH_INDEX,
} from './serviceSearch';

/**
 * Pin OPEN_METADATA (constants/ServiceType.constant.ts): the FQN of
 * the built-in OpenMetadata service, whose agents tab never fetches
 * — the guard lives in the fetch-mode resolver, not in the list
 * function, so refresh and page-change keep their own rules.
 */
export const OPEN_METADATA_SERVICE_FQN = 'OpenMetadata';

/**
 * Pin SERVICE_INGESTION_PIPELINE_TYPES (constants/ServiceType.
 * constant.ts), in pin order: the eight pipeline types the agents
 * search defaults to when no type filter is selected. This is the
 * pin subset, not the full twelve-value PIPELINE_TYPES.
 */
export const SERVICE_INGESTION_PIPELINE_TYPES = [
  'metadata',
  'usage',
  'lineage',
  'profiler',
  'autoClassification',
  'dbt',
  'policyAgent',
  'reverseMetadata',
] as const;

export type ServiceIngestionPipelineType = (typeof SERVICE_INGESTION_PIPELINE_TYPES)[number];

export function isOpenMetadataService(serviceFqn: string): boolean {
  return serviceFqn === OPEN_METADATA_SERVICE_FQN;
}

export interface ListServiceAgentsOptions {
  serviceFqn: string;
  kind: ServiceKind;
  pageSize: number;
  cursor?: { type: 'after' | 'before'; value: string };
}

/**
 * Pin getAllIngestionWorkflows list call (ServiceDetailsPage.tsx):
 * fields owners + pipelineStatuses, service filter by FQN, service
 * type from the category, agentType metadata. Deliberately no
 * OpenMetadata guard: the scheduler owns that decision, and refresh
 * must list even for the OpenMetadata service.
 */
export function listServiceAgents(
  options: ListServiceAgentsOptions,
): Promise<Paged<IngestionPipeline>> {
  return listIngestionPipelines({
    fields: 'owners,pipelineStatuses',
    serviceFilter: options.serviceFqn,
    serviceType: entityTypeForKind(options.kind),
    agentType: 'metadata',
    limit: options.pageSize,
    after: options.cursor?.type === 'after' ? options.cursor.value : undefined,
    before: options.cursor?.type === 'before' ? options.cursor.value : undefined,
  });
}

export interface SearchServiceAgentsOptions {
  searchText: string;
  /** 1-based page number, forwarded to the offset-paged search. */
  page: number;
  pageSize: number;
  /**
   * Service display name for the base filter (pin passes
   * getEntityName(serviceDetails): displayName || name || ''). The
   * caller owns that fallback; this layer takes the string.
   */
  serviceDisplayName: string;
  /** Selected pipeline type keys; empty selects all eight agent types. */
  typeFilter: string[];
  /** Selected pipeline state keys; empty means no status clause. */
  statusFilter: string[];
}

/**
 * Pin searchPipelines (ServiceDetailsPage.tsx): the displayName base
 * filter combined with type and status should-clauses (each with
 * minimum_should_match 1), searched on the ingestionPipeline index
 * with the escaped, encoded search text wrapped in `*...*`. No
 * trackTotalHits: the pin call does not send it. Hit sources are
 * normalized through mapIngestionPipeline, the same mapper the list
 * path uses; the paging carries only the total, as the pin does.
 */
export async function searchServiceAgents(
  options: SearchServiceAgentsOptions,
): Promise<Paged<IngestionPipeline>> {
  const typeFilterArray =
    options.typeFilter.length > 0 ? options.typeFilter : [...SERVICE_INGESTION_PIPELINE_TYPES];
  const baseQueryFilter = getServiceDisplayNameQueryFilter(options.serviceDisplayName);
  const filterClauses: Array<Record<string, unknown>> = [];
  if (typeFilterArray.length > 0) {
    filterClauses.push({
      bool: {
        should: typeFilterArray.map((type) => ({ term: { pipelineType: type } })),
        minimum_should_match: 1,
      },
    });
  }
  if (options.statusFilter.length > 0) {
    filterClauses.push({
      bool: {
        should: options.statusFilter.map((status) => ({
          term: { 'pipelineStatuses.pipelineState': status },
        })),
        minimum_should_match: 1,
      },
    });
  }
  const baseMust = (
    (baseQueryFilter.query as Record<string, unknown> | undefined)?.bool as
      | Record<string, unknown>
      | undefined
  )?.must;
  const combinedQueryFilter =
    filterClauses.length > 0
      ? {
          query: {
            bool: {
              must: [...(Array.isArray(baseMust) ? baseMust : []), ...filterClauses],
            },
          },
        }
      : baseQueryFilter;
  const response = await searchServiceIndex({
    pageNumber: options.page,
    pageSize: options.pageSize,
    searchIndex: SERVICE_SEARCH_INDEX.INGESTION_PIPELINE,
    query: `*${getEncodedFqn(escapeESReservedCharacters(options.searchText ?? ''))}*`,
    queryFilter: combinedQueryFilter,
  });
  const data = response.hits.flatMap((hit) => {
    const mapped = mapIngestionPipeline(hit);
    return mapped ? [mapped] : [];
  });
  return { data, total: response.total };
}

export type AgentsFetchMode = 'skip' | 'list' | 'search';

/**
 * Pin agents effect scheduling (ServiceDetailsPage.tsx): the
 * OpenMetadata service never fetches; with all three filters empty
 * the tab lists, otherwise it searches. The asymmetries are
 * deliberate and must not be "unified": refresh and page-change
 * resolve differently below.
 */
export function resolveAgentsFetchMode(options: {
  searchText: string;
  typeFilter: string[];
  statusFilter: string[];
  isOpenMetadata: boolean;
}): AgentsFetchMode {
  if (options.isOpenMetadata) {
    return 'skip';
  }
  if (
    !options.searchText &&
    options.typeFilter.length === 0 &&
    options.statusFilter.length === 0
  ) {
    return 'list';
  }
  return 'search';
}

/**
 * Pin refreshAgentsList: no OpenMetadata guard, and only the search
 * text decides — empty re-lists, non-empty re-runs the current
 * search. Filters are never cleared by a refresh.
 */
export function resolveAgentsRefreshMode(searchText: string): 'list' | 'search' {
  return searchText ? 'search' : 'list';
}

export type AgentsPageChange =
  | { kind: 'cursor-list'; cursor: { type: 'after' | 'before'; value: string } }
  | { kind: 'search' }
  | { kind: 'none' };

/**
 * Pin agents onPageChange: a cursor change fetches the cursor page
 * from the list; otherwise a non-empty search text re-searches; with
 * neither, nothing fetches at all.
 */
export function resolveAgentsPageChange(options: {
  cursorType?: 'after' | 'before';
  cursorValue?: string;
  searchText: string;
}): AgentsPageChange {
  if (options.cursorType) {
    return {
      kind: 'cursor-list',
      cursor: { type: options.cursorType, value: options.cursorValue ?? '' },
    };
  }
  if (options.searchText) {
    return { kind: 'search' };
  }
  return { kind: 'none' };
}
