/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  coverageSeries,
  deriveEstate,
  deriveTotalDataAssets,
  foldConnectors,
  formatServiceTypeLabel,
  latestDay,
  sumForDay,
} from './useDataEstate';

const NEWEST = 1760000000000;
const OLDEST = 1759000000000;

const TOTALS = [
  { day: OLDEST, group: 'table', count: 90 },
  { day: OLDEST, group: 'database', count: 20 },
  { day: NEWEST, group: 'table', count: 100 },
  { day: NEWEST, group: 'database', count: 20 },
];

const COVERAGE = [
  { day: OLDEST, group: 'table', count: 70 },
  { day: OLDEST, group: 'database', count: 100 },
  { day: NEWEST, group: 'table', count: 80 },
  { day: NEWEST, group: 'database', count: 100 },
];

describe('useDataEstate derivations', () => {
  it('takes the newest day total and the oldest day baseline', () => {
    expect(latestDay(TOTALS)).toBe(NEWEST);
    expect(sumForDay(TOTALS, NEWEST)).toBe(120);
    expect(sumForDay(TOTALS, OLDEST)).toBe(110);
  });

  it('weights coverage by assets per type instead of summing percentages', () => {
    const series = coverageSeries(COVERAGE, TOTALS);
    expect(series).toHaveLength(2);
    // (70*90 + 100*20) / 110 and (80*100 + 100*20) / 120 — never 240%.
    expect(series[0]).toBeCloseTo(75.45, 1);
    expect(series[1]).toBeCloseTo(83.33, 1);
  });

  it('falls back to the plain mean when no weight is available', () => {
    expect(coverageSeries([{ day: NEWEST, count: 50 }], [])).toEqual([50]);
  });

  it('derives the estate with a live-connector fallback when DI has no rows', () => {
    const figures = deriveEstate(
      {},
      [
        { key: 'Snowflake', name: 'Snowflake', count: 60 },
        { key: 'Postgres', name: 'Postgres', count: 40 },
      ],
      7,
    );
    expect(figures.totalAssets).toBe(100);
    expect(figures.totalDelta).toBeNull();
    expect(figures.connectorCount).toBe(2);
    expect(figures.descriptionCoverage).toBeNull();
  });

  it('derives the estate from DI rows with an asset-weighted coverage', () => {
    const figures = deriveEstate(
      { total_data_assets: TOTALS, percentage_of_data_asset_with_description: COVERAGE },
      [
        { key: 'Snowflake', name: 'Snowflake', count: 60 },
        { key: 'Postgres', name: 'Postgres', count: 40 },
      ],
      7,
    );
    expect(figures.totalAssets).toBe(120);
    expect(figures.totalDelta).toBe(10);
    expect(figures.descriptionCoverage).toBeCloseTo(83.33, 1);
    expect(figures.descriptionCoverageDelta).toBeCloseTo(7.88, 1);
    expect(figures.descriptionCoverageSeries).toHaveLength(2);
  });

  it('folds connectors past the named limit into one Other entry', () => {
    const connectors = Array.from({ length: 8 }, (_, i) => ({
      key: `svc-${i}`,
      name: `Service ${i}`,
      count: 10 - i,
    }));
    const folded = foldConnectors(connectors);
    expect(folded).toHaveLength(6);
    expect(folded[5].key).toBe('__other__');
    expect(folded[5].count).toBe(5 + 4 + 3);
  });

  it('start-cases service type labels', () => {
    expect(formatServiceTypeLabel('BigQuery')).toBe('Big Query');
    expect(formatServiceTypeLabel('azureSQL')).toBe('Azure SQL');
  });
});

describe('deriveTotalDataAssets', () => {
  it('splits by type with shares, deltas and the fastest grower', () => {
    const figures = deriveTotalDataAssets(TOTALS, 7);
    expect(figures.totalAssets).toBe(120);
    expect(figures.totalDelta).toBe(10);
    expect(figures.assetTypes.map((type) => type.key)).toEqual(['table', 'database']);
    expect(figures.assetTypes[0].share).toBeCloseTo(83.33, 1);
    expect(figures.assetTypes[0].delta).toBe(10);
    expect(figures.assetTypes[1].delta).toBe(0);
    expect(figures.fastestGrowing?.key).toBe('table');
  });

  it('reports no movement for a single-day window', () => {
    const figures = deriveTotalDataAssets([{ day: NEWEST, group: 'table', count: 100 }], 7);
    expect(figures.totalDelta).toBeNull();
    expect(figures.assetTypes[0].delta).toBeNull();
    expect(figures.fastestGrowing).toBeUndefined();
  });

  it('leaves zero-count types out', () => {
    const figures = deriveTotalDataAssets(
      [
        { day: NEWEST, group: 'table', count: 5 },
        { day: NEWEST, group: 'database', count: 0 },
      ],
      7,
    );
    expect(figures.assetTypes.map((type) => type.key)).toEqual(['table']);
  });
});
