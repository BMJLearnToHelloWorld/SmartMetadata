/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  getMetricAssetSelectionQueryFilter,
  getMetricAssetsQueryFilter,
  METRIC_ASSET_SELECTION_EXCLUDED_ENTITY_TYPES,
} from './metricAssets';

describe('getMetricAssetsQueryFilter (pin MetricPureUtils.ts:70-76)', () => {
  it('targets linked assets by document id', () => {
    expect(getMetricAssetsQueryFilter(['a1', 'a2'])).toEqual({
      query: { bool: { must: [{ ids: { values: ['a1', 'a2'] } }] } },
    });
  });

  it('passes an empty id list through (no linked assets yet)', () => {
    expect(getMetricAssetsQueryFilter([])).toEqual({
      query: { bool: { must: [{ ids: { values: [] } }] } },
    });
  });
});

describe('getMetricAssetSelectionQueryFilter (pin MetricPureUtils.ts:78-93)', () => {
  it('excludes linked ids and the never-offered entity types', () => {
    expect(getMetricAssetSelectionQueryFilter(['a1'])).toEqual({
      query: {
        bool: {
          must_not: [
            { ids: { values: ['a1'] } },
            { term: { entityType: 'metric' } },
            { term: { entityType: 'glossaryTerm' } },
            { term: { entityType: 'tag' } },
            { term: { entityType: 'dataProduct' } },
            { term: { entityType: 'tableColumn' } },
          ],
        },
      },
    });
    expect(METRIC_ASSET_SELECTION_EXCLUDED_ENTITY_TYPES).toEqual([
      'metric',
      'glossaryTerm',
      'tag',
      'dataProduct',
      'tableColumn',
    ]);
  });
});
