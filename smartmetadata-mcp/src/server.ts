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
import { createToolHandlers, TOOL_NAMES } from './tools.js';

export const SERVER_NAME = 'smartmetadata';
export const SERVER_VERSION = '0.11.0';

export interface RegisteredToolConfig {
  description: string;
  inputSchema: z.ZodType;
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

function toolResult(payload: unknown, isError = false): ToolCallResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

function wrap(handler: (args: Record<string, unknown>) => Promise<unknown>) {
  return async (args: Record<string, unknown>) => {
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

export function registerCatalogTools(server: ToolRegistrar, client: RestClient): void {
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
  ];

  for (const spec of specs) {
    server.registerTool(spec.name, { description: spec.description, inputSchema: spec.inputSchema }, wrap(spec.handler));
  }
}

export function createMcpServer(client: RestClient): McpServer {
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
  );
  return server;
}
