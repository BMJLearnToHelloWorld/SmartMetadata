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
import { ApiError } from '@/api/client';
import { searchAssets } from '@/api/search';
import type { SearchHit, SearchPage } from '@/types/api';
import {
  getAuthTypeItems,
  getSelectArgumentConfig,
  getSubscriptionItems,
  resolveAlertAiArgumentLabels,
  searchAlertAiArgumentOptions,
} from './alertArgumentSearch';
import type { AlertSourceSearch } from './alertSourceSearch';
import type { AlertSearchHooks } from './alertSourceSearch';
import type { TranslateFn } from './alertUtils';

vi.mock('@/api/search', () => ({ searchAssets: vi.fn() }));

const mockedSearchAssets = vi.mocked(searchAssets);

const t: TranslateFn = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as TranslateFn;

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    name: 'orders',
    displayName: 'Orders',
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

describe('getSelectArgumentConfig', () => {
  it('offers every event type until the sources narrow them', () => {
    const all = getSelectArgumentConfig('eventTypeList', t);
    expect(all?.items).toHaveLength(20);
    expect(all?.items[0]).toEqual({ id: 'entityCreated', label: 'Entity Created' });
    expect(all?.label).toBe('label.event-type');
    const narrowed = getSelectArgumentConfig('eventTypeList', t, ['entityCreated']);
    expect(narrowed?.items).toEqual([{ id: 'entityCreated', label: 'Entity Created' }]);
  });

  it('offers the pipeline, ingestion, test and contract lists', () => {
    expect(getSelectArgumentConfig('pipelineStateList', t)?.items.map((i) => i.id)).toEqual([
      'Failed',
      'Pending',
      'Skipped',
      'Successful',
    ]);
    expect(getSelectArgumentConfig('ingestionPipelineStateList', t)?.items.map((i) => i.id)).toEqual([
      'failed',
      'partialSuccess',
      'queued',
      'running',
      'stopped',
      'success',
    ]);
    expect(getSelectArgumentConfig('testStatusList', t)?.label).toBe('label.test-suite-status');
    expect(getSelectArgumentConfig('testResultList', t)?.label).toBe('label.test-case-result');
    const contract = getSelectArgumentConfig('contractStatusList', t);
    expect(contract?.items).toEqual([
      { id: 'Success', label: 'label.success' },
      { id: 'Failed', label: 'label.failed' },
      { id: 'Running', label: 'label.running' },
      { id: 'Aborted', label: 'label.aborted' },
    ]);
  });

  it('returns nothing for other arguments', () => {
    expect(getSelectArgumentConfig('fqnList', t)).toBeUndefined();
  });
});

describe('getAuthTypeItems / getSubscriptionItems', () => {
  it('offers the three auth types', () => {
    expect(getAuthTypeItems(t)).toEqual([
      { id: 'none', label: 'label.no-authentication' },
      { id: 'bearer', label: 'label.bearer-hmac-signature' },
      { id: 'oauth2', label: 'label.oauth2-client-credential-plural' },
    ]);
  });

  it('offers Email only for Users/Followers/Admins', () => {
    const users = getSubscriptionItems('Users');
    expect(users.find((item) => item.id === 'Email')?.isDisabled).toBe(false);
    expect(users.find((item) => item.id === 'Slack')?.isDisabled).toBe(true);
    const teams = getSubscriptionItems('Teams');
    expect(teams.find((item) => item.id === 'Slack')?.isDisabled).toBe(false);
  });
});

describe('searchAlertAiArgumentOptions', () => {
  const sourceSearch: AlertSourceSearch = {
    indexes: ['table'],
    containerEntities: [],
    byName: vi.fn(async () => [{ label: 'db.orders', value: 'db.orders' }]),
    byId: vi.fn(async () => [{ id: 'id-1', fullyQualifiedName: 'db.orders' }]),
  };

  it('searches source names and ids through the source search', async () => {
    expect(
      await searchAlertAiArgumentOptions(
        { argument: 'fqnList', searchText: ' ord ', sourceSearch },
        hooks,
      ),
    ).toEqual([{ id: 'db.orders', label: 'db.orders' }]);
    expect(sourceSearch.byName).toHaveBeenCalledWith('ord');
    expect(
      await searchAlertAiArgumentOptions(
        { argument: 'entityIdList', searchText: 'id-1', sourceSearch },
        hooks,
      ),
    ).toEqual([{ id: 'id-1', label: 'id-1', supportingText: 'db.orders' }]);
  });

  it('searches fixed indexes for the other arguments', async () => {
    mockedSearchAssets.mockResolvedValue(page([hit()]));
    const options = await searchAlertAiArgumentOptions(
      { argument: 'domainList', searchText: 'd', sourceSearch },
      hooks,
    );
    expect(options).toEqual([{ id: 'db.orders', label: 'Orders' }]);
    expect(mockedSearchAssets).toHaveBeenCalledWith('d', 0, 50, {
      index: 'domain',
      query_filter: undefined,
    });
  });

  it('uses FQNs as labels for table arguments', async () => {
    mockedSearchAssets.mockResolvedValue(page([hit()]));
    const options = await searchAlertAiArgumentOptions(
      { argument: 'tableNameList', searchText: 'o', sourceSearch },
      hooks,
    );
    expect(options).toEqual([{ id: 'db.orders', label: 'db.orders' }]);
  });

  it('returns nothing for unknown arguments', async () => {
    expect(
      await searchAlertAiArgumentOptions(
        { argument: 'nope', searchText: 'x', sourceSearch },
        hooks,
      ),
    ).toEqual([]);
    expect(mockedSearchAssets).not.toHaveBeenCalled();
  });

  it('toasts the server message on failure, suppressing forbidden reads', async () => {
    mockedSearchAssets.mockRejectedValueOnce(new ApiError(500, 'Server exploded'));
    expect(
      await searchAlertAiArgumentOptions(
        { argument: 'domainList', searchText: 'd', sourceSearch },
        hooks,
      ),
    ).toEqual([]);
    expect(notified).toEqual(['Server exploded']);
    mockedSearchAssets.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    expect(
      await searchAlertAiArgumentOptions(
        { argument: 'domainList', searchText: 'd', sourceSearch },
        hooks,
      ),
    ).toEqual([]);
    expect(notified).toHaveLength(1);
  });
});

describe('resolveAlertAiArgumentLabels', () => {
  it('resolves saved values to display names via an FQN term query', async () => {
    mockedSearchAssets.mockResolvedValue(page([hit()]));
    const options = await resolveAlertAiArgumentLabels('domainList', ['db.orders']);
    expect(options).toEqual([{ id: 'db.orders', label: 'Orders' }]);
    const call = mockedSearchAssets.mock.calls[0];
    expect(call[0]).toBe('');
    expect(call[3]?.query_filter).toContain('db.orders');
  });

  it('resolves nothing for FQN-labelled arguments, unknown arguments or empty values', async () => {
    expect(await resolveAlertAiArgumentLabels('tableNameList', ['db.orders'])).toEqual([]);
    expect(await resolveAlertAiArgumentLabels('fqnList', ['db.orders'])).toEqual([]);
    expect(await resolveAlertAiArgumentLabels('domainList', [])).toEqual([]);
    expect(mockedSearchAssets).not.toHaveBeenCalled();
  });

  it('fails silently', async () => {
    mockedSearchAssets.mockRejectedValue(new Error('boom'));
    expect(await resolveAlertAiArgumentLabels('domainList', ['db.orders'])).toEqual([]);
  });
});
