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
import {
  bulkUpdateColumnsAsync,
  bulkUpdateColumnsPreview,
  getColumnGrid,
  getDataModelColumnsByFQN,
  getTableColumnsByFQN,
  searchDataModelColumnsByFQN,
  searchTableColumnsByFQN,
  updateColumnDetails,
  updateDataModelColumn,
  updateTableColumn,
} from './columns';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(): { url: string; init?: RequestInit } {
  const mock = vi.mocked(fetch);
  const call = mock.mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

const GRID_PAYLOAD = {
  columns: [
    {
      columnName: 'email',
      hasVariations: true,
      metadataStatus: 'INCOMPLETE',
      groups: [
        {
          groupId: 'g1',
          displayName: 'Email',
          description: 'Contact email',
          dataType: 'VARCHAR',
          metadataStatus: 'INCOMPLETE',
          occurrenceCount: 2,
          occurrences: [
            {
              columnFQN: 'svc.db.schema.users.email',
              entityFQN: 'svc.db.schema.users',
              entityType: 'table',
              entityDisplayName: 'users',
              serviceName: 'svc',
            },
            {
              columnFQN: 'svc.db.schema.customers.email',
              entityFQN: 'svc.db.schema.customers',
              entityType: 'table',
              entityDisplayName: 'customers',
              serviceName: 'svc',
            },
          ],
          tags: [
            { tagFQN: 'PII.Email', source: 'Tag', labelType: 'Manual', state: 'Confirmed' },
            { tagFQN: 'Glossary.Email', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
          ],
        },
      ],
    },
  ],
  cursor: 'next-cursor',
  totalOccurrences: 2,
  totalUniqueColumns: 1,
};

describe('columns API', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('loads the grid from GET /v1/columns/grid with repeated list params', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(GRID_PAYLOAD)));
    const page = await getColumnGrid({
      columnNamePattern: 'email',
      entityTypes: ['table', 'dashboardDataModel'],
      tags: ['PII.Email'],
      size: 25,
    });
    const url = lastFetch().url;
    expect(url).toContain('/api/v1/columns/grid');
    expect(url).toContain('columnNamePattern=email');
    expect(url).toContain('entityTypes=table');
    expect(url).toContain('entityTypes=dashboardDataModel');
    expect(url).toContain('tags=PII.Email');
    expect(page.columns).toHaveLength(1);
    expect(page.columns[0].groups[0].occurrences).toHaveLength(2);
    expect(page.columns[0].groups[0].tags).toEqual([
      { tagFQN: 'PII.Email', source: 'Tag' },
      { tagFQN: 'Glossary.Email', source: 'Glossary' },
    ]);
    expect(page.cursor).toBe('next-cursor');
    expect(page.totalOccurrences).toBe(2);
  });

  it('posts explicit column updates to the preview endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          columnPreviews: [
            {
              columnFQN: 'svc.db.schema.users.email',
              entityFQN: 'svc.db.schema.users',
              hasChanges: true,
              currentValues: { displayName: 'Email' },
              newValues: { displayName: 'Email Address' },
            },
          ],
          totalColumns: 1,
        }),
      ),
    );
    const preview = await bulkUpdateColumnsPreview([
      {
        columnFQN: 'svc.db.schema.users.email',
        entityType: 'table',
        displayName: 'Email Address',
        tags: ['PII.Email'],
        glossaryTerms: ['Glossary.Email'],
      },
    ]);
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/columns/bulk-update-preview');
    const body = JSON.parse(String(init?.body));
    expect(body.columnUpdates[0]).toMatchObject({
      columnFQN: 'svc.db.schema.users.email',
      entityType: 'table',
      displayName: 'Email Address',
    });
    expect(body.columnUpdates[0].tags).toEqual([
      { tagFQN: 'PII.Email', source: 'Tag', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'Glossary.Email', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ]);
    expect(preview.totalColumns).toBe(1);
    expect(preview.columnPreviews[0].newDisplayName).toBe('Email Address');
  });

  it('posts explicit column updates to the async bulk-update endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await bulkUpdateColumnsAsync([
      { columnFQN: 'svc.db.schema.users.email', entityType: 'table', displayName: 'Email' },
    ]);
    expect(lastFetch().url).toContain('/api/v1/columns/bulk-update-async');
  });

  it('PUTs table column tags to the single-column endpoint with entityType=table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          name: 'email',
          fullyQualifiedName: 'svc.db.schema.users.email',
          tags: [
            { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          ],
        }),
      ),
    );
    const tags = await updateTableColumn('svc.db.schema.users.email', [
      { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/columns/name/svc.db.schema.users.email?entityType=table');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      tags: [{ tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
    });
    expect(tags).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
  });

  it('PUTs data-model column tags with entityType=dashboardDataModel, not dataModel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          name: 'revenue',
          fullyQualifiedName: 'model.revenue',
          tags: [{ tagFQN: 'Glossary.Revenue', name: 'Revenue', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' }],
        }),
      ),
    );
    const tags = await updateDataModelColumn('model.revenue', [
      { tagFQN: 'Glossary.Revenue', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ]);
    expect(lastFetch().url).toContain('/api/v1/columns/name/model.revenue?entityType=dashboardDataModel');
    expect(tags).toEqual([
      { tagFQN: 'Glossary.Revenue', name: 'Revenue', source: 'Glossary', labelType: 'Manual', state: 'Confirmed' },
    ]);
  });

  it('falls back to the sent labels when the PUT response carries no tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ name: 'email' })));
    const tags = await updateTableColumn('svc.db.schema.users.email', [
      { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PersonalData', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
    expect(tags).toEqual([
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PersonalData', name: 'PersonalData', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ]);
  });

  it('propagates a failed single-column PUT instead of reporting success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(
      updateTableColumn('svc.db.schema.users.email', [
        { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      ]),
    ).rejects.toThrow();
  });

  it('PUTs a description/display-name/constraint partial and returns the raw column', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          name: 'email',
          fullyQualifiedName: 'svc.db.schema.users.email',
          displayName: 'Email Address',
          description: 'Contact email',
          constraint: 'UNIQUE',
        }),
      ),
    );
    const updated = await updateColumnDetails('svc.db.schema.users.email', 'table', {
      description: 'Contact email',
      displayName: 'Email Address',
      constraint: 'UNIQUE',
    });
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/columns/name/svc.db.schema.users.email?entityType=table');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      description: 'Contact email',
      displayName: 'Email Address',
      constraint: 'UNIQUE',
    });
    expect(updated.displayName).toBe('Email Address');
  });

  it('sends removeConstraint when the constraint is cleared', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ name: 'email' })));
    await updateColumnDetails('svc.db.schema.users.email', 'table', { removeConstraint: true });
    expect(JSON.parse(String(lastFetch().init?.body))).toEqual({ removeConstraint: true });
  });

  it('lists table columns with tags, customMetrics and extension fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ data: [{ name: 'email' }], paging: { total: 1 } }),
      ),
    );
    const page = await getTableColumnsByFQN('svc.db.schema.users', {
      sortBy: 'name',
      sortOrder: 'desc',
      offset: 50,
      limit: 50,
    });
    const query = new URL(lastFetch().url, 'http://localhost').searchParams;
    expect(query.get('fields')).toBe('tags,customMetrics,extension');
    expect(query.get('sortBy')).toBe('name');
    expect(query.get('sortOrder')).toBe('desc');
    expect(query.get('offset')).toBe('50');
    expect(query.get('limit')).toBe('50');
    expect(page.paging.total).toBe(1);
  });

  it('searches table columns with the query and comma-joined tag filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [], paging: { total: 0 } })),
    );
    await searchTableColumnsByFQN('svc.db.schema.users', {
      q: 'mail',
      tags: 'PII.Email,PII.Sensitive',
      glossaryTerms: 'Glossary.Contact',
      sortBy: 'ordinalPosition',
      sortOrder: 'asc',
      offset: 0,
      limit: 50,
    });
    const { url } = lastFetch();
    expect(url).toContain('/columns/search');
    const query = new URL(url, 'http://localhost').searchParams;
    expect(query.get('q')).toBe('mail');
    expect(query.get('tags')).toBe('PII.Email,PII.Sensitive');
    expect(query.get('glossaryTerms')).toBe('Glossary.Contact');
  });

  it('lists data-model columns with tags only, and searches without tag params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: [{ name: 'revenue' }], paging: { total: 1 } })),
    );
    await getDataModelColumnsByFQN('model.revenue', { limit: 50 });
    let query = new URL(lastFetch().url, 'http://localhost').searchParams;
    expect(query.get('fields')).toBe('tags');
    await searchDataModelColumnsByFQN('model.revenue', { q: 'rev' });
    query = new URL(lastFetch().url, 'http://localhost').searchParams;
    expect(query.get('q')).toBe('rev');
    expect(query.get('tags')).toBeNull();
    expect(query.get('glossaryTerms')).toBeNull();
  });
});
