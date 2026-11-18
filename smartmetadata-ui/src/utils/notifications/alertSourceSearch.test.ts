/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from '@/api/client';
import { searchAssets } from '@/api/search';
import type { SearchHit, SearchPage } from '@/types/api';
import {
  getAlertSourceSearch,
  searchDataContractNames,
  searchEntity,
  type AlertSearchHooks,
} from './alertSourceSearch';
import type { TranslateFn } from './alertUtils';

vi.mock('@/api/search', () => ({ searchAssets: vi.fn() }));
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedSearchAssets = vi.mocked(searchAssets);
const mockedApiRequest = vi.mocked(apiRequest);

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'db.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    ...overrides,
  };
}

function page(hits: SearchHit[]): SearchPage {
  return { total: hits.length, hits, facets: [] };
}

let notified: string[];
let hooks: AlertSearchHooks;

beforeEach(() => {
  vi.clearAllMocks();
  notified = [];
  hooks = { t, notifyError: (message) => notified.push(message) };
});

describe('searchEntity', () => {
  it('maps hits to label/value options, deduplicating by label', async () => {
    mockedSearchAssets.mockResolvedValue(
      page([
        hit({ displayName: 'Orders', fullyQualifiedName: 'db.orders' }),
        hit({ displayName: 'Orders', fullyQualifiedName: 'db.orders2' }),
        hit({ name: 'users', fullyQualifiedName: 'db.users' }),
      ]),
    );
    const options = await searchEntity({ searchText: 'ord', searchIndex: ['table', 'topic'] }, hooks);
    expect(mockedSearchAssets).toHaveBeenCalledWith('ord', 0, 50, {
      index: 'table,topic',
      query_filter: undefined,
    });
    expect(options).toEqual([
      { label: 'Orders', value: 'db.orders' },
      { label: 'users', value: 'db.users' },
    ]);
  });

  it('uses FQNs as labels for fqnList inputs and hints containers with .*', async () => {
    mockedSearchAssets.mockResolvedValue(
      page([
        hit({ displayName: 'Orders', fullyQualifiedName: 'db.orders', entityType: 'database' }),
        hit({ displayName: 'T', fullyQualifiedName: 'db.t', entityType: 'table' }),
      ]),
    );
    const options = await searchEntity(
      {
        searchText: '',
        searchIndex: 'table',
        showDisplayNameAsLabel: false,
        wildcardEntityTypes: ['database'],
      },
      hooks,
    );
    expect(options).toEqual([
      { label: 'db.orders.*', value: 'db.orders' },
      { label: 'db.t', value: 'db.t' },
    ]);
  });

  it('toasts and yields no options on failure', async () => {
    mockedSearchAssets.mockRejectedValue(new Error('boom'));
    const options = await searchEntity({ searchText: 'x', searchIndex: 'table' }, hooks);
    expect(options).toEqual([]);
    expect(notified).toEqual(['server.entity-fetch-error:{"entity":"label.search"}']);
  });
});

describe('searchDataContractNames', () => {
  it('searches contracts and maps FQNs', async () => {
    mockedApiRequest.mockResolvedValue({
      data: [{ fullyQualifiedName: 'c.one' }, { fullyQualifiedName: '' }, {}],
    });
    const options = await searchDataContractNames('one', hooks);
    expect(mockedApiRequest).toHaveBeenCalledWith('/v1/dataContracts/search', {
      query: { q: 'one', limit: 50, offset: 0 },
    });
    expect(options).toEqual([{ label: 'c.one', value: 'c.one' }]);
  });

  it('toasts and yields no options on failure', async () => {
    mockedApiRequest.mockRejectedValue(new Error('boom'));
    expect(await searchDataContractNames('x', hooks)).toEqual([]);
    expect(notified).toEqual(['server.entity-fetch-error:{"entity":"label.data-contract"}']);
  });
});

describe('getAlertSourceSearch', () => {
  it('merges own searches with the shared index search', async () => {
    mockedApiRequest.mockResolvedValue({ data: [{ fullyQualifiedName: 'c.one' }] });
    mockedSearchAssets.mockResolvedValue(page([hit()]));
    const search = getAlertSourceSearch(['dataContract', 'table'], ['database'], hooks);
    expect(search.indexes).toEqual(['dataContract', 'table', 'database']);
    expect(search.containerEntities).toEqual(['database']);
    const options = await search.byName('o');
    expect(options).toEqual([
      { label: 'c.one', value: 'c.one' },
      { label: 'db.orders', value: 'db.orders' },
    ]);
    expect(mockedSearchAssets).toHaveBeenCalledWith('o', 0, 50, {
      index: 'table,database',
      query_filter: undefined,
    });
  });

  it('looks ids up across source indexes, narrowing UUIDs to an id term', async () => {
    mockedSearchAssets.mockResolvedValue(page([hit({ id: 'id-1' })]));
    const search = getAlertSourceSearch(['table', 'topic'], [], hooks);
    await search.byId('123e4567-e89b-12d3-a456-426614174000');
    const call = mockedSearchAssets.mock.calls[0];
    expect(call[3]?.index).toBe('table,topic');
    expect(call[3]?.query_filter).toContain('123e4567-e89b-12d3-a456-426614174000');
    mockedSearchAssets.mockClear();
    const found = await search.byId('orders');
    expect(mockedSearchAssets.mock.calls[0][3]?.query_filter).toBeUndefined();
    expect(found).toEqual([{ id: 'id-1', fullyQualifiedName: 'db.orders' }]);
  });

  it('returns nothing by id when no source maps to an index', async () => {
    const search = getAlertSourceSearch(['unknown'], [], hooks);
    expect(await search.byId('x')).toEqual([]);
    expect(mockedSearchAssets).not.toHaveBeenCalled();
  });
});

describe('search error toasts', () => {
  it('stays silent on 401/403 reads, per showErrorToast suppression', async () => {
    mockedSearchAssets.mockRejectedValue(new ApiError(401, ''));
    expect(await searchEntity({ searchText: 'o', searchIndex: 'user' }, hooks)).toEqual([]);
    mockedSearchAssets.mockRejectedValue(new ApiError(403, ''));
    expect(await searchEntity({ searchText: 'o', searchIndex: 'user' }, hooks)).toEqual([]);
    mockedApiRequest.mockRejectedValue(new ApiError(403, ''));
    expect(await searchDataContractNames('o', hooks)).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('toasts other failures and yields no options', async () => {
    mockedSearchAssets.mockRejectedValue(new ApiError(500, 'boom'));
    expect(await searchEntity({ searchText: 'o', searchIndex: 'user' }, hooks)).toEqual([]);
    expect(notified).toEqual([
      'server.entity-fetch-error:{"entity":"label.search"}',
    ]);
    mockedApiRequest.mockRejectedValue(new ApiError(500, 'boom'));
    expect(await searchDataContractNames('o', hooks)).toEqual([]);
    expect(notified).toHaveLength(2);
  });
});
