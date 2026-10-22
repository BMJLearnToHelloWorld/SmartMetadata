/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { RestClient } from '../src/client.js';
import type { RuntimeConfig } from '../src/config.js';
import { createMcpServer, listRegisteredTools, registerCatalogTools } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
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

  it('constructs an official stdio-capable MCP server', () => {
    const server = createMcpServer(new RestClient(config, vi.fn()));
    expect(server).toBeTruthy();
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
});
