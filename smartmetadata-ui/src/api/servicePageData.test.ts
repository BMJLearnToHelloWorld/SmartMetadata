/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { mapServicePageData } from './servicePageData';

describe('mapServicePageData', () => {
  it('maps the shared identity, facet, and extra fields', () => {
    expect(
      mapServicePageData({
        id: 'p1',
        name: 'nightly',
        displayName: 'Nightly ETL',
        description: 'Runs nightly',
        fullyQualifiedName: 'svc.nightly',
        owners: [{ id: 'u1', name: 'ann', type: 'user' }],
        domains: [{ id: 'd1', name: 'finance', type: 'domain' }],
        dataProducts: [{ id: 'dp1', name: 'sales-mart', type: 'dataProduct' }],
        tags: [{ tagFQN: 'Tier.Tier1', source: 'Classification' }],
        scheduleInterval: '0 0 * * *',
        state: 'Active',
        usageSummary: { weeklyStats: { percentileRank: 80 } },
        deleted: true,
      }),
    ).toEqual({
      id: 'p1',
      name: 'nightly',
      displayName: 'Nightly ETL',
      description: 'Runs nightly',
      fullyQualifiedName: 'svc.nightly',
      owners: [{ id: 'u1', name: 'ann', displayName: undefined, type: 'user', fullyQualifiedName: undefined }],
      domains: [{ id: 'd1', name: 'finance', displayName: undefined, type: 'domain', fullyQualifiedName: undefined }],
      dataProducts: [{ id: 'dp1', name: 'sales-mart', displayName: undefined, type: 'dataProduct', fullyQualifiedName: undefined }],
      tags: [{ tagFQN: 'Tier.Tier1', source: 'Classification' }],
      usageSummary: { weeklyStats: { percentileRank: 80 } },
      scheduleInterval: '0 0 * * *',
      dataModelType: undefined,
      state: 'Active',
      deleted: true,
    });
  });

  it('maps a search hit _source the same way as a list item', () => {
    expect(
      mapServicePageData({
        id: 'db1',
        name: 'sales',
        entityType: 'database',
        type: 'database',
        owners: [],
        tags: [],
      }),
    ).toMatchObject({ id: 'db1', name: 'sales', owners: [], tags: [] });
  });

  it('returns null for a row with neither id nor name', () => {
    expect(mapServicePageData({ description: 'orphan' })).toBeNull();
    expect(mapServicePageData({})).toBeNull();
  });

  it('falls back to the id for a missing name and leaves deleted unset when absent', () => {
    expect(mapServicePageData({ id: 'x1' })).toMatchObject({ id: 'x1', name: 'x1' });
    expect(mapServicePageData({ id: 'x1', name: 'x' })?.deleted).toBeUndefined();
  });

  it('carries the data model type for dashboard data models', () => {
    expect(
      mapServicePageData({ id: 'dm1', name: 'orders', dataModelType: 'DbtModel' }),
    ).toMatchObject({ dataModelType: 'DbtModel' });
  });

  it('maps certification.tagLabel through the label mapper', () => {
    expect(
      mapServicePageData({
        id: 't1',
        name: 'orders',
        certification: {
          tagLabel: { tagFQN: 'Certification.Gold', source: 'Classification', name: 'Gold' },
        },
      }),
    ).toMatchObject({
      certification: { tagLabel: { tagFQN: 'Certification.Gold', name: 'Gold' } },
    });
    expect(
      mapServicePageData({ id: 't1', name: 'orders', certification: {} })?.certification,
    ).toBeUndefined();
    expect(mapServicePageData({ id: 't1', name: 'orders' })?.certification).toBeUndefined();
  });
});
