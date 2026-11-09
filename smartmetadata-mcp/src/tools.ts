/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RestClient } from './client.js';
import { RestError } from './client.js';
import {
  LINEAGE_DEPTH_DEFAULT,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  SEARCH_SIZE_DEFAULT,
  SEARCH_SIZE_MAX,
  clampInt,
  clampLineageDepth,
  requireFqn,
  requireToken,
  resolveAbout,
} from './limits.js';
import { attachPaging, resolveOffset } from './paging.js';
import {
  VECTOR_K_DEFAULT,
  VECTOR_SIZE_DEFAULT,
  VECTOR_SIZE_MAX,
  addParentTotal,
  attachMetricHierarchy,
  collapseByParent,
  consumedThrough,
  fitResultsToBudget,
  searchVector,
  validateSemanticSearchParams,
} from './vector.js';
import {
  emptyFindContextMessage,
  renderFound,
  toJsonItem,
  type CandidateAsset,
  type KnowledgeItem,
} from './aiContextMarkdown.js';
import { fetchPersonaContext, pagePersonaContext } from './personaContext.js';
import { boolParam, fetchUserContext, limitParam } from './userContext.js';
import { analyzeRootCause, clampRcaDepth } from './rootCause.js';
import { ontologyDescribe, shaclValidate } from './rdf.js';

export const TABLE_FIELDS = 'owners,tags,columns,domains';
export const TOPIC_FIELDS = 'owners,tags,domains,messageSchema';
export const GLOSSARY_FIELDS = 'owners,tags,reviewers,usageCount,termCount,domains';
export const TAG_FIELDS = 'owners,reviewers,domains,children,usageCount';
export const DEFAULT_ENTITY_FIELDS = 'owners,tags,domains';

/**
 * Apache catalog entityType → REST collection segment for GET /v1/{collection}/name/{fqn}.
 * Collate-only / RDF types are intentionally absent (OutOfScope).
 */
export const ENTITY_COLLECTIONS: Readonly<Record<string, string>> = {
  table: 'tables',
  topic: 'topics',
  dashboard: 'dashboards',
  pipeline: 'pipelines',
  database: 'databases',
  databaseschema: 'databaseSchemas',
  container: 'containers',
  glossary: 'glossaries',
  glossaryterm: 'glossaryTerms',
  tag: 'tags',
  classification: 'classifications',
  chart: 'charts',
  dashboarddatamodel: 'dashboardDataModels',
  mlmodel: 'mlmodels',
  storedprocedure: 'storedProcedures',
  searchindex: 'searchIndexes',
  metric: 'metrics',
  apicollection: 'apiCollections',
  apiendpoint: 'apiEndpoints',
  dataproduct: 'dataProducts',
  domain: 'domains',
};

export const ENTITY_FIELDS: Readonly<Record<string, string>> = {
  table: TABLE_FIELDS,
  topic: TOPIC_FIELDS,
  glossary: GLOSSARY_FIELDS,
  tag: TAG_FIELDS,
};

export const TOOL_NAMES = [
  'search_entities',
  'get_table',
  'get_topic',
  'get_entity_details',
  'get_lineage',
  'create_lineage',
  'list_glossaries',
  'list_tags',
  'find_by_tag',
  'get_test_definitions',
  'create_conversation',
  'create_entity',
  'patch_entity',
  'create_test_case',
  // Batch A (read-only, clean-room): tool names and parameter contracts only.
  // (ADR:2026-11-08-mcp-batch-a-read-tools)
  'company_context',
  'semantic_search',
  'get_persona_context',
  'get_user_context',
  'find_context',
  'get_concept_context',
  'root_cause_analysis',
  'shacl_validate',
  'ontology_describe',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface SearchArgs {
  q?: string;
  index?: string;
  from?: number;
  size?: number;
}

export interface FqnArgs {
  fqn: string;
}

export interface EntityDetailsArgs {
  entityType: string;
  fqn: string;
  fields?: string;
}

export interface LineageArgs {
  entityType: string;
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
}

export interface CreateLineageArgs {
  fromEntityType: string;
  fromFqn: string;
  toEntityType: string;
  toFqn: string;
  description?: string;
  source?: string;
}

export interface ListArgs {
  limit?: number;
  after?: string;
  parent?: string;
}

export interface FindByTagArgs {
  tagFqn: string;
  index?: string;
  from?: number;
  size?: number;
}

export interface TestDefinitionsArgs {
  limit?: number;
  after?: string;
  entityType?: string;
  testPlatform?: string;
}

export interface ConversationArgs {
  message: string;
  about?: string;
  entityType?: string;
  fqn?: string;
}

export interface CreateEntityArgs {
  entityType: string;
  name: string;
  description?: string;
  displayName?: string;
  /** Additional Apache Create*Request fields (glossary, parent, …). No Collate invent. */
  fields?: Record<string, unknown>;
}

export interface PatchEntityArgs {
  entityType: string;
  fqn: string;
  /** RFC 6902 JSON Patch document: array or JSON-array string. */
  patch: unknown;
}

export interface CreateTestCaseArgs {
  name: string;
  /** Table (or other tested asset) FQN for the Apache entityLink. */
  fqn: string;
  testDefinitionName: string;
  columnName?: string;
  /** Entity type segment in entityLink; default table. */
  entityType?: string;
  description?: string;
  parameterValues?: Array<Record<string, unknown>>;
}

export interface CompanyContextArgs {
  /** Free-text question; mutually exclusive with `fqn`. */
  query?: string;
  /** Pill FQN; mutually exclusive with `query`. */
  fqn?: string;
  size?: number;
  from?: number;
  cursor?: string;
}

export interface SemanticSearchArgs {
  query: string;
  filters?: Record<string, string[]>;
  size?: number;
  from?: number;
  cursor?: string;
  k?: number;
  threshold?: number;
}

export interface PersonaContextArgs {
  personaName?: string;
  format?: string;
  part?: number;
}

export interface UserContextArgs {
  includeOwnedSummary?: boolean;
  includeFollowedSummary?: boolean;
  ownedLimit?: number;
  followedLimit?: number;
  ownedFilter?: string;
}

export interface FindContextArgs {
  query: string;
  size?: number;
  format?: string;
}

export interface ConceptContextArgs {
  entityType: string;
  fqn: string;
  format?: string;
  query?: string;
}

export interface RootCauseArgs {
  fqn: string;
  entityType: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
  queryFilter?: string;
  includeDeleted?: boolean;
  includeColumnLineage?: boolean;
}

export interface ShaclValidateArgs {
  entityId?: string;
  entityType?: string;
  entityUri?: string;
  fullGraph?: boolean;
  format?: string;
  maxBytes?: number;
}

export interface OntologyDescribeArgs {
  resource?: string;
  format?: string;
  maxBytes?: number;
}

export interface ToolHandlers {
  search_entities: (args: SearchArgs) => Promise<unknown>;
  get_table: (args: FqnArgs) => Promise<unknown>;
  get_topic: (args: FqnArgs) => Promise<unknown>;
  get_entity_details: (args: EntityDetailsArgs) => Promise<unknown>;
  get_lineage: (args: LineageArgs) => Promise<unknown>;
  create_lineage: (args: CreateLineageArgs) => Promise<unknown>;
  list_glossaries: (args: ListArgs) => Promise<unknown>;
  list_tags: (args: ListArgs) => Promise<unknown>;
  find_by_tag: (args: FindByTagArgs) => Promise<unknown>;
  get_test_definitions: (args: TestDefinitionsArgs) => Promise<unknown>;
  create_conversation: (args: ConversationArgs) => Promise<unknown>;
  create_entity: (args: CreateEntityArgs) => Promise<unknown>;
  patch_entity: (args: PatchEntityArgs) => Promise<unknown>;
  create_test_case: (args: CreateTestCaseArgs) => Promise<unknown>;
  company_context: (args: CompanyContextArgs) => Promise<unknown>;
  semantic_search: (args: SemanticSearchArgs) => Promise<unknown>;
  get_persona_context: (args: PersonaContextArgs) => Promise<unknown>;
  get_user_context: (args: UserContextArgs) => Promise<unknown>;
  find_context: (args: FindContextArgs) => Promise<unknown>;
  get_concept_context: (args: ConceptContextArgs) => Promise<unknown>;
  root_cause_analysis: (args: RootCauseArgs) => Promise<unknown>;
  shacl_validate: (args: ShaclValidateArgs) => Promise<unknown>;
  ontology_describe: (args: OntologyDescribeArgs) => Promise<unknown>;
}

export function resolveEntityCollection(entityType: string): string {
  const key = requireToken(entityType, 'entityType').toLowerCase();
  const collection = ENTITY_COLLECTIONS[key];
  if (!collection) {
    throw new Error(
      `Unsupported entityType "${entityType}". Apache-backed types: ${Object.keys(ENTITY_COLLECTIONS).sort().join(', ')}`,
    );
  }
  return collection;
}

export const JSON_PATCH_CONTENT_TYPE = 'application/json-patch+json';

export function parseJsonPatch(patch: unknown): unknown[] {
  let value: unknown = patch;
  if (typeof patch === 'string') {
    const trimmed = patch.trim();
    if (!trimmed) {
      throw new Error('patch is required');
    }
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error('patch must be a JSON array of RFC 6902 operations');
    }
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('patch must be a non-empty JSON array of RFC 6902 operations');
  }
  for (const op of value) {
    if (!op || typeof op !== 'object' || Array.isArray(op)) {
      throw new Error('each patch entry must be an object with op and path');
    }
    const rec = op as Record<string, unknown>;
    if (typeof rec.op !== 'string' || typeof rec.path !== 'string' || !rec.path.startsWith('/')) {
      throw new Error('each patch entry needs string op and path starting with /');
    }
  }
  return value;
}

/**
 * Apache CreateTestCase.entityLink (MessageParser): <#E::table::fqn> or
 * <#E::table::fqn::columns::col>.
 */
export function buildTestCaseEntityLink(args: {
  fqn: string;
  columnName?: string;
  entityType?: string;
}): string {
  const entityType = (args.entityType?.trim() || 'table').toLowerCase();
  const fqn = requireFqn(args.fqn);
  const column = args.columnName?.trim();
  if (column) {
    return `<#E::${entityType}::${fqn}::columns::${column}>`;
  }
  return `<#E::${entityType}::${fqn}>`;
}

/** A search hit carries the same fields as a stored pill, plus its score. */
function projectPillHit(hit: Record<string, unknown>): Record<string, unknown> {
  const pill: Record<string, unknown> = {};
  for (const field of [
    'fullyQualifiedName',
    'name',
    'title',
    'question',
    'answer',
    'summary',
    'sourceFile',
  ]) {
    if (hit[field] !== undefined && hit[field] !== null) {
      pill[field] = hit[field];
    }
  }
  if (hit._score !== undefined && hit._score !== null) {
    pill.similarityScore = hit._score;
  }
  return pill;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A stored pill, projected the same way. The by-name scope is a
 * file-extracted, approved, Shared pill; anything else is reported as
 * not-found, which keeps the answer the same whether or not it exists.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */
function projectPill(memory: Record<string, unknown>): Record<string, unknown> {
  const pill: Record<string, unknown> = {};
  for (const field of ['fullyQualifiedName', 'name', 'title', 'question', 'answer', 'summary', 'memoryType']) {
    if (memory[field] !== undefined && memory[field] !== null) {
      pill[field] = memory[field];
    }
  }
  const sourceFile = memory.sourceFile;
  if (isRecord(sourceFile) && sourceFile.fullyQualifiedName !== undefined && sourceFile.fullyQualifiedName !== null) {
    pill.sourceFile = sourceFile.fullyQualifiedName;
  } else if (typeof sourceFile === 'string') {
    pill.sourceFile = sourceFile;
  }
  return pill;
}

function isExposablePill(memory: Record<string, unknown>): boolean {
  return (
    memory.sourceType === 'FILE_EXTRACTION' &&
    memory.entityStatus === 'APPROVED' &&
    memory.visibility === 'Shared'
  );
}

function companyContextNotFound(fqn: string): Error {
  return new Error(`No Company Context knowledge pill found for '${fqn}'`);
}


function entityFields(entityType: string, override?: string): string {
  if (override?.trim()) {
    return override.trim();
  }
  const key = entityType.trim().toLowerCase();
  return ENTITY_FIELDS[key] ?? DEFAULT_ENTITY_FIELDS;
}

function tagQueryFilter(tagFqn: string): string {
  return JSON.stringify({
    query: {
      bool: {
        must: [{ term: { 'tags.tagFQN': tagFqn } }],
      },
    },
  });
}

export function createToolHandlers(client: RestClient): ToolHandlers {
  return {
    async search_entities(args) {
      const q = args.q?.trim() ? args.q.trim() : '*';
      return client.request('/v1/search/query', {
        query: {
          q,
          index: args.index?.trim() || 'dataAsset',
          from: clampInt(args.from, 0, 10_000, 0),
          size: clampInt(args.size, 1, SEARCH_SIZE_MAX, SEARCH_SIZE_DEFAULT),
          include_aggregations: false,
        },
      });
    },
    async get_table(args) {
      return client.getByFqn('/v1/tables/name', requireFqn(args.fqn), { fields: TABLE_FIELDS });
    },
    async get_topic(args) {
      return client.getByFqn('/v1/topics/name', requireFqn(args.fqn), { fields: TOPIC_FIELDS });
    },
    async get_entity_details(args) {
      const entityType = requireToken(args.entityType, 'entityType');
      const collection = resolveEntityCollection(entityType);
      return client.getByFqn(`/v1/${collection}/name`, requireFqn(args.fqn), {
        fields: entityFields(entityType, args.fields),
      });
    },
    async get_lineage(args) {
      const entityType = requireToken(args.entityType, 'entityType').toLowerCase();
      return client.getByFqn(`/v1/lineage/${encodeURIComponent(entityType)}/name`, requireFqn(args.fqn), {
        upstreamDepth: args.upstreamDepth === undefined ? LINEAGE_DEPTH_DEFAULT : clampLineageDepth(args.upstreamDepth),
        downstreamDepth:
          args.downstreamDepth === undefined ? LINEAGE_DEPTH_DEFAULT : clampLineageDepth(args.downstreamDepth),
      });
    },
    async create_lineage(args) {
      const fromType = requireToken(args.fromEntityType, 'fromEntityType').toLowerCase();
      const toType = requireToken(args.toEntityType, 'toEntityType').toLowerCase();
      const fromFqn = requireFqn(args.fromFqn);
      const toFqn = requireFqn(args.toFqn);
      const path =
        `/v1/lineage/${encodeURIComponent(fromType)}/name/${encodeURIComponent(fromFqn)}` +
        `/${encodeURIComponent(toType)}/name/${encodeURIComponent(toFqn)}`;
      const body: Record<string, unknown> = {
        source: args.source?.trim() || 'Manual',
      };
      if (args.description?.trim()) {
        body.description = args.description.trim();
      }
      return client.request(path, { method: 'PUT', json: body });
    },
    list_glossaries(args) {
      return client.request('/v1/glossaries', {
        query: {
          fields: GLOSSARY_FIELDS,
          limit: clampInt(args.limit, 1, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT),
          after: args.after?.trim() || undefined,
        },
      });
    },
    list_tags(args) {
      return client.request('/v1/tags', {
        query: {
          fields: TAG_FIELDS,
          limit: clampInt(args.limit, 1, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT),
          after: args.after?.trim() || undefined,
          parent: args.parent?.trim() || undefined,
        },
      });
    },
    async find_by_tag(args) {
      const tagFqn = requireToken(args.tagFqn, 'tagFqn');
      return client.request('/v1/search/query', {
        query: {
          q: '*',
          index: args.index?.trim() || 'dataAsset',
          from: clampInt(args.from, 0, 10_000, 0),
          size: clampInt(args.size, 1, SEARCH_SIZE_MAX, SEARCH_SIZE_DEFAULT),
          query_filter: tagQueryFilter(tagFqn),
          include_aggregations: false,
        },
      });
    },
    async get_test_definitions(args) {
      return client.request('/v1/dataQuality/testDefinitions', {
        query: {
          limit: clampInt(args.limit, 1, LIST_LIMIT_MAX, LIST_LIMIT_DEFAULT),
          after: args.after?.trim() || undefined,
          entityType: args.entityType?.trim() || undefined,
          testPlatform: args.testPlatform?.trim() || undefined,
        },
      });
    },
    async create_conversation(args) {
      const message = requireToken(args.message, 'message');
      const about = resolveAbout(args);
      return client.request('/v1/conversations', {
        method: 'POST',
        json: { message, about },
      });
    },
    async create_entity(args) {
      const entityType = requireToken(args.entityType, 'entityType');
      const collection = resolveEntityCollection(entityType);
      const name = requireToken(args.name, 'name');
      const body: Record<string, unknown> = { name };
      if (args.description?.trim()) {
        body.description = args.description.trim();
      }
      if (args.displayName?.trim()) {
        body.displayName = args.displayName.trim();
      }
      if (args.fields) {
        if (typeof args.fields !== 'object' || Array.isArray(args.fields)) {
          throw new Error('fields must be an object of Apache Create*Request properties');
        }
        for (const [key, value] of Object.entries(args.fields)) {
          if (key === 'name' || key === 'description' || key === 'displayName') {
            continue;
          }
          body[key] = value;
        }
      }
      return client.request(`/v1/${collection}`, { method: 'POST', json: body });
    },
    async patch_entity(args) {
      const entityType = requireToken(args.entityType, 'entityType');
      const collection = resolveEntityCollection(entityType);
      const fqn = requireFqn(args.fqn);
      const patch = parseJsonPatch(args.patch);
      return client.request(`/v1/${collection}/name/${encodeURIComponent(fqn)}`, {
        method: 'PATCH',
        json: patch,
        contentType: JSON_PATCH_CONTENT_TYPE,
      });
    },
    async create_test_case(args) {
      const name = requireToken(args.name, 'name');
      const testDefinition = requireToken(args.testDefinitionName, 'testDefinitionName');
      const entityLink = buildTestCaseEntityLink(args);
      const body: Record<string, unknown> = { name, testDefinition, entityLink };
      if (args.description?.trim()) {
        body.description = args.description.trim();
      }
      if (args.parameterValues !== undefined) {
        if (!Array.isArray(args.parameterValues)) {
          throw new Error('parameterValues must be an array');
        }
        body.parameterValues = args.parameterValues;
      }
      return client.request('/v1/dataQuality/testCases', { method: 'POST', json: body });
    },
    async company_context(args) {
      const hasQuery = !!args.query?.trim();
      const hasFqn = !!args.fqn?.trim();
      if (hasQuery === hasFqn) {
        throw new Error("Either 'query' or 'fqn' must be provided, but not both");
      }
      if (hasFqn) {
        const fqn = requireFqn(args.fqn);
        let memory: Record<string, unknown>;
        try {
          memory = await client.getByFqn<Record<string, unknown>>(
            '/v1/contextCenter/memories/name',
            fqn,
            { fields: 'sourceFile,tags,domains' },
          );
        } catch (error) {
          if (error instanceof RestError && error.status === 404) {
            throw companyContextNotFound(fqn);
          }
          throw error;
        }
        if (!isExposablePill(memory)) {
          throw companyContextNotFound(fqn);
        }
        return projectPill(memory);
      }
      const query = args.query!.trim();
      const size = clampInt(args.size, 1, VECTOR_SIZE_MAX, VECTOR_SIZE_DEFAULT);
      const from = resolveOffset(args.cursor, args.from ?? 0);
      const response = await searchVector(client, {
        query,
        filters: {
          entityType: ['contextMemory'],
          sourceType: ['FILE_EXTRACTION'],
          visibility: ['Shared'],
          entityStatus: ['APPROVED'],
        },
        size,
        from,
        k: VECTOR_K_DEFAULT,
        threshold: 0,
      });
      const pills = (response.hits ?? []).map((hit) => projectPillHit(hit));
      const result: Record<string, unknown> = {
        query,
        results: pills,
        returnedCount: pills.length,
      };
      const rawCount = pills.length;
      fitResultsToBudget(result, pills, 'knowledge pills');
      attachPaging(
        result,
        {
          from,
          rawCount,
          consumed: typeof result.returnedCount === 'number' ? result.returnedCount : 0,
          requestedSize: size,
        },
        { totalHits: response.totalHits, hasMore: response.hasMore },
        "Showing %d knowledge pills. Pass 'nextCursor' to fetch the next page.",
      );
      return result;
    },
    async semantic_search(args) {
      const error = validateSemanticSearchParams(
        args.query,
        args as unknown as Record<string, unknown>,
        args.filters,
      );
      if (error) {
        throw new Error(error);
      }
      const query = args.query.trim();
      const size = clampInt(args.size, 1, VECTOR_SIZE_MAX, VECTOR_SIZE_DEFAULT);
      const from = resolveOffset(args.cursor, args.from ?? 0);
      const response = await searchVector(client, {
        query,
        filters: args.filters,
        size,
        from,
        k: args.k,
        threshold: args.threshold,
      });
      const hits = response.hits ?? [];
      if (hits.length === 0) {
        return {
          query,
          ...(response.tookMillis !== undefined ? { tookMillis: response.tookMillis } : {}),
          results: [],
          totalFound: 0,
          returnedCount: 0,
          message: 'No results found for semantic search',
        };
      }
      const ranked = collapseByParent(hits);
      const result: Record<string, unknown> = {
        query,
        ...(response.tookMillis !== undefined ? { tookMillis: response.tookMillis } : {}),
        results: ranked,
        returnedCount: ranked.length,
        usage:
          "To get full details for any result, call get_entity_details with the result's exact 'entityType' and 'fullyQualifiedName' values.",
      };
      await attachMetricHierarchy(client, ranked, result);
      fitResultsToBudget(result, ranked);
      const consumed = consumedThrough(
        ranked.length,
        typeof result.returnedCount === 'number' ? result.returnedCount : 0,
      );
      attachPaging(
        result,
        { from, rawCount: ranked.length, consumed, requestedSize: size },
        { totalHits: response.totalHits, hasMore: response.hasMore },
        "Showing %d results. Pass 'nextCursor' to fetch the next page, or refine your query. " +
          "Adjust 'threshold' to filter by similarity score.",
      );
      addParentTotal(result, from);
      return result;
    },
    async get_persona_context(args) {
      const format = (args.format?.trim().toLowerCase() || 'markdown') as 'markdown' | 'json';
      if (format !== 'markdown' && format !== 'json') {
        throw new Error(`'format' must be 'markdown' or 'json', got '${args.format}'`);
      }
      // An out-of-range part is a caller error, not a value to clamp:
      // pagePersonaContext reports the valid range.
      const part = args.part === undefined ? 1 : Math.trunc(args.part);
      const fetched = await fetchPersonaContext(
        client,
        args.personaName?.trim() || undefined,
        format,
      );
      return pagePersonaContext(fetched, format, part);
    },
    async get_user_context(args) {
      return fetchUserContext(client, {
        includeOwnedSummary: boolParam(args.includeOwnedSummary, true),
        includeFollowedSummary: boolParam(args.includeFollowedSummary, true),
        ownedLimit: limitParam(args.ownedLimit),
        followedLimit: limitParam(args.followedLimit),
        ownedFilter: args.ownedFilter,
      });
    },
    async find_context(args) {
      const query = args.query?.trim();
      if (!query) {
        throw new Error("'query' parameter is required");
      }
      const size = clampInt(args.size, 1, VECTOR_SIZE_MAX, VECTOR_SIZE_DEFAULT);
      const format = (args.format?.trim().toLowerCase() || 'markdown') as 'markdown' | 'json';
      if (format !== 'markdown' && format !== 'json') {
        throw new Error(`'format' must be 'markdown' or 'json', got '${args.format}'`);
      }
      const response = await client.request<{
        items?: KnowledgeItem[];
        candidateAssets?: CandidateAsset[];
      }>('/v1/ai/context/find', { query: { q: query, size } });
      const items = Array.isArray(response.items) ? response.items : [];
      const candidateAssets = Array.isArray(response.candidateAssets)
        ? response.candidateAssets
        : [];
      const result: Record<string, unknown> = {};
      await attachMetricHierarchy(
        client,
        items as unknown as Array<Record<string, unknown>>,
        result,
        { slim: false },
      );
      if (format === 'json') {
        const out: Record<string, unknown> = {
          items: items.map((item) => toJsonItem(item)),
          candidateAssets,
        };
        if (items.length === 0) {
          out.message = emptyFindContextMessage(query);
        }
        if (result.metricHierarchyNote) {
          out.metricHierarchyNote = result.metricHierarchyNote;
        }
        return out;
      }
      const out: Record<string, unknown> = {
        format: 'markdown',
        content: renderFound(items, candidateAssets),
      };
      if (items.length === 0) {
        out.message = emptyFindContextMessage(query);
      }
      if (result.metricHierarchyNote) {
        out.metricHierarchyNote = result.metricHierarchyNote;
      }
      return out;
    },
    async get_concept_context(args) {
      const entityType = requireToken(args.entityType, 'entityType');
      const lowered = entityType.toLowerCase();
      if (lowered !== 'glossaryterm' && lowered !== 'metric') {
        throw new Error("entityType must be glossaryTerm or metric, and format must be markdown or json");
      }
      const format = (args.format?.trim().toLowerCase() || 'markdown') as 'markdown' | 'json';
      if (format !== 'markdown' && format !== 'json') {
        throw new Error("entityType must be glossaryTerm or metric, and format must be markdown or json");
      }
      const collection = resolveEntityCollection(entityType);
      const fqn = requireFqn(args.fqn);
      const query: Record<string, string | undefined> = { format };
      if (args.query?.trim()) {
        query.query = args.query.trim();
      }
      if (format === 'markdown') {
        const { text } = await client.requestText(`/v1/${collection}/name/${encodeURIComponent(fqn)}/context`, {
          query,
        });
        return { format: 'markdown', content: text };
      }
      return client.request(`/v1/${collection}/name/${encodeURIComponent(fqn)}/context`, {
        query,
      });
    },
    async root_cause_analysis(args) {
      return analyzeRootCause(client, {
        fqn: requireFqn(args.fqn),
        entityType: requireToken(args.entityType, 'entityType'),
        upstreamDepth: clampRcaDepth(args.upstreamDepth),
        downstreamDepth: clampRcaDepth(args.downstreamDepth),
        queryFilter: args.queryFilter?.trim() || undefined,
        includeDeleted: boolParam(args.includeDeleted, false),
        includeColumnLineage: boolParam(args.includeColumnLineage, false),
      });
    },
    async shacl_validate(args) {
      return shaclValidate(client, {
        entityId: args.entityId,
        entityType: args.entityType,
        entityUri: args.entityUri,
        fullGraph: args.fullGraph,
        format: args.format,
        maxBytes: args.maxBytes,
      });
    },
    async ontology_describe(args) {
      return ontologyDescribe(client, {
        resource: args.resource,
        format: args.format,
        maxBytes: args.maxBytes,
      });
    },
  };
}
