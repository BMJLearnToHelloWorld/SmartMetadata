/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/api/client';
import { mapPreviewSearchResponse, searchPreview } from './search';

const apiRequestMock = apiRequest as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe('mapPreviewSearchResponse', () => {
  it('maps hits, total, highlight, explanation, and matched queries', () => {
    expect(
      mapPreviewSearchResponse({
        hits: {
          total: { value: 2 },
          hits: [
            {
              _id: 'h1',
              _score: 1.23456,
              _source: { id: 'e1', name: 'orders', fullyQualifiedName: 'db.orders' },
              highlight: { name: ['<em>orders</em>'] },
              _explanation: { value: 1.2, description: 'sum' },
              matched_queries: ['name'],
            },
            {
              _source: { id: 'e2', name: 'customers' },
            },
          ],
        },
      }),
    ).toEqual({
      hits: [
        {
          id: 'h1',
          score: 1.23456,
          source: { id: 'e1', name: 'orders', fullyQualifiedName: 'db.orders' },
          highlight: { name: ['<em>orders</em>'] },
          explanation: { value: 1.2, description: 'sum' },
          matchedQueries: ['name'],
        },
        {
          id: 'e2',
          score: undefined,
          source: { id: 'e2', name: 'customers' },
          highlight: undefined,
          explanation: undefined,
          matchedQueries: undefined,
        },
      ],
      total: 2,
    });
  });

  it('tolerates a missing or malformed payload', () => {
    expect(mapPreviewSearchResponse(undefined)).toEqual({ hits: [], total: 0 });
    expect(mapPreviewSearchResponse({ hits: { total: {}, hits: 'nope' } })).toEqual({
      hits: [],
      total: 0,
    });
    expect(
      mapPreviewSearchResponse({ hits: { total: { value: 1 }, hits: [42, { _id: 'x' }] } }),
    ).toEqual({
      hits: [
        {
          id: 'x',
          score: undefined,
          source: {},
          highlight: undefined,
          explanation: undefined,
          matchedQueries: undefined,
        },
      ],
      total: 1,
    });
  });
});

describe('searchPreview', () => {
  it('POSTs the preview payload to /v1/search/preview', async () => {
    apiRequestMock.mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } });
    const payload = {
      from: 0,
      size: 15,
      index: 'table',
      query: 'orders',
      queryFilter: '',
      explain: false,
      searchSettings: { globalSettings: {} },
    };
    await expect(searchPreview(payload)).resolves.toEqual({ hits: [], total: 0 });
    expect(apiRequestMock).toHaveBeenCalledWith('/v1/search/preview', {
      method: 'POST',
      json: payload,
    });
  });
});
