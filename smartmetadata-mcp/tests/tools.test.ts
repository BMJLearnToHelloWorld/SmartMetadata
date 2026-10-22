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
import { TOOL_NAMES, createToolHandlers } from '../src/tools.js';

const config: RuntimeConfig = {
  apiUrl: 'http://om.example/api',
  jwt: 'bot-token',
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function handlers(fetchImpl: typeof fetch) {
  return createToolHandlers(new RestClient(config, fetchImpl));
}

describe('tool catalog', () => {
  it('exposes at least four OSS tools and no Collate AI Studio names', () => {
    expect(TOOL_NAMES.length).toBeGreaterThanOrEqual(4);
    expect(TOOL_NAMES).toEqual(
      expect.arrayContaining([
        'search_entities',
        'get_table',
        'get_topic',
        'get_lineage',
        'list_glossaries',
        'list_tags',
        'create_conversation',
      ]),
    );
    expect(TOOL_NAMES.join(',')).not.toMatch(/nlq_search|create_article|ai_studio/i);
  });
});

describe('search_entities', () => {
  it('GETs /v1/search/query with dataAsset default and a size cap', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hits: { total: { value: 1 } } }));
    const result = await handlers(fetchImpl).search_entities({ q: 'orders', size: 999 });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toBe(
      'http://om.example/api/v1/search/query?q=orders&index=dataAsset&from=0&size=50&include_aggregations=false',
    );
    expect(result).toEqual({ hits: { total: { value: 1 } } });
  });

  it('defaults a blank query to *', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await handlers(fetchImpl).search_entities({ q: '  ' });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('q=*');
  });
});

describe('get_table / get_topic', () => {
  it('GETs table and topic by encoded FQN', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ name: 'orders' }));
    const tools = handlers(fetchImpl);
    await tools.get_table({ fqn: 'svc.db.schema.orders' });
    await tools.get_topic({ fqn: 'kafka.orders' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://om.example/api/v1/tables/name/svc.db.schema.orders?fields=owners%2Ctags%2Ccolumns%2Cdomains',
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://om.example/api/v1/topics/name/kafka.orders?fields=owners%2Ctags%2Cdomains%2CmessageSchema',
    );
  });

  it('rejects an empty FQN before calling HTTP', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(handlers(fetchImpl).get_table({ fqn: ' ' })).rejects.toThrow(/FQN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('get_lineage', () => {
  it('GETs /v1/lineage/{entity}/name/{fqn} with depths clamped to 0–3', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entity: { id: 't1' } }));
    await handlers(fetchImpl).get_lineage({
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
      upstreamDepth: 99,
      downstreamDepth: -4,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://om.example/api/v1/lineage/table/name/svc.db.schema.orders?upstreamDepth=3&downstreamDepth=0',
    );
  });

  it('defaults missing depths to 1', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await handlers(fetchImpl).get_lineage({ entityType: 'topic', fqn: 'kafka.orders' });
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('upstreamDepth=1');
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('downstreamDepth=1');
  });
});

describe('list_glossaries / list_tags', () => {
  it('GETs documented list paths', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const tools = handlers(fetchImpl);
    await tools.list_glossaries({ limit: 10 });
    await tools.list_tags({ parent: 'PII', limit: 5, after: 'cursor' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://om.example/api/v1/glossaries?fields=owners%2Ctags%2Creviewers%2CusageCount%2CtermCount%2Cdomains&limit=10',
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://om.example/api/v1/tags?fields=owners%2Creviewers%2Cdomains%2Cchildren%2CusageCount&limit=5&after=cursor&parent=PII',
    );
  });
});

describe('create_conversation', () => {
  it('POSTs message + MessageParser about link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c1', about: '<#E::table::svc.db.schema.orders>' }));
    const created = await handlers(fetchImpl).create_conversation({
      message: 'Please document this table',
      entityType: 'table',
      fqn: 'svc.db.schema.orders',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://om.example/api/v1/conversations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'Please document this table',
      about: '<#E::table::svc.db.schema.orders>',
    });
    expect(created).toMatchObject({ id: 'c1' });
  });

  it('rejects an about value that is not a MessageParser link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(
      handlers(fetchImpl).create_conversation({ message: 'note', about: 'table:orders' }),
    ).rejects.toThrow(/entity link/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a caller-supplied about link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c2' }));
    await handlers(fetchImpl).create_conversation({
      message: 'note',
      about: '<#E::topic::kafka.orders>',
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      message: 'note',
      about: '<#E::topic::kafka.orders>',
    });
  });
});
