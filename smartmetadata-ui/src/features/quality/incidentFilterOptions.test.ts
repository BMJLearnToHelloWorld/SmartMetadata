/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchIncidentTestCaseFilterOptions } from './incidentFilterOptions';

const searchAssets = vi.fn();

vi.mock('@/api/search', () => ({
  searchAssets: (...args: unknown[]) => searchAssets(...args),
}));

describe('searchIncidentTestCaseFilterOptions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queries the testCase index with wildcard defaults (pin searchTestCases)', async () => {
    searchAssets.mockResolvedValue({
      hits: [
        {
          name: 'tc',
          displayName: 'TC',
          fullyQualifiedName: 'svc.db.tc',
        },
      ],
      total: 1,
    });
    const options = await searchIncidentTestCaseFilterOptions();
    expect(searchAssets).toHaveBeenCalledWith('*', 0, 15, {
      index: 'testCase',
      includeAggregations: false,
    });
    expect(options).toEqual([{ label: 'TC', value: 'svc.db.tc' }]);
  });

  it('url-encodes a non-wildcard test-case search value', async () => {
    searchAssets.mockResolvedValue({ hits: [], total: 0 });
    await searchIncidentTestCaseFilterOptions('a#b');
    expect(searchAssets).toHaveBeenCalledWith('a%23b', 0, 15, expect.any(Object));
  });

  it('returns an empty list when the search rejects', async () => {
    searchAssets.mockRejectedValueOnce(new Error('nope'));
    await expect(searchIncidentTestCaseFilterOptions()).resolves.toEqual([]);
  });
});