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
import {
  bucketsToPoints,
  columnNullPoints,
  countByLabel,
  formatChartTs,
  insightResultsToSeries,
  profilesToRowCountPoints,
  testResultsToStatusPoints,
  testResultsToTimeline,
  usageToPoints,
} from './series';
import { hasChartPoints } from './types';

describe('chart series mapping', () => {
  it('drops empty or non-finite buckets instead of inventing slices', () => {
    expect(
      bucketsToPoints([
        { key: 'table', count: 4 },
        { key: '', count: 2 },
        { key: 'topic', count: 0 },
      ]),
    ).toEqual([{ label: 'table', value: 4 }]);
  });

  it('keeps the latest row count when two profiles share a day', () => {
    const day = Date.UTC(2026, 0, 2);
    expect(
      profilesToRowCountPoints([
        { timestamp: day, rowCount: 10 },
        { timestamp: day + 3_600_000, rowCount: 12 },
        { timestamp: Date.UTC(2026, 0, 1), rowCount: 8 },
        { timestamp: Date.UTC(2026, 0, 3) },
      ]),
    ).toEqual([
      { label: '2026-01-01', value: 8 },
      { label: '2026-01-02', value: 12 },
    ]);
  });

  it('maps usage dailyStats only when date and count exist', () => {
    expect(
      usageToPoints([
        { date: '2026-01-03', count: 2 },
        { date: '2026-01-01', count: 5 },
        { date: '2026-01-02' },
      ]),
    ).toEqual([
      { label: '2026-01-01', value: 5 },
      { label: '2026-01-03', value: 2 },
    ]);
  });

  it('plots column null counts from latest profile columns', () => {
    expect(
      columnNullPoints([
        { name: 'id', nullCount: 0 },
        { name: 'email', nullCount: 3 },
        { name: 'skip' },
      ]),
    ).toEqual([
      { label: 'id', value: 0 },
      { label: 'email', value: 3 },
    ]);
  });

  it('counts test statuses and timelines without invented days', () => {
    expect(testResultsToStatusPoints([{ testCaseStatus: 'Success' }, { testCaseStatus: 'Failed' }, {}])).toEqual([
      { label: 'Success', value: 1 },
      { label: 'Failed', value: 1 },
    ]);
    const day = Date.UTC(2026, 5, 1);
    expect(
      testResultsToTimeline([
        { testCaseStatus: 'Success', timestamp: day },
        { testCaseStatus: 'Success', timestamp: day + 1_000 },
        { testCaseStatus: 'Failed', timestamp: day },
      ]),
    ).toEqual([
      { name: 'Success', points: [{ label: '2026-06-01', value: 2 }] },
      { name: 'Failed', points: [{ label: '2026-06-01', value: 1 }] },
    ]);
  });

  it('groups data-insight results by group and uses term or day labels', () => {
    expect(
      insightResultsToSeries('total_data_assets', [
        { count: 4, day: Date.UTC(2026, 0, 1), group: 'table' },
        { count: 2, term: 'Tier.Gold', group: 'tier' },
        { count: 9 },
      ]),
    ).toEqual([
      { name: 'table', points: [{ label: '2026-01-01', value: 4 }] },
      { name: 'tier', points: [{ label: 'Tier.Gold', value: 2 }] },
    ]);
  });

  it('treats empty mapped series as no chart', () => {
    expect(hasChartPoints([])).toBe(false);
    expect(hasChartPoints([{ name: 'x', points: [] }])).toBe(false);
    expect(countByLabel([undefined, ''])).toEqual([]);
    expect(formatChartTs(undefined)).toBe('');
  });
});
