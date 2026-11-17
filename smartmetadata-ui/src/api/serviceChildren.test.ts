/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import type { ServiceKind } from '@/types/ingestion';
import {
  buildServiceChildrenFields,
  CHILD_ENTITY_TYPE_BY_KIND,
  countServiceChildren,
  fetchServiceChildren,
  SERVICE_CHILDREN_FETCHERS,
} from './serviceChildren';

describe('buildServiceChildrenFields (pin classic fetch ordering)', () => {
  const COMMON = 'tags,owners,domains,dataProducts,certification';
  it('prepends usageSummary for databases with ViewUsage', () => {
    expect(buildServiceChildrenFields('database', true)).toBe(`usageSummary,${COMMON}`);
    expect(buildServiceChildrenFields('database', false)).toBe(COMMON);
  });
  it('appends usageSummary for dashboards with ViewUsage', () => {
    expect(buildServiceChildrenFields('dashboard', true)).toBe(`${COMMON},usageSummary`);
    expect(buildServiceChildrenFields('dashboard', false)).toBe(COMMON);
  });
  it('always asks for state on pipelines, usageSummary last', () => {
    expect(buildServiceChildrenFields('pipeline', true)).toBe(`${COMMON},state,usageSummary`);
    expect(buildServiceChildrenFields('pipeline', false)).toBe(`${COMMON},state`);
  });
  it('asks only the common set for the remaining kinds', () => {
    for (const kind of ['messaging', 'mlmodel', 'storage', 'search', 'api', 'drive'] as const) {
      expect(buildServiceChildrenFields(kind, true)).toBe(COMMON);
      expect(buildServiceChildrenFields(kind, false)).toBe(COMMON);
    }
  });
});

describe('service children dispatch (pin connectionServiceChildren.utils)', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function lastUrl(): URL {
    const call = vi.mocked(fetch).mock.calls.at(-1);
    if (!call) {
      throw new Error('fetch was not called');
    }
    return new URL(String(call[0]));
  }

  const PATHS: Array<[ServiceKind, string, boolean]> = [
    ['database', '/api/v1/databases', false],
    ['messaging', '/api/v1/topics', false],
    ['dashboard', '/api/v1/dashboards', false],
    ['pipeline', '/api/v1/pipelines', false],
    ['mlmodel', '/api/v1/mlmodels', false],
    ['storage', '/api/v1/containers', true],
    ['search', '/api/v1/searchIndexes', true],
    ['api', '/api/v1/apiCollections', false],
    ['drive', '/api/v1/drives/directories', true],
  ];

  it.each(PATHS)('routes %s to %s, root=%s', async (kind, path, root) => {
    const page = await fetchServiceChildren(kind, {
      service: 'svc.warehouse',
      fields: 'tags,owners',
      paging: { limit: 15, after: 'cur' },
      include: 'non-deleted',
    });
    expect(page).toBeDefined();
    const url = lastUrl();
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get('service')).toBe('svc.warehouse');
    expect(url.searchParams.get('fields')).toBe('tags,owners');
    expect(url.searchParams.get('include')).toBe('non-deleted');
    expect(url.searchParams.get('limit')).toBe('15');
    expect(url.searchParams.get('after')).toBe('cur');
    if (root) {
      expect(url.searchParams.get('root')).toBe('true');
    } else {
      expect(url.searchParams.has('root')).toBe(false);
    }
  });

  it('returns undefined without fetching for kinds without a child list', async () => {
    for (const kind of ['metadata', 'security', 'llm', 'mcp'] as const) {
      expect(
        fetchServiceChildren(kind, {
          service: 'svc.x',
          fields: '',
          include: 'non-deleted',
        }),
      ).toBeUndefined();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(SERVICE_CHILDREN_FETCHERS.size).toBe(9);
  });

  it('shares one nine-kind table between the entity-type map and the fetch dispatch', () => {
    expect(CHILD_ENTITY_TYPE_BY_KIND).toEqual({
      database: 'database',
      messaging: 'topic',
      dashboard: 'dashboard',
      pipeline: 'pipeline',
      mlmodel: 'mlmodel',
      storage: 'container',
      search: 'searchIndex',
      api: 'apiCollection',
      drive: 'directory',
    });
    expect([...SERVICE_CHILDREN_FETCHERS.keys()].sort()).toEqual(
      Object.keys(CHILD_ENTITY_TYPE_BY_KIND).sort(),
    );
    for (const kind of ['metadata', 'security', 'llm', 'mcp'] as const) {
      expect(CHILD_ENTITY_TYPE_BY_KIND[kind]).toBeUndefined();
    }
  });

  it('counts with empty fields and limit 0, reading only the total', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [], paging: { total: 12 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const total = await countServiceChildren('database', 'svc.warehouse', 'deleted');
    expect(total).toBe(12);
    const url = lastUrl();
    expect(url.searchParams.get('fields')).toBe('');
    expect(url.searchParams.get('limit')).toBe('0');
    expect(url.searchParams.get('include')).toBe('deleted');
    expect(countServiceChildren('metadata', 'svc.x', 'non-deleted')).toBeUndefined();
  });

  it('maps child rows onto the shared page shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'db1', name: 'sales', owners: [{ id: 'u1', name: 'ann', type: 'user' }] }],
            paging: { total: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const page = await fetchServiceChildren('database', {
      service: 'svc.warehouse',
      fields: 'tags,owners',
      include: 'non-deleted',
    });
    expect(page?.data).toEqual([
      expect.objectContaining({
        id: 'db1',
        name: 'sales',
        owners: [expect.objectContaining({ id: 'u1', name: 'ann' })],
      }),
    ]);
  });
});
