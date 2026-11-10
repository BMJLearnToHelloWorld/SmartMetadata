/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  fetchDomainOptions,
  fetchParentMetricOptions,
  fetchRelatedMetricOptions,
  fetchUserTeamOptions,
} from './metricOptionLoaders';

vi.mock('@/api/users', () => ({
  searchUsers: vi.fn(),
}));
vi.mock('@/api/search', () => ({
  searchAssets: vi.fn(),
}));

import { searchUsers } from '@/api/users';
import { searchAssets } from '@/api/search';

const mockedSearchUsers = vi.mocked(searchUsers);
const mockedSearchAssets = vi.mocked(searchAssets);

describe('fetchUserTeamOptions', () => {
  it('searches users (non-bot filter) and Group teams in parallel and merges with user:/team: values', async () => {
    mockedSearchUsers.mockResolvedValue({
      data: [{ id: 'u1', name: 'alice', displayName: 'Alice', isBot: false }],
      total: 1,
    } as never);
    mockedSearchAssets.mockResolvedValue({
      hits: [
        { id: 't1', name: 'eng', displayName: 'Engineering', fullyQualifiedName: 'eng' },
      ],
      total: 1,
    } as never);
    const options = await fetchUserTeamOptions('ali');
    expect(mockedSearchUsers).toHaveBeenCalledWith(
      'ali',
      0,
      25,
      expect.stringContaining('isBot'),
    );
    expect(mockedSearchAssets).toHaveBeenCalledWith(
      'ali',
      0,
      25,
      expect.objectContaining({ index: 'team' }),
    );
    expect(options).toEqual([
      {
        value: 'user:alice',
        label: 'Alice',
        supportingText: 'alice',
        ref: expect.objectContaining({ id: 'u1', type: 'user' }),
      },
      {
        value: 'team:eng',
        label: 'Engineering',
        supportingText: 'eng',
        ref: expect.objectContaining({ id: 't1', type: 'team' }),
      },
    ]);
  });

  it('returns an empty list when a fetch fails', async () => {
    mockedSearchUsers.mockRejectedValue(new Error('boom'));
    mockedSearchAssets.mockResolvedValue({ hits: [], total: 0 } as never);
    await expect(fetchUserTeamOptions()).resolves.toEqual([]);
  });
});

describe('fetchDomainOptions', () => {
  it('searches the DOMAIN index and maps display names', async () => {
    mockedSearchAssets.mockResolvedValue({
      hits: [{ id: 'd1', name: 'sales', displayName: 'Sales', fullyQualifiedName: 'sales' }],
      total: 1,
    } as never);
    await expect(fetchDomainOptions('sal')).resolves.toEqual([
      {
        value: 'sales',
        label: 'Sales',
        supportingText: 'sales',
        ref: expect.objectContaining({ id: 'd1', type: 'domain' }),
      },
    ]);
    expect(mockedSearchAssets).toHaveBeenCalledWith(
      'sal',
      0,
      25,
      expect.objectContaining({ index: 'domain' }),
    );
  });
});

describe('fetchRelatedMetricOptions / fetchParentMetricOptions', () => {
  it('search the metric index and return FQN-valued options (ref id is the FQN)', async () => {
    mockedSearchAssets.mockResolvedValue({
      hits: [
        { id: 'm1', name: 'orders', displayName: 'Orders', fullyQualifiedName: 'orders' },
      ],
      total: 1,
    } as never);
    await expect(fetchRelatedMetricOptions('ord')).resolves.toEqual([
      {
        value: 'orders',
        label: 'Orders',
        supportingText: 'orders',
        ref: expect.objectContaining({ id: 'orders', type: 'metric' }),
      },
    ]);
    await expect(fetchParentMetricOptions('ord')).resolves.toEqual([
      {
        value: 'orders',
        label: 'Orders',
        supportingText: 'orders',
        ref: expect.objectContaining({ id: 'orders', type: 'metric' }),
      },
    ]);
    // The metric search composes the entityType clause into the query
    // string; no index option is passed.
    expect(mockedSearchAssets).toHaveBeenCalledWith(
      expect.stringContaining('metric'),
      0,
      25,
    );
  });

  it('return an empty list when the search fails', async () => {
    mockedSearchAssets.mockRejectedValue(new Error('boom'));
    await expect(fetchRelatedMetricOptions()).resolves.toEqual([]);
  });
});
