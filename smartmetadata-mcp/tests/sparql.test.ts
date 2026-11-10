/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { RestClient } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';
import { registerCatalogTools } from '../src/server.js';
import { createToolHandlers } from '../src/tools.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
  readOnly: false,
  disabledTools: [],
};

function handlers(fetchImpl: typeof fetch) {
  return createToolHandlers(new RestClient(config, fetchImpl));
}

const SELECT_QUERY = 'SELECT ?s WHERE { ?s a <https://open-metadata.org/ontology/Table> } LIMIT 250';

interface Route {
  path: string;
  body: string;
  status?: number;
  headers?: Record<string, string>;
}

/** Route fetch by exact path: /v1/rdf/sparql/agent must not match the /v1/rdf/sparql route. */
function routedFetch(isAdmin: boolean, routes: Route[]) {
  const byPath = new Map(routes.map((route) => [route.path, route]));
  return vi.fn(async (url: string) => {
    const path = new URL(url).pathname.replace(/^\/api/, '');
    if (path === '/v1/users/loggedInUser') {
      return new Response(JSON.stringify({ id: 'u1', name: 'caller', isAdmin }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const route = byPath.get(path);
    if (!route) {
      return new Response(JSON.stringify({ message: `no route for ${path}` }), { status: 404 });
    }
    return new Response(route.body, {
      status: route.status ?? 200,
      headers: route.headers ?? { 'Content-Type': 'application/json' },
    });
  });
}

function sparqlJsonBody(bindings: unknown[] = []) {
  return JSON.stringify({ head: { vars: ['s'] }, results: { bindings } });
}

function agentBody(completeness: Record<string, unknown>) {
  return JSON.stringify({
    head: { vars: ['s'] },
    results: { bindings: [] },
    metadata: {
      completeness,
      effectiveLimits: { serverRowLimit: 1000, explicitQueryLimit: null, outputBytesLimit: 80000 },
    },
  });
}

describe('sparql_query (admin)', () => {
  it('POSTs the full SparqlQuery to /v1/rdf/sparql and resolves format + queryType from the response', async () => {
    const fetchImpl = routedFetch(true, [
      {
        path: '/v1/rdf/sparql',
        body: sparqlJsonBody(),
        headers: { 'Content-Type': 'application/sparql-results+json' },
      },
    ]);
    const result = await handlers(fetchImpl).sparql_query({
      query: SELECT_QUERY,
      format: 'json',
      inferenceLevel: 'none',
    });
    const calls = fetchImpl.mock.calls.map((call) => call[0] as string);
    expect(calls).toContain('http://om.example/api/v1/users/loggedInUser');
    const sparqlCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('/v1/rdf/sparql'),
    )!;
    expect(sparqlCall[0]).toBe('http://om.example/api/v1/rdf/sparql');
    expect((sparqlCall[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((sparqlCall[1] as RequestInit).body))).toEqual({
      query: SELECT_QUERY,
      format: 'json',
      inference: 'none',
    });
    expect(result).toMatchObject({ format: 'json', queryType: 'SELECT', truncated: false });
    expect(typeof (result as Record<string, unknown>).body).toBe('string');
  });

  it('reads ASK from a boolean JSON body and the warning header', async () => {
    const fetchImpl = routedFetch(true, [
      {
        path: '/v1/rdf/sparql',
        body: JSON.stringify({ head: {}, boolean: true }),
        headers: {
          'Content-Type': 'application/sparql-results+json',
          'X-OpenMetadata-Inference-Warning': 'inference is approximate',
        },
      },
    ]);
    const result = await handlers(fetchImpl).sparql_query({
      query: 'ASK { ?s a <https://open-metadata.org/ontology/Table> }',
    });
    expect(result).toMatchObject({ format: 'json', queryType: 'ASK', warning: 'inference is approximate' });
  });

  it('omits queryType for graph results (CONSTRUCT vs DESCRIBE are indistinguishable)', async () => {
    const fetchImpl = routedFetch(true, [
      {
        path: '/v1/rdf/sparql',
        body: '<https://open-metadata.org/entity/table/1> a <https://open-metadata.org/ontology/Table> .',
        headers: { 'Content-Type': 'text/turtle' },
      },
    ]);
    const result = await handlers(fetchImpl).sparql_query({
      query: 'CONSTRUCT { ?s a ?t } WHERE { ?s a ?t }',
      format: 'turtle',
    });
    expect(result).toMatchObject({ format: 'turtle' });
    expect((result as Record<string, unknown>).queryType).toBeUndefined();
  });

  it('reads ASK from a lone true/false CSV row and SELECT otherwise', async () => {
    const csvFetch = (body: string) =>
      routedFetch(true, [
        { path: '/v1/rdf/sparql', body, headers: { 'Content-Type': 'text/csv' } },
      ]);
    const ask = await handlers(csvFetch('true')).sparql_query({ query: 'ASK {}', format: 'csv' });
    expect((ask as Record<string, unknown>).queryType).toBe('ASK');
    const select = await handlers(csvFetch('s\n<http://x/1>\n')).sparql_query({
      query: SELECT_QUERY,
      format: 'csv',
    });
    expect((select as Record<string, unknown>).queryType).toBe('SELECT');
  });

  it('rejects an unknown admin format before the SPARQL call', async () => {
    const fetchImpl = routedFetch(true, [{ path: '/v1/rdf/sparql', body: '{}' }]);
    await expect(
      handlers(fetchImpl).sparql_query({ query: SELECT_QUERY, format: 'yaml' }),
    ).rejects.toThrow(/'format' must be one of/);
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      'http://om.example/api/v1/users/loggedInUser',
    ]);
  });

  it('rejects an unknown inference level before the SPARQL call', async () => {
    const fetchImpl = routedFetch(true, [{ path: '/v1/rdf/sparql', body: '{}' }]);
    await expect(
      handlers(fetchImpl).sparql_query({ query: SELECT_QUERY, inferenceLevel: 'full' }),
    ).rejects.toThrow(/'inferenceLevel' must be one of/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('passes a server RDF 503 through as a REST error', async () => {
    const fetchImpl = routedFetch(true, [
      { path: '/v1/rdf/sparql', body: 'RDF is not enabled', status: 503 },
    ]);
    await expect(handlers(fetchImpl).sparql_query({ query: SELECT_QUERY })).rejects.toMatchObject({
      status: 503,
    });
  });

  it('clamps maxBytes and never splits a UTF-8 code point', async () => {
    const fetchImpl = routedFetch(true, [
      {
        path: '/v1/rdf/sparql',
        body: `{"head":{"vars":[]},"results":{"bindings":[]},"note":"${'é'.repeat(2000)}"}`,
      },
    ]);
    const result = (await handlers(fetchImpl).sparql_query({
      query: SELECT_QUERY,
      maxBytes: 1025,
    })) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    expect(result.byteCount).toBeGreaterThan(1025);
    expect(String(result.body)).not.toContain('�');
    expect(new TextEncoder().encode(String(result.body)).length).toBeLessThanOrEqual(1025);
  });
});

describe('sparql_query (non-admin)', () => {
  it('POSTs only the query to /v1/rdf/sparql/agent and passes completeness through', async () => {
    const fetchImpl = routedFetch(false, [
      {
        path: '/v1/rdf/sparql/agent',
        body: agentBody({ status: 'TRUNCATED', relativeTo: 'SUBMITTED_QUERY', reason: 'SERVER_ROW_LIMIT' }),
      },
    ]);
    const result = await handlers(fetchImpl).sparql_query({ query: SELECT_QUERY });
    const agentCall = fetchImpl.mock.calls.find((call) =>
      String(call[0]).includes('/sparql/agent'),
    )!;
    expect(agentCall[0]).toBe('http://om.example/api/v1/rdf/sparql/agent');
    expect(JSON.parse(String((agentCall[1] as RequestInit).body))).toEqual({ query: SELECT_QUERY });
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).endsWith('/v1/rdf/sparql'))).toBe(false);
    expect(result).toMatchObject({
      format: 'json',
      queryType: 'SELECT',
      completeness: { status: 'TRUNCATED', reason: 'SERVER_ROW_LIMIT' },
    });
  });

  it('passes a COMPLETE result without a reason', async () => {
    const fetchImpl = routedFetch(false, [
      { path: '/v1/rdf/sparql/agent', body: agentBody({ status: 'COMPLETE', relativeTo: 'SUBMITTED_QUERY' }) },
    ]);
    const result = await handlers(fetchImpl).sparql_query({ query: SELECT_QUERY });
    expect((result as Record<string, unknown>).completeness).toEqual({ status: 'COMPLETE' });
  });

  it('refuses a non-json format with the pin wording before the agent call', async () => {
    const fetchImpl = routedFetch(false, [{ path: '/v1/rdf/sparql/agent', body: '{}' }]);
    await expect(
      handlers(fetchImpl).sparql_query({ query: SELECT_QUERY, format: 'csv' }),
    ).rejects.toThrow("'format' must be 'json' unless you are an administrator; got 'csv'");
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      'http://om.example/api/v1/users/loggedInUser',
    ]);
  });

  it('refuses a non-none inference level with the pin wording before the agent call', async () => {
    const fetchImpl = routedFetch(false, [{ path: '/v1/rdf/sparql/agent', body: '{}' }]);
    await expect(
      handlers(fetchImpl).sparql_query({ query: SELECT_QUERY, inferenceLevel: 'rdfs' }),
    ).rejects.toThrow("'inferenceLevel' must be 'none' unless you are an administrator; got 'rdfs'");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accepts case-insensitive json/none defaults', async () => {
    const fetchImpl = routedFetch(false, [
      { path: '/v1/rdf/sparql/agent', body: agentBody({ status: 'COMPLETE', relativeTo: 'SUBMITTED_QUERY' }) },
    ]);
    const result = await handlers(fetchImpl).sparql_query({
      query: SELECT_QUERY,
      format: 'JSON',
      inferenceLevel: 'NONE',
    });
    expect((result as Record<string, unknown>).format).toBe('json');
  });

  it('requires the query before any HTTP', async () => {
    const fetchImpl = routedFetch(false, []);
    await expect(handlers(fetchImpl).sparql_query({ query: '  ' })).rejects.toThrow(/query is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sparql_query contract (tools.json is the source of truth)', () => {
  it('registers the pin description verbatim, with PAGING and VOCABULARY guidance', () => {
    const toolsJson = JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '../../openmetadata-mcp/src/main/resources/json/data/mcp/tools.json',
        ),
        'utf8',
      ),
    ) as { tools: Array<{ name: string; description: string }> };
    const pin = toolsJson.tools.find((tool) => tool.name === 'sparql_query');
    expect(pin).toBeTruthy();
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()));
    const spec = registrar.registerTool.mock.calls.find((call) => call[0] === 'sparql_query');
    expect(spec).toBeTruthy();
    const description = (spec?.[1] as { description: string }).description;
    expect(description).toBe(pin!.description);
    expect(description).toContain('PAGING:');
    expect(description).toContain('LIMIT 250');
    expect(description).toContain('VOCABULARY');
    expect(description).toContain('om:fromColumn');
    expect((spec?.[1] as { annotations?: { readOnlyHint?: boolean } }).annotations?.readOnlyHint).toBe(true);
  });

  it('requires query and accepts the pin parameter set', () => {
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()));
    const spec = registrar.registerTool.mock.calls.find((call) => call[0] === 'sparql_query');
    const schema = spec?.[1].inputSchema as {
      parse: (args: unknown) => Record<string, unknown>;
      safeParse: (args: unknown) => { success: boolean };
    };
    expect(schema.parse({ query: SELECT_QUERY })).toEqual({ query: SELECT_QUERY });
    expect(schema.safeParse({}).success).toBe(false);
    expect(
      schema.parse({ query: SELECT_QUERY, format: 'turtle', inferenceLevel: 'custom', maxBytes: 4096 }),
    ).toEqual({ query: SELECT_QUERY, format: 'turtle', inferenceLevel: 'custom', maxBytes: 4096 });
    expect(schema.safeParse({ query: SELECT_QUERY, maxBytes: 1.5 }).success).toBe(false);
  });
});
