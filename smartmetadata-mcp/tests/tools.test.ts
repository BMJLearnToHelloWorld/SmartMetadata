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
    expect(TOOL_NAMES).toHaveLength(14);
    expect(TOOL_NAMES).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(TOOL_NAMES.join(',')).not.toMatch(/nlq_search|create_article|ai_studio|sparql_query|semantic_search|ontology_describe/i);
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

  it('lowercases entityType so ConversationResource can resolve the target', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c3' }));
    await handlers(fetchImpl).create_conversation({
      message: 'Please document this table',
      entityType: 'Table',
      fqn: 'svc.db.schema.orders',
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      message: 'Please document this table',
      about: '<#E::table::svc.db.schema.orders>',
    });
  });

  it('rejects an about value that is not a MessageParser link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(
      handlers(fetchImpl).create_conversation({ message: 'note', about: 'table:orders' }),
    ).rejects.toThrow(/entity link/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts a caller-supplied about link and lowercases the type', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c2' }));
    await handlers(fetchImpl).create_conversation({
      message: 'note',
      about: '<#E::TOPIC::kafka.orders>',
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      message: 'note',
      about: '<#E::topic::kafka.orders>',
    });
  });
});

describe('get_entity_details', () => {
  it('GETs allowlisted collection by entityType + FQN', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ name: 'orders' }));
    await handlers(fetchImpl).get_entity_details({ entityType: 'pipeline', fqn: 'airflow.etl.orders' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://om.example/api/v1/pipelines/name/airflow.etl.orders?fields=owners%2Ctags%2Cdomains',
    );
  });

  it('rejects Collate/RDF types that are OutOfScope', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(
      handlers(fetchImpl).get_entity_details({ entityType: 'knowledgeGraph', fqn: 'x' }),
    ).rejects.toThrow(/Unsupported entityType/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('find_by_tag', () => {
  it('GETs search with tags.tagFQN query_filter', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ hits: {} }));
    await handlers(fetchImpl).find_by_tag({ tagFqn: 'PII.Sensitive', size: 5 });
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('/v1/search/query?');
    expect(url).toContain('q=*');
    expect(url).toContain('index=dataAsset');
    expect(url).toContain('size=5');
    expect(decodeURIComponent(url)).toContain('tags.tagFQN');
    expect(decodeURIComponent(url)).toContain('PII.Sensitive');
  });
});

describe('get_test_definitions', () => {
  it('GETs /v1/dataQuality/testDefinitions', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    await handlers(fetchImpl).get_test_definitions({ limit: 10, entityType: 'table' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://om.example/api/v1/dataQuality/testDefinitions?limit=10&entityType=table',
    );
  });
});

describe('create_lineage', () => {
  it('PUTs /v1/lineage/{from}/name/{fqn}/{to}/name/{fqn} with Manual source', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await handlers(fetchImpl).create_lineage({
      fromEntityType: 'table',
      fromFqn: 'svc.db.schema.a',
      toEntityType: 'table',
      toFqn: 'svc.db.schema.b',
      description: 'derived',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://om.example/api/v1/lineage/table/name/svc.db.schema.a/table/name/svc.db.schema.b',
    );
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ source: 'Manual', description: 'derived' });
  });
});

describe('create_entity', () => {
  it('POSTs /v1/{collection} with Apache Create fields only', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'g1', name: 'Finance' }));
    const created = await handlers(fetchImpl).create_entity({
      entityType: 'glossary',
      name: 'Finance',
      description: 'Finance glossary',
      displayName: 'Finance',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://om.example/api/v1/glossaries');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Finance',
      description: 'Finance glossary',
      displayName: 'Finance',
    });
    expect(created).toMatchObject({ id: 'g1' });
  });

  it('merges type-specific Create* fields and rejects Collate/RDF types', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 't1' }));
    await handlers(fetchImpl).create_entity({
      entityType: 'glossaryTerm',
      name: 'Revenue',
      description: 'Revenue term',
      fields: { glossary: 'Finance' },
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({
      name: 'Revenue',
      description: 'Revenue term',
      glossary: 'Finance',
    });
    await expect(
      handlers(fetchImpl).create_entity({ entityType: 'knowledgeGraph', name: 'x', description: 'y' }),
    ).rejects.toThrow(/Unsupported entityType/);
  });
});

describe('patch_entity', () => {
  it('PATCHes /v1/{collection}/name/{fqn} with json-patch+json', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'g1', description: 'updated' }));
    await handlers(fetchImpl).patch_entity({
      entityType: 'glossary',
      fqn: 'Finance',
      patch: '[{"op":"replace","path":"/description","value":"updated"}]',
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://om.example/api/v1/glossaries/name/Finance');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json-patch+json');
    expect(JSON.parse(String(init.body))).toEqual([
      { op: 'replace', path: '/description', value: 'updated' },
    ]);
  });

  it('rejects empty or invalid patch before HTTP', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    await expect(
      handlers(fetchImpl).patch_entity({ entityType: 'glossary', fqn: 'Finance', patch: [] }),
    ).rejects.toThrow(/non-empty/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('create_test_case', () => {
  it('POSTs CreateTestCaseRequest to /v1/dataQuality/testCases', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'tc1' }));
    await handlers(fetchImpl).create_test_case({
      name: 'orders_row_count',
      fqn: 'svc.db.schema.orders',
      testDefinitionName: 'tableRowCountToBeBetween',
      description: 'row count gate',
      parameterValues: [{ name: 'minValue', value: '1' }],
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://om.example/api/v1/dataQuality/testCases');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'orders_row_count',
      testDefinition: 'tableRowCountToBeBetween',
      entityLink: '<#E::table::svc.db.schema.orders>',
      description: 'row count gate',
      parameterValues: [{ name: 'minValue', value: '1' }],
    });
  });

  it('builds column entityLink when columnName is set', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'tc2' }));
    await handlers(fetchImpl).create_test_case({
      name: 'shop_id_not_null',
      fqn: 'svc.db.schema.orders',
      columnName: 'shop_id',
      testDefinitionName: 'columnValuesToBeNotNull',
    });
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)).entityLink).toBe(
      '<#E::table::svc.db.schema.orders::columns::shop_id>',
    );
  });
});
