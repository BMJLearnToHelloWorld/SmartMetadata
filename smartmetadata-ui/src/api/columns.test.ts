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
});
