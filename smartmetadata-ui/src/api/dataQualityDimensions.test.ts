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
import {
  deleteDataQualityDimension,
  getDataQualityDimensionTestCaseCounts,
  getDataQualityDimensionTestDefinitionCounts,
  listDataQualityDimensions,
  patchDataQualityDimension,
} from './dataQualityDimensions';

vi.mock('./client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from './client';

const mocked = apiRequest as unknown as ReturnType<typeof vi.fn>;

describe('dataQualityDimensions API', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('lists dimensions from /v1/dataQuality/dimensions', async () => {
    mocked.mockResolvedValueOnce({
      data: [{ id: '1', name: 'Accuracy', displayName: 'Accuracy' }],
    });
    const page = await listDataQualityDimensions({ limit: 10 });
    expect(page.data[0].name).toBe('Accuracy');
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions?limit=10');
  });

  it('deletes with hardDelete=true', async () => {
    mocked.mockResolvedValueOnce(undefined);
    await deleteDataQualityDimension('d1');
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions/d1?hardDelete=true', {
      method: 'DELETE',
    });
  });

  it('fetches test case counts keyed by dimension id', async () => {
    mocked.mockResolvedValueOnce({ d1: 3 });
    await expect(getDataQualityDimensionTestCaseCounts()).resolves.toEqual({ d1: 3 });
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions/testCaseCounts');
  });

  it('fetches test definition counts keyed by dimension id', async () => {
    mocked.mockResolvedValueOnce({ d1: 2 });
    await expect(getDataQualityDimensionTestDefinitionCounts()).resolves.toEqual({ d1: 2 });
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions/testDefinitionCounts');
  });

  it('patches with JSON Patch content type and maps the response', async () => {
    mocked.mockResolvedValueOnce({
      id: 'd1',
      name: 'Accuracy',
      displayName: 'New',
      style: { color: '#2E90FA' },
    });
    const ops = [{ op: 'replace', path: '/displayName', value: 'New' }];
    const result = await patchDataQualityDimension('d1', ops as never);
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions/d1', {
      method: 'PATCH',
      json: ops,
      contentType: 'application/json-patch+json',
    });
    expect(result.displayName).toBe('New');
  });
});
