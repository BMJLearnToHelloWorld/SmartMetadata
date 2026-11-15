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
  getUsageData,
  getUsagePercentile,
  mapUsageSummary,
  ordinalize,
  USAGE_NO_DATA,
} from './usagePercentile';

const EN: Record<string, string> = {
  'usage.usage': 'Usage',
  'usage.pctile': 'pctile',
  'usage.ordinalSuffixSt': 'st',
  'usage.ordinalSuffixNd': 'nd',
  'usage.ordinalSuffixRd': 'rd',
  'usage.ordinalSuffixTh': 'th',
};
const t = (key: string): string => EN[key] ?? key;

describe('ordinalize', () => {
  it('applies the mod-10/mod-100 suffix rules', () => {
    expect(ordinalize(0, t)).toBe('0th');
    expect(ordinalize(1, t)).toBe('1st');
    expect(ordinalize(2, t)).toBe('2nd');
    expect(ordinalize(3, t)).toBe('3rd');
    expect(ordinalize(4, t)).toBe('4th');
    expect(ordinalize(11, t)).toBe('11th');
    expect(ordinalize(12, t)).toBe('12th');
    expect(ordinalize(13, t)).toBe('13th');
    expect(ordinalize(21, t)).toBe('21st');
    expect(ordinalize(22, t)).toBe('22nd');
    expect(ordinalize(23, t)).toBe('23rd');
    expect(ordinalize(111, t)).toBe('111th');
    expect(ordinalize(112, t)).toBe('112th');
    expect(ordinalize(113, t)).toBe('113th');
  });

  it('keeps a decimal rank as-is with the th suffix', () => {
    expect(ordinalize(45.5, t)).toBe('45.5th');
  });
});

describe('getUsagePercentile', () => {
  it('rounds to one decimal and keeps the leading separator space in the non-literal form', () => {
    expect(getUsagePercentile(45, false, t)).toBe(' 45th pctile');
    expect(getUsagePercentile(45.04, false, t)).toBe(' 45th pctile');
    expect(getUsagePercentile(45.06, false, t)).toBe(' 45.1th pctile');
    expect(getUsagePercentile(0, false, t)).toBe(' 0th pctile');
  });

  it('prefixes the Usage label in the literal form', () => {
    expect(getUsagePercentile(45, true, t)).toBe('Usage 45th pctile');
    expect(getUsagePercentile(1, true, t)).toBe('Usage 1st pctile');
  });
});

describe('getUsageData', () => {
  it('distinguishes no data from a zero rank', () => {
    expect(getUsageData(undefined, t)).toBe(USAGE_NO_DATA);
    expect(getUsageData(0, t)).toBe(' 0th pctile');
    expect(getUsageData(72.34, t)).toBe(' 72.3th pctile');
  });
});

describe('mapUsageSummary', () => {
  it('maps weekly stats and drops non-object payloads', () => {
    expect(
      mapUsageSummary({
        date: '2026-11-16',
        dailyStats: { count: 3, percentileRank: 10 },
        weeklyStats: { count: 20, percentileRank: 45.5 },
      }),
    ).toEqual({
      date: '2026-11-16',
      dailyStats: { count: 3, percentileRank: 10 },
      weeklyStats: { count: 20, percentileRank: 45.5 },
      monthlyStats: undefined,
    });
    expect(mapUsageSummary(null)).toBeUndefined();
    expect(mapUsageSummary('x')).toBeUndefined();
    expect(mapUsageSummary({ weeklyStats: { count: 'n/a' } })).toEqual({
      date: undefined,
      dailyStats: undefined,
      weeklyStats: { count: undefined, percentileRank: undefined },
      monthlyStats: undefined,
    });
  });
});
