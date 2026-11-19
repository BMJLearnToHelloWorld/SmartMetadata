/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { PROFILER_SETTINGS_METRICS } from './profilerSettings';

/**
 * Read-only assertion: the include-columns metric select table must stay
 * byte-identical to the official PROFILER_METRIC list
 * (`openmetadata-ui/.../constants/profiler.constant.ts:41-65`, pin
 * a3012259ca, 392b3efd object tree) — including `variance`, which is a
 * genuine official value HERE. This is the second `variance` occurrence
 * confirmed retained by Bai's 2026-11-18 18:34 ruling on 04:5.6a; it
 * must not be touched by the PROFILER_METRICS deletion in
 * profilerConfig.ts. This test only reads the table; it never imports
 * anything that would mutate it.
 */
const OFFICIAL_PROFILER_METRIC = [
  'valuesCount',
  'valuesPercentage',
  'validCount',
  'duplicateCount',
  'nullCount',
  'nullProportion',
  'missingPercentage',
  'missingCount',
  'uniqueCount',
  'uniqueProportion',
  'distinctCount',
  'distinctProportion',
  'min',
  'max',
  'minLength',
  'maxLength',
  'mean',
  'sum',
  'stddev',
  'variance',
  'median',
  'histogram',
  'customMetricsProfile',
];

describe('profilerSettings metrics table (read-only)', () => {
  it('matches the official PROFILER_METRIC list value-by-value, in order', () => {
    expect([...PROFILER_SETTINGS_METRICS]).toEqual(OFFICIAL_PROFILER_METRIC);
  });

  it('retains variance at the official position', () => {
    expect(PROFILER_SETTINGS_METRICS[19]).toBe('variance');
  });
});
