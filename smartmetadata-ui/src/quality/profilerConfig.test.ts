/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { PROFILER_DATA_TYPES, PROFILER_METRICS, isProfilerDataType, isProfilerMetric } from './profilerConfig';

describe('profilerConfig', () => {
  it('covers the metricConfiguration data types and metrics without duplicates', () => {
    expect(new Set(PROFILER_DATA_TYPES).size).toBe(PROFILER_DATA_TYPES.length);
    expect(new Set(PROFILER_METRICS).size).toBe(PROFILER_METRICS.length);
    expect(PROFILER_DATA_TYPES).toContain('NUMBER');
    expect(PROFILER_DATA_TYPES).toContain('TIMESTAMP');
    expect(PROFILER_METRICS).toContain('nullProportion');
    expect(PROFILER_METRICS).toContain('histogram');
  });

  it('validates values against the tables', () => {
    expect(isProfilerDataType('VARCHAR')).toBe(true);
    expect(isProfilerDataType('GEOMETRY')).toBe(false);
    expect(isProfilerMetric('mean')).toBe(true);
    expect(isProfilerMetric('p99')).toBe(false);
  });
});
