/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { RestError } from './client.js';
import type { RestClient } from './client.js';
import type { RuntimeConfig } from './config.js';
import { createToolHandlers, TOOL_NAMES } from './tools.js';

export const SERVER_NAME = 'smartmetadata';
export const SERVER_VERSION = '0.12.0';

/**
 * Whether each tool only reads. The four write tools plus
 * create_conversation (a write) are false; the nine Batch A tools are all
 * true. `describe_entity_type` is not registered yet (Batch C) but is
 * already a write helper, so it is refused in read-only mode from now.
 * (ADR:2026-11-08-mcp-batch-a-read-tools)
 */
export const TOOL_READ_ONLY: Readonly<Record<string, boolean>> = {
  search_entities: true,
  get_table: true,
  get_topic: true,
  get_entity_details: true,
  get_lineage: true,
  create_lineage: false,
  list_glossaries: true,
  list_tags: true,
  find_by_tag: true,
  get_test_definitions: true,
  create_conversation: false,
  create_entity: false,
  patch_entity: false,
  create_test_case: false,
  company_context: true,
  semantic_search: true,
  get_persona_context: true,
  get_user_context: true,
  find_context: true,
  get_concept_context: true,
  root_cause_analysis: true,
  shacl_validate: true,
  ontology_describe: true,
};

/** Write helpers the read-only list hides even though they only read. */
export const WRITE_HELPER_TOOLS: ReadonlySet<string> = new Set(['describe_entity_type']);

/** Access mode for one server process (I-D5). */
export interface AccessConfig {
  readOnly?: boolean;
  disabledTools?: string[];
}

export function accessConfigOf(config: RuntimeConfig): AccessConfig {
  return { readOnly: config.readOnly, disabledTools: config.disabledTools };
}

/**
 * The tools a client may see: in read-only mode only read tools, minus
 * write helpers; then the disabled list, by name. A disabled name that
 * matches no registered tool is a warning only — a typo must not fail
 * startup.
 */
export function exposedToolNames(access: AccessConfig = {}): string[] {
  let names = [...TOOL_NAMES];
  if (access.readOnly) {
    names = names.filter(
      (name) => TOOL_READ_ONLY[name] === true && !WRITE_HELPER_TOOLS.has(name),
    );
  }
  const disabled = new Set(access.disabledTools ?? []);
  for (const name of disabled) {
    if (!TOOL_NAMES.includes(name as (typeof TOOL_NAMES)[number]) && !WRITE_HELPER_TOOLS.has(name)) {
      console.warn(`[mcp] disabled tool '${name}' is not a registered tool; ignoring`);
    }
  }
  return names.filter((name) => !disabled.has(name));
}

/**
 * Why a call to `name` must be refused under `access`, or null when the
 * call may proceed. Read-only is checked first, then disabled — the same
 * order the list filtering applies.
 */
export function toolAccessRefusal(name: string, access: AccessConfig = {}): string | null {
  if (access.readOnly && (TOOL_READ_ONLY[name] !== true || WRITE_HELPER_TOOLS.has(name))) {
    return `The MCP server is in read-only mode, so ${name} is unavailable`;
  }
  if ((access.disabledTools ?? []).includes(name)) {
    return `${name} is disabled on this MCP server`;
  }
  return null;
}

export interface RegisteredToolConfig {
  description: string;
  inputSchema: z.ZodType;
  annotations?: { readOnlyHint?: boolean };
}

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolRegistrar {
  registerTool(
    name: string,
    config: RegisteredToolConfig,
    handler: (args: Record<string, unknown>) => Promise<ToolCallResult>,
  ): void;
}

const searchSchema = z.object({
  q: z.string().optional().describe('Search query. Blank becomes *'),
  index: z.string().optional().describe('Search index. Default dataAsset'),
  from: z.number().int().optional().describe('Result offset, default 0'),
  size: z.number().int().optional().describe('Page size, default 10, max 50'),
});

const fqnSchema = z.object({
  fqn: z.string().describe('Fully qualified name'),
});

const entityDetailsSchema = z.object({
  entityType: z.string().describe('Apache catalog entity type such as table, pipeline, glossaryTerm'),
  fqn: z.string().describe('Fully qualified name'),
  fields: z.string().optional().describe('Optional fields query; defaults per entity type'),
});

const lineageSchema = z.object({
  entityType: z.string().describe('Entity type such as table or topic'),
  fqn: z.string().describe('Fully qualified name'),
  upstreamDepth: z.number().int().optional().describe('Upstream hops, clamped 0-3, default 1'),
  downstreamDepth: z.number().int().optional().describe('Downstream hops, clamped 0-3, default 1'),
});

const createLineageSchema = z.object({
  fromEntityType: z.string().describe('Source entity type'),
  fromFqn: z.string().describe('Source FQN'),
  toEntityType: z.string().describe('Target entity type'),
  toFqn: z.string().describe('Target FQN'),
  description: z.string().optional().describe('Optional edge description'),
  source: z.string().optional().describe('LineageDetails.source, default Manual'),
});

const glossaryListSchema = z.object({
  limit: z.number().int().optional().describe('Page size, default 25, max 100'),
  after: z.string().optional().describe('Pagination cursor'),
});

const tagListSchema = glossaryListSchema.extend({
  parent: z.string().optional().describe('Classification FQN to filter tags'),
});

const findByTagSchema = z.object({
  tagFqn: z.string().describe('Tag FQN such as PII.Sensitive'),
  index: z.string().optional().describe('Search index. Default dataAsset'),
  from: z.number().int().optional().describe('Result offset, default 0'),
  size: z.number().int().optional().describe('Page size, default 10, max 50'),
});

const testDefinitionsSchema = z.object({
  limit: z.number().int().optional().describe('Page size, default 25, max 100'),
  after: z.string().optional().describe('Pagination cursor'),
  entityType: z.string().optional().describe('Optional entity type filter'),
  testPlatform: z.string().optional().describe('Optional test platform filter'),
});

const conversationSchema = z.object({
  message: z.string().describe('Markdown comment body'),
  about: z.string().optional().describe('MessageParser entity link <#E::type::fqn>'),
  entityType: z.string().optional().describe('Used with fqn when about is omitted'),
  fqn: z.string().optional().describe('Used with entityType when about is omitted'),
});

const createEntitySchema = z.object({
  entityType: z.string().describe('Apache allowlisted entity type (same as get_entity_details)'),
  name: z.string().describe('Create*Request.name'),
  description: z.string().optional().describe('Create*Request.description when the schema requires/allows it'),
  displayName: z.string().optional().describe('Create*Request.displayName'),
  fields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional Apache Create*Request properties (e.g. glossary FQN for glossaryTerm). No invent.'),
});

const patchEntitySchema = z.object({
  entityType: z.string().describe('Apache allowlisted entity type'),
  fqn: z.string().describe('Fully qualified name'),
  patch: z
    .union([z.string(), z.array(z.record(z.string(), z.unknown()))])
    .describe('RFC 6902 JSON Patch array or JSON-array string'),
});

const createTestCaseSchema = z.object({
  name: z.string().describe('CreateTestCaseRequest.name'),
  fqn: z.string().describe('FQN of the tested asset (usually a table)'),
  testDefinitionName: z.string().describe('CreateTestCaseRequest.testDefinition (FQN)'),
  columnName: z.string().optional().describe('Column name for column-level tests'),
  entityType: z.string().optional().describe('entityLink type segment; default table'),
  description: z.string().optional().describe('CreateTestCaseRequest.description'),
  parameterValues: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe('CreateTestCaseRequest.parameterValues'),
});

// Batch A schemas. Descriptions state the contract in the tools' own
// words; `ignorePersonaScope` is deliberately absent from semantic_search:
// persona scope always applies, there is no REST switch to turn it off.

const companyContextSchema = z.object({
  query: z.string().optional().describe('Free-text question about company knowledge'),
  fqn: z.string().optional().describe('Knowledge pill FQN; mutually exclusive with query'),
  size: z.number().int().optional().describe('Page size, default 10, max 50'),
  from: z.number().int().optional().describe('Result offset, default 0'),
  cursor: z.string().optional().describe('Opaque page cursor from a previous response'),
});

const semanticSearchSchema = z.object({
  query: z.string().describe('Free-text query (required)'),
  filters: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe(
      'Field filters: entityType, service, serviceType, tags, owners, domains, tier, certification, database, databaseSchema, primaryEntityId, parentId, metricType, granularity, unitOfMeasurement, or customProperties.<name>',
    ),
  size: z.number().int().optional().describe('Page size, default 10, max 50'),
  from: z.number().int().optional().describe('Result offset, default 0'),
  cursor: z.string().optional().describe('Opaque page cursor from a previous response'),
  k: z.number().int().optional().describe('Vector candidates per query, default 100, max 10000'),
  threshold: z.number().optional().describe('Minimum similarity score, 0-1, default 0.0'),
});

const personaContextSchema = z.object({
  personaName: z.string().optional().describe('Persona name; omit for the caller’s active persona'),
  format: z.enum(['markdown', 'json']).optional().describe('Response format, default markdown'),
  part: z.number().int().optional().describe('Page number, default 1'),
});

const userContextSchema = z.object({
  includeOwnedSummary: z.boolean().optional().describe('Include the owned-entities summary, default true'),
  includeFollowedSummary: z.boolean().optional().describe('Include the followed-entities summary, default true'),
  ownedLimit: z.number().int().optional().describe('Owned summary page size, default 20, max 100'),
  followedLimit: z.number().int().optional().describe('Followed summary page size, default 20, max 100'),
  ownedFilter: z
    .enum(['NONE', 'MISSING_DESCRIPTION', 'MISSING_TIER', 'ANY_GAP'])
    .optional()
    .describe('Gap filter for the owned summary, default NONE'),
});

const findContextSchema = z.object({
  query: z.string().describe('Free-text query (required)'),
  size: z.number().int().optional().describe('Page size, default 10, max 50'),
  format: z.enum(['markdown', 'json']).optional().describe('Response format, default markdown'),
});

const conceptContextSchema = z.object({
  entityType: z.enum(['glossaryTerm', 'metric']).describe('Concept type: glossaryTerm or metric'),
  fqn: z.string().describe('Fully qualified name'),
  format: z.enum(['markdown', 'json']).optional().describe('Response format, default markdown'),
  query: z.string().optional().describe('Optional question the context should answer'),
});

const rootCauseSchema = z.object({
  fqn: z.string().describe('Fully qualified name of the analysed asset'),
  entityType: z.string().describe('Entity type such as table or dashboard'),
  upstreamDepth: z.number().int().optional().describe('Upstream hops, default 3, max 10'),
  downstreamDepth: z.number().int().optional().describe('Downstream hops, default 3, max 10'),
  queryFilter: z.string().optional().describe('Optional Elasticsearch query_filter for the lineage walks'),
  includeDeleted: z.boolean().optional().describe('Include deleted entities, default false'),
  includeColumnLineage: z.boolean().optional().describe('Include column-level lineage, default false'),
});

const shaclValidateSchema = z.object({
  entityId: z.string().optional().describe('Entity id; use with entityType'),
  entityType: z.string().optional().describe('Entity type; use with entityId'),
  entityUri: z.string().optional().describe('Full entity URI; mutually exclusive with entityId+entityType'),
  fullGraph: z.boolean().optional().describe('Validate the whole dataset (loads the triplestore into memory)'),
  format: z.enum(['turtle', 'jsonld']).optional().describe('Report serialization, default turtle'),
  maxBytes: z.number().int().optional().describe('Report size cap in bytes, default 80000, min 1024, max 80000'),
});

const ontologyDescribeSchema = z.object({
  resource: z
    .string()
    .optional()
    .describe('Absolute http(s) IRI to DESCRIBE; not available in this batch (Batch C)'),
  format: z
    .enum(['turtle', 'jsonld', 'ntriples', 'rdfxml'])
    .optional()
    .describe('Document serialization, default turtle'),
  maxBytes: z.number().int().optional().describe('Document size cap in bytes, default 80000, min 1024, max 80000'),
});

function toolResult(payload: unknown, isError = false): ToolCallResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

function wrap(
  name: string,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
  access: AccessConfig = {},
) {
  return async (args: Record<string, unknown>) => {
    // Second level of the access gate: the list hides refused tools, and a
    // call that reaches one anyway is refused here with the exact wording —
    // returned as an isError tool result, never silent, never a crash.
    const refusal = toolAccessRefusal(name, access);
    if (refusal) {
      return toolResult(refusal, true);
    }
    try {
      return toolResult(await handler(args));
    } catch (error) {
      if (error instanceof RestError) {
        return toolResult({ status: error.status, message: error.message }, true);
      }
      return toolResult(error instanceof Error ? error.message : String(error), true);
    }
  };
}

export function listRegisteredTools(): readonly string[] {
  return TOOL_NAMES;
}

export function registerCatalogTools(
  server: ToolRegistrar,
  client: RestClient,
  access: AccessConfig = {},
): void {
  const tools = createToolHandlers(client);
  const specs: Array<{
    name: (typeof TOOL_NAMES)[number];
    description: string;
    inputSchema: z.ZodType;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [
    {
      name: 'search_entities',
      description: 'Search catalog entities via GET /v1/search/query',
      inputSchema: searchSchema,
      handler: (args) => tools.search_entities(searchSchema.parse(args)),
    },
    {
      name: 'get_table',
      description: 'Get a table by FQN via GET /v1/tables/name/{fqn}',
      inputSchema: fqnSchema,
      handler: (args) => tools.get_table(fqnSchema.parse(args)),
    },
    {
      name: 'get_topic',
      description: 'Get a topic by FQN via GET /v1/topics/name/{fqn}',
      inputSchema: fqnSchema,
      handler: (args) => tools.get_topic(fqnSchema.parse(args)),
    },
    {
      name: 'get_entity_details',
      description:
        'Get any Apache-backed catalog entity by type+FQN via GET /v1/{collection}/name/{fqn}. Collate AI/RDF types are OutOfScope.',
      inputSchema: entityDetailsSchema,
      handler: (args) => tools.get_entity_details(entityDetailsSchema.parse(args)),
    },
    {
      name: 'get_lineage',
      description: 'Get entity lineage by FQN via GET /v1/lineage/{entity}/name/{fqn}. Depth is clamped to 0-3.',
      inputSchema: lineageSchema,
      handler: (args) => tools.get_lineage(lineageSchema.parse(args)),
    },
    {
      name: 'create_lineage',
      description:
        'Create or update a lineage edge via PUT /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} (same contract as product ingestion RestClient.put_lineage).',
      inputSchema: createLineageSchema,
      handler: (args) => tools.create_lineage(createLineageSchema.parse(args)),
    },
    {
      name: 'list_glossaries',
      description: 'List glossaries via GET /v1/glossaries (read)',
      inputSchema: glossaryListSchema,
      handler: (args) => tools.list_glossaries(glossaryListSchema.parse(args)),
    },
    {
      name: 'list_tags',
      description: 'List classification tags via GET /v1/tags (read)',
      inputSchema: tagListSchema,
      handler: (args) => tools.list_tags(tagListSchema.parse(args)),
    },
    {
      name: 'find_by_tag',
      description: 'Find catalog assets carrying a tag FQN via GET /v1/search/query with tags.tagFQN query_filter',
      inputSchema: findByTagSchema,
      handler: (args) => tools.find_by_tag(findByTagSchema.parse(args)),
    },
    {
      name: 'get_test_definitions',
      description: 'List data-quality test definitions via GET /v1/dataQuality/testDefinitions',
      inputSchema: testDefinitionsSchema,
      handler: (args) => tools.get_test_definitions(testDefinitionsSchema.parse(args)),
    },
    {
      name: 'create_conversation',
      description: 'Create a user conversation comment via POST /v1/conversations',
      inputSchema: conversationSchema,
      handler: (args) => tools.create_conversation(conversationSchema.parse(args)),
    },
    {
      name: 'create_entity',
      description:
        'Create an Apache catalog entity via POST /v1/{collection} (Create*Request). Collate/RDF types rejected. Does not invent owner/tag name resolution.',
      inputSchema: createEntitySchema,
      handler: (args) => tools.create_entity(createEntitySchema.parse(args)),
    },
    {
      name: 'patch_entity',
      description:
        'Patch an Apache catalog entity via PATCH /v1/{collection}/name/{fqn} with application/json-patch+json (RFC 6902).',
      inputSchema: patchEntitySchema,
      handler: (args) => tools.patch_entity(patchEntitySchema.parse(args)),
    },
    {
      name: 'create_test_case',
      description:
        'Create a data-quality test case via POST /v1/dataQuality/testCases (CreateTestCaseRequest: name, testDefinition, entityLink).',
      inputSchema: createTestCaseSchema,
      handler: (args) => tools.create_test_case(createTestCaseSchema.parse(args)),
    },
    {
      name: 'company_context',
      description:
        'Company knowledge pills: search by question over shared, approved, file-extracted memories, or read one pill by FQN. Persona scope always applies.',
      inputSchema: companyContextSchema,
      handler: (args) => tools.company_context(companyContextSchema.parse(args)),
    },
    {
      name: 'semantic_search',
      description:
        'Semantic search over the vector index: query, field filters, size, k, threshold. Persona scope always applies; there is no switch to turn it off.',
      inputSchema: semanticSearchSchema,
      handler: (args) => tools.semantic_search(semanticSearchSchema.parse(args)),
    },
    {
      name: 'get_persona_context',
      description:
        'The active persona’s context (or a named persona’s), one page at a time. Part 1 carries the instructions.',
      inputSchema: personaContextSchema,
      handler: (args) => tools.get_persona_context(personaContextSchema.parse(args)),
    },
    {
      name: 'get_user_context',
      description:
        'The caller’s identity, teams, roles, domains, persona, and owned/followed entity summaries.',
      inputSchema: userContextSchema,
      handler: (args) => tools.get_user_context(userContextSchema.parse(args)),
    },
    {
      name: 'find_context',
      description:
        'Company knowledge for a question: knowledge items (glossary terms, metrics, articles, pills) plus candidate assets, as markdown or JSON.',
      inputSchema: findContextSchema,
      handler: (args) => tools.find_context(findContextSchema.parse(args)),
    },
    {
      name: 'get_concept_context',
      description:
        'The server-rendered context of one glossary term or metric, as markdown or JSON.',
      inputSchema: conceptContextSchema,
      handler: (args) => tools.get_concept_context(conceptContextSchema.parse(args)),
    },
    {
      name: 'root_cause_analysis',
      description:
        'Root-cause analysis for a failing asset: failing upstream entities and their failing tests, plus downstream impact. Status is failed when any failure exists upstream or on the asset itself.',
      inputSchema: rootCauseSchema,
      handler: (args) => tools.root_cause_analysis(rootCauseSchema.parse(args)),
    },
    {
      name: 'shacl_validate',
      description:
        'SHACL validation of one entity’s subgraph (entityId+entityType, or entityUri) or the whole dataset (fullGraph=true). Admin-only; RDF 503 passes through when RDF is off.',
      inputSchema: shaclValidateSchema,
      handler: (args) => tools.shacl_validate(shaclValidateSchema.parse(args)),
    },
    {
      name: 'ontology_describe',
      description:
        'The bundled ontology document in the requested serialization. A single-resource DESCRIBE is not available in this batch.',
      inputSchema: ontologyDescribeSchema,
      handler: (args) => tools.ontology_describe(ontologyDescribeSchema.parse(args)),
    },
  ];

  // First level of the access gate: refused tools never reach tools/list.
  const exposed = new Set(exposedToolNames(access));
  for (const spec of specs) {
    if (!exposed.has(spec.name)) {
      continue;
    }
    server.registerTool(
      spec.name,
      {
        description: spec.description,
        inputSchema: spec.inputSchema,
        annotations: { readOnlyHint: TOOL_READ_ONLY[spec.name] === true },
      },
      wrap(spec.name, spec.handler, access),
    );
  }
}

export function createMcpServer(client: RestClient, access: AccessConfig = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  // Official registerTool's result union includes an InputRequired variant
  // that our text-only tools never return. Narrow at the boundary only.
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: RegisteredToolConfig,
    handler: (args: unknown) => Promise<ToolCallResult>,
  ) => void;
  registerCatalogTools(
    {
      registerTool(name, config, handler) {
        register(name, config, (args) => handler(args as Record<string, unknown>));
      },
    },
    client,
    access,
  );
  return server;
}
