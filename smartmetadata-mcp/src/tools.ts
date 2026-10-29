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
  };
}
