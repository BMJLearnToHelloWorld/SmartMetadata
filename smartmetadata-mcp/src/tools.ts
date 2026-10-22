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

export const TOOL_NAMES = [
  'search_entities',
  'get_table',
  'get_topic',
  'get_lineage',
  'list_glossaries',
  'list_tags',
  'create_conversation',
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

export interface LineageArgs {
  entityType: string;
  fqn: string;
  upstreamDepth?: number;
  downstreamDepth?: number;
}

export interface ListArgs {
  limit?: number;
  after?: string;
  parent?: string;
}

export interface ConversationArgs {
  message: string;
  about?: string;
  entityType?: string;
  fqn?: string;
}

export interface ToolHandlers {
  search_entities: (args: SearchArgs) => Promise<unknown>;
  get_table: (args: FqnArgs) => Promise<unknown>;
  get_topic: (args: FqnArgs) => Promise<unknown>;
  get_lineage: (args: LineageArgs) => Promise<unknown>;
  list_glossaries: (args: ListArgs) => Promise<unknown>;
  list_tags: (args: ListArgs) => Promise<unknown>;
  create_conversation: (args: ConversationArgs) => Promise<unknown>;
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
    async get_lineage(args) {
      const entityType = requireToken(args.entityType, 'entityType').toLowerCase();
      return client.getByFqn(`/v1/lineage/${encodeURIComponent(entityType)}/name`, requireFqn(args.fqn), {
        upstreamDepth: args.upstreamDepth === undefined ? LINEAGE_DEPTH_DEFAULT : clampLineageDepth(args.upstreamDepth),
        downstreamDepth:
          args.downstreamDepth === undefined ? LINEAGE_DEPTH_DEFAULT : clampLineageDepth(args.downstreamDepth),
      });
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
    async create_conversation(args) {
      const message = requireToken(args.message, 'message');
      const about = resolveAbout(args);
      return client.request('/v1/conversations', {
        method: 'POST',
        json: { message, about },
      });
    },
  };
}
