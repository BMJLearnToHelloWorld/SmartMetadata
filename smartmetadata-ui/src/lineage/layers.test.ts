/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getAssetLayerKeys,
  isLineageServiceEntityType,
  parseLineageEntityContext,
  resolvePlatformViewFetchArgs,
} from './layers';

describe('getAssetLayerKeys (pin LineageLayers getAssetLayerKeys)', () => {
  it('offers overlays + Service view for a plain table', () => {
    expect(getAssetLayerKeys('table', {})).toEqual([
      'ColumnLevelLineage',
      'DataObservability',
      'Service',
    ]);
  });

  it('offers nothing but the Service view for a domain entity with domains', () => {
    // hasDomainContext is false for the domain type itself.
    expect(
      getAssetLayerKeys('domain', { domains: [{ fullyQualifiedName: 'd', type: 'domain' }] }),
    ).toEqual(['ColumnLevelLineage', 'DataObservability', 'Service']);
  });

  it('offers Domain view only when the entity has domains', () => {
    expect(
      getAssetLayerKeys('table', { domains: [{ fullyQualifiedName: 'd', type: 'domain' }] }),
    ).toEqual(['ColumnLevelLineage', 'DataObservability', 'Service', 'Domain']);
    expect(getAssetLayerKeys('table', { domains: [] })).not.toContain('Domain');
  });

  it('offers DataProduct view only when the entity has data products', () => {
    expect(
      getAssetLayerKeys('table', {
        dataProducts: [{ fullyQualifiedName: 'dp', type: 'dataProduct' }],
      }),
    ).toEqual(['ColumnLevelLineage', 'DataObservability', 'Service', 'DataProduct']);
    expect(getAssetLayerKeys('table', {})).not.toContain('DataProduct');
  });

  it('offers no overlays and no platform views for service types', () => {
    for (const type of ['databaseService', 'dashboardService', 'apiService', 'driveService']) {
      expect(isLineageServiceEntityType(type)).toBe(true);
      expect(getAssetLayerKeys(type, {})).toEqual([]);
    }
    expect(isLineageServiceEntityType('table')).toBe(false);
  });
});

describe('parseLineageEntityContext', () => {
  it('extracts service, domains and data products, dropping refs without an FQN', () => {
    expect(
      parseLineageEntityContext({
        service: { fullyQualifiedName: 'pg', type: 'databaseService' },
        domains: [{ fullyQualifiedName: 'd1', type: 'domain' }, { type: 'domain' }],
        dataProducts: [{ fullyQualifiedName: 'dp1' }],
        owners: [{ fullyQualifiedName: 'o1' }],
      }),
    ).toEqual({
      service: { fullyQualifiedName: 'pg', type: 'databaseService' },
      domains: [{ fullyQualifiedName: 'd1', type: 'domain' }],
      dataProducts: [{ fullyQualifiedName: 'dp1', type: '' }],
    });
    expect(parseLineageEntityContext(null)).toEqual({});
    expect(parseLineageEntityContext({})).toEqual({});
  });
});

describe('resolvePlatformViewFetchArgs (pin resolvePlatformViewEntityFetchArgs)', () => {
  const context = {
    service: { fullyQualifiedName: 'pg', type: 'databaseService' },
    domains: [{ fullyQualifiedName: 'd1', type: 'domain' }],
    dataProducts: [{ fullyQualifiedName: 'dp1', type: 'dataProduct' }],
  };
  it('resolves Service to the entity service, Domain/DataProduct to the first entry', () => {
    expect(resolvePlatformViewFetchArgs('Service', context)).toEqual({
      fqn: 'pg',
      type: 'databaseService',
    });
    expect(resolvePlatformViewFetchArgs('Domain', context)).toEqual({
      fqn: 'd1',
      type: 'domain',
    });
    expect(resolvePlatformViewFetchArgs('DataProduct', context)).toEqual({
      fqn: 'dp1',
      type: 'dataProduct',
    });
    expect(resolvePlatformViewFetchArgs('None', context)).toBeUndefined();
  });

  it('returns undefined when the container is missing', () => {
    expect(resolvePlatformViewFetchArgs('Service', {})).toBeUndefined();
    expect(resolvePlatformViewFetchArgs('Domain', {})).toBeUndefined();
    expect(resolvePlatformViewFetchArgs('DataProduct', {})).toBeUndefined();
  });
});
