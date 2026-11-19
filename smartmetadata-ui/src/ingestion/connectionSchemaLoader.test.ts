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
import {
  clearConnectionSchemaCache,
  loadConnectionSchemaJson,
} from './connectionSchemaLoader';

function okResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

function failResponse(): Response {
  return {
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: async () => ({}),
  } as Response;
}

describe('loadConnectionSchemaJson', () => {
  it('fetches the ledger schema path for a loader-registered type', async () => {
    clearConnectionSchemaCache();
    const fetchFn = vi.fn(async () => okResponse({ type: 'object', properties: {} }));
    const result = await loadConnectionSchemaJson('database', 'Postgres', fetchFn);
    expect(result.state).toBe('present');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      '/jsons/connectionSchemas/connections/database/postgresConnection.json',
      { headers: { Accept: 'application/json' } },
    );
  });

  it('returns empty without fetching for no-loader types (L2)', async () => {
    clearConnectionSchemaCache();
    const fetchFn = vi.fn(async () => okResponse({}));
    expect(await loadConnectionSchemaJson('mlmodel', 'VertexAI', fetchFn)).toEqual({
      state: 'empty',
    });
    expect(await loadConnectionSchemaJson('api', 'WEBHOOK', fetchFn)).toEqual({ state: 'empty' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns empty without fetching for out-of-universe pairs (L1)', async () => {
    clearConnectionSchemaCache();
    const fetchFn = vi.fn(async () => okResponse({}));
    expect(await loadConnectionSchemaJson('llm', 'OpenAI', fetchFn)).toEqual({ state: 'empty' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response (L3) and does not poison the cache', async () => {
    clearConnectionSchemaCache();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(failResponse())
      .mockResolvedValueOnce(okResponse({ type: 'object' }));
    await expect(loadConnectionSchemaJson('database', 'Mysql', fetchFn)).rejects.toThrow(
      'Failed to load connection schema',
    );
    const retry = await loadConnectionSchemaJson('database', 'Mysql', fetchFn);
    expect(retry.state).toBe('present');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('serves repeat loads from the cache', async () => {
    clearConnectionSchemaCache();
    const fetchFn = vi.fn(async () => okResponse({ type: 'object' }));
    await loadConnectionSchemaJson('storage', 'S3', fetchFn);
    await loadConnectionSchemaJson('storage', 'S3', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
