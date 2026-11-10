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
import {
  createMcpServer,
  exposedToolNames,
  listRegisteredTools,
  registerCatalogTools,
  toolAccessRefusal,
} from '../src/server.js';
import { TOOL_NAMES } from '../src/tools.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
  readOnly: false,
  disabledTools: [],
};

describe('MCP server wiring', () => {
  it('registers every catalog tool on a server', () => {
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()));
    const names = registrar.registerTool.mock.calls.map((call) => call[0]);
    expect(names).toEqual(TOOL_NAMES);
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it('lists the same names from the public catalog', () => {
    expect(listRegisteredTools()).toEqual(TOOL_NAMES);
  });

  it('constructs an official MCP server and the entrypoint binds stdio', () => {
    const server = createMcpServer(new RestClient(config, vi.fn()));
    expect(server).toBeTruthy();
    const entry = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../src/index.ts'),
      'utf8',
    );
    expect(entry).toContain('StdioServerTransport');
    expect(entry).toContain('server.connect(transport)');
  });

  it('marks REST failures as tool errors', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'table not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, fetchImpl));
    const getTable = registrar.registerTool.mock.calls.find((call) => call[0] === 'get_table')?.[2] as (
      args: Record<string, unknown>,
    ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    const result = await getTable({ fqn: 'missing.table' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('table not found');
  });

  it('annotates every spec with its readOnlyHint', () => {
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()));
    const hints = new Map(
      registrar.registerTool.mock.calls.map((call) => [
        call[0] as string,
        (call[1] as { annotations?: { readOnlyHint?: boolean } }).annotations?.readOnlyHint,
      ]),
    );
    expect(hints.get('search_entities')).toBe(true);
    expect(hints.get('semantic_search')).toBe(true);
    expect(hints.get('shacl_validate')).toBe(true);
    expect(hints.get('sparql_query')).toBe(true);
    expect(hints.get('create_entity')).toBe(false);
    expect(hints.get('create_conversation')).toBe(false);
    expect(hints.size).toBe(24);
  });
});

describe('access config (I-D5)', () => {
  it('exposes every tool by default', () => {
    expect(exposedToolNames()).toEqual([...TOOL_NAMES]);
    expect(exposedToolNames({})).toEqual([...TOOL_NAMES]);
  });

  it('hides write tools in read-only mode, including the write helper', () => {
    const exposed = exposedToolNames({ readOnly: true });
    expect(exposed).not.toContain('create_entity');
    expect(exposed).not.toContain('patch_entity');
    expect(exposed).not.toContain('create_lineage');
    expect(exposed).not.toContain('create_test_case');
    expect(exposed).not.toContain('create_conversation');
    expect(exposed).toContain('search_entities');
    expect(exposed).toContain('semantic_search');
    expect(exposed).toContain('shacl_validate');
    expect(exposed).toContain('sparql_query');
    expect(exposed).toHaveLength(19);
  });

  it('hides disabled tools by name and warns on unknown names only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exposed = exposedToolNames({ disabledTools: ['get_table', 'no_such_tool'] });
    expect(exposed).not.toContain('get_table');
    expect(exposed).toContain('search_entities');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/no_such_tool/);
    warn.mockRestore();
  });

  it('hides and refuses sparql_query when disabled by name', async () => {
    expect(exposedToolNames({ disabledTools: ['sparql_query'] })).not.toContain('sparql_query');
    expect(toolAccessRefusal('sparql_query', { disabledTools: ['sparql_query'] })).toBe(
      'sparql_query is disabled on this MCP server',
    );
    // Call-time refusal: the access flips after registration, and the
    // registered handler still refuses with the Batch A wording.
    const access = { readOnly: false, disabledTools: [] as string[] };
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()), access);
    const sparqlQuery = registrar.registerTool.mock.calls.find(
      (call) => call[0] === 'sparql_query',
    )?.[2] as (
      args: Record<string, unknown>,
    ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    access.disabledTools = ['sparql_query'];
    const result = await sparqlQuery({ query: 'SELECT ?s WHERE { ?s a ?t }' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('sparql_query is disabled on this MCP server');
  });

  it('refuses read-only calls first, then disabled calls, with the official wording', () => {
    expect(toolAccessRefusal('create_entity', { readOnly: true })).toBe(
      'The MCP server is in read-only mode, so create_entity is unavailable',
    );
    expect(toolAccessRefusal('describe_entity_type', { readOnly: true })).toBe(
      'The MCP server is in read-only mode, so describe_entity_type is unavailable',
    );
    expect(toolAccessRefusal('create_entity', { readOnly: true, disabledTools: ['create_entity'] })).toBe(
      'The MCP server is in read-only mode, so create_entity is unavailable',
    );
    expect(toolAccessRefusal('get_table', { disabledTools: ['get_table'] })).toBe(
      'get_table is disabled on this MCP server',
    );
    expect(toolAccessRefusal('get_table', {})).toBeNull();
    expect(toolAccessRefusal('search_entities', { readOnly: true })).toBeNull();
  });

  it('refuses a call at call time when the access flips after registration', async () => {
    // Level 2 of the gate: the registered handler consults the access
    // config on every call, so a tool listed before the mode flipped is
    // still refused — the wording a client with a stale tool list sees.
    const access = { readOnly: false, disabledTools: [] as string[] };
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()), access);
    const createEntity = registrar.registerTool.mock.calls.find(
      (call) => call[0] === 'create_entity',
    )?.[2] as (
      args: Record<string, unknown>,
    ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    access.readOnly = true;
    const result = await createEntity({ entityType: 'table', name: 'orders' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      'The MCP server is in read-only mode, so create_entity is unavailable',
    );
  });

  it('does not register refused tools, and read tools still work under read-only', async () => {
    const registrar = { registerTool: vi.fn() };
    registerCatalogTools(registrar, new RestClient(config, vi.fn()), { readOnly: true });
    const names = registrar.registerTool.mock.calls.map((call) => call[0]);
    expect(names).not.toContain('create_entity');
    expect(names).toHaveLength(19);

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: 'orders' }), { status: 200 }));
    const readRegistrar = { registerTool: vi.fn() };
    registerCatalogTools(readRegistrar, new RestClient(config, fetchImpl), { readOnly: true });
    const getTable = readRegistrar.registerTool.mock.calls.find(
      (call) => call[0] === 'get_table',
    )?.[2] as (
      args: Record<string, unknown>,
    ) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    const result = await getTable({ fqn: 'svc.db.orders' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('orders');
  });
});
