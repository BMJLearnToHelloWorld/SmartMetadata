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
import { requireToken } from './limits.js';
import { boundBody, clampRdfMaxBytes } from './rdf.js';
import { fetchLoggedInUser, identityOf } from './userContext.js';

/**
 * `sparql_query`: a read-only SPARQL query against the knowledge graph.
 *
 * Two REST paths, split by the caller's admin identity (a fresh
 * GET /v1/users/loggedInUser per call, never cached): administrators POST
 * the full SparqlQuery to /v1/rdf/sparql, everyone else POSTs only the
 * query to /v1/rdf/sparql/agent, which runs SELECT-only JSON with the
 * server's own row cap. A non-admin asking for any other format or
 * inference level is refused here with the pin's wording before any HTTP
 * call to the agent endpoint. The /v1/rdf/sparql/update endpoint is never
 * called: updates are rejected by the server, so this tool never sends one.
 *
 * Two deliberate gaps versus the server-side tool, both recorded in the
 * ADR: the REST response carries no query type, and this layer does no
 * SPARQL parsing, so `queryType` is omitted for graph results (CONSTRUCT
 * vs DESCRIBE are indistinguishable from the response); and a pre-call
 * option refusal has no audit-write API to call, so the explicit isError
 * tool result with the pin's wording is the record of the refusal.
 * (ADR:2026-11-10-mcp-batch-b-sparql-query)
 */

export interface SparqlQueryArgs {
  query: string;
  format?: string;
  inferenceLevel?: string;
  maxBytes?: number;
}

export interface SparqlQueryResult {
  format: string;
  queryType?: 'SELECT' | 'ASK';
  body: string;
  truncated: boolean;
  byteCount: number;
  warning?: string;
  completeness?: { status: string; reason?: string };
}

const ADMIN_FORMATS = ['json', 'xml', 'csv', 'tsv', 'turtle', 'rdfxml', 'ntriples', 'jsonld'] as const;
const INFERENCE_LEVELS = ['none', 'rdfs', 'owl', 'custom'] as const;

/** Server Content-Type (without parameters) → the format the admin tool reports. */
const MEDIA_TYPE_FORMATS: Readonly<Record<string, string>> = {
  'application/sparql-results+json': 'json',
  'application/sparql-results+xml': 'xml',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'text/turtle': 'turtle',
  'application/ld+json': 'jsonld',
  'application/n-triples': 'ntriples',
  'application/rdf+xml': 'rdfxml',
};

function normalizeAdminFormat(format: string | undefined): string {
  const normalized = (format ?? 'json').toLowerCase();
  if ((ADMIN_FORMATS as readonly string[]).includes(normalized)) {
    return normalized;
  }
  throw new Error(
    `'format' must be one of 'json', 'xml', 'csv', 'tsv', 'turtle', 'rdfxml', 'ntriples', 'jsonld', got '${format}'`,
  );
}

function normalizeInferenceLevel(inferenceLevel: string | undefined): string {
  const normalized = (inferenceLevel ?? 'none').toLowerCase();
  if ((INFERENCE_LEVELS as readonly string[]).includes(normalized)) {
    return normalized;
  }
  throw new Error(
    `'inferenceLevel' must be one of 'none', 'rdfs', 'owl', 'custom', got '${inferenceLevel}'`,
  );
}

/**
 * The result type where the response itself can tell it: JSON and XML
 * result documents carry it, tabular results are SELECT except for a lone
 * true/false ASK row, and graph documents carry no marker at all — a
 * CONSTRUCT and a DESCRIBE serialize identically, so neither is claimed.
 */
function deriveQueryType(format: string, text: string): 'SELECT' | 'ASK' | undefined {
  if (format === 'json') {
    try {
      const parsed = JSON.parse(text) as { results?: unknown; boolean?: unknown };
      if (parsed.results !== undefined) {
        return 'SELECT';
      }
      if (parsed.boolean !== undefined) {
        return 'ASK';
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (format === 'xml') {
    if (text.includes('<results')) {
      return 'SELECT';
    }
    if (text.includes('<boolean')) {
      return 'ASK';
    }
    return undefined;
  }
  if (format === 'csv' || format === 'tsv') {
    const trimmed = text.trim();
    return trimmed === 'true' || trimmed === 'false' ? 'ASK' : 'SELECT';
  }
  return undefined;
}

async function queryAsAdmin(
  client: RestClient,
  query: string,
  format: string,
  inference: string,
  maxBytes: number,
): Promise<SparqlQueryResult> {
  const { text, headers } = await client.requestText('/v1/rdf/sparql', {
    method: 'POST',
    json: { query, format, inference },
  });
  const mediaType = (headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  const resolvedFormat = MEDIA_TYPE_FORMATS[mediaType] ?? format;
  const bounded = boundBody(text, maxBytes);
  const warning = headers.get('X-OpenMetadata-Inference-Warning');
  const queryType = deriveQueryType(resolvedFormat, text);
  return {
    format: resolvedFormat,
    ...(queryType ? { queryType } : {}),
    body: bounded.value,
    truncated: bounded.truncated,
    byteCount: bounded.byteCount,
    ...(warning !== null ? { warning } : {}),
  };
}

async function queryAsAgent(
  client: RestClient,
  query: string,
  maxBytes: number,
): Promise<SparqlQueryResult> {
  const { text } = await client.requestText('/v1/rdf/sparql/agent', {
    method: 'POST',
    json: { query },
  });
  let completeness: { status: string; reason?: string } | undefined;
  try {
    const parsed = JSON.parse(text) as {
      metadata?: { completeness?: { status?: unknown; reason?: unknown } };
    };
    const raw = parsed.metadata?.completeness;
    if (raw && typeof raw.status === 'string') {
      completeness = {
        status: raw.status,
        ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
      };
    }
  } catch {
    throw new Error('Agent SPARQL response was not JSON');
  }
  const bounded = boundBody(text, maxBytes);
  return {
    format: 'json',
    queryType: 'SELECT',
    body: bounded.value,
    truncated: bounded.truncated,
    byteCount: bounded.byteCount,
    ...(completeness ? { completeness } : {}),
  };
}

export async function sparqlQuery(
  client: RestClient,
  args: SparqlQueryArgs,
): Promise<SparqlQueryResult> {
  const query = requireToken(args.query, 'query');
  const maxBytes = clampRdfMaxBytes(args.maxBytes);
  const isAdmin = identityOf(await fetchLoggedInUser(client)).isAdmin;
  if (!isAdmin) {
    // The pin's non-admin option checks, in the pin's words, before any
    // call to the agent endpoint. A format/inference the caller did not
    // set counts as the default (json/none), never as a refusal.
    const format = (args.format ?? 'json').toLowerCase();
    if (format !== 'json') {
      throw new Error(
        `'format' must be 'json' unless you are an administrator; got '${args.format}'`,
      );
    }
    const inferenceLevel = (args.inferenceLevel ?? 'none').toLowerCase();
    if (inferenceLevel !== 'none') {
      throw new Error(
        `'inferenceLevel' must be 'none' unless you are an administrator; got '${args.inferenceLevel}'`,
      );
    }
    return queryAsAgent(client, query, maxBytes);
  }
  return queryAsAdmin(
    client,
    query,
    normalizeAdminFormat(args.format),
    normalizeInferenceLevel(args.inferenceLevel),
    maxBytes,
  );
}
