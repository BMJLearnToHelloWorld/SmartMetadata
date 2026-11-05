/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  clampNodesPerLayer,
  isLineageDateString,
  lineageDateToEndMillis,
  lineageDateToStartMillis,
  LINEAGE_TIME_PRESETS,
  normalizeLineageCanvasConfig,
  resolveLineageTimeRange,
  timeRangeForPreset,
} from './config';

describe('lineage config tables', () => {
  it('resolves last-N-days presets to a window ending at now', () => {
    const now = 1_800_000_000_000;
    const range = timeRangeForPreset('last7Days', now);
    expect(range.endTime).toBe(now);
    expect(range.startTime).toBe(now - 7 * 24 * 60 * 60 * 1000);
    expect(timeRangeForPreset('allTime', now)).toEqual({});
  });

  it('lists custom and point-in-time presets as supported now that date inputs exist', () => {
    expect(LINEAGE_TIME_PRESETS.filter((item) => !item.supported)).toEqual([]);
    expect(LINEAGE_TIME_PRESETS.map((item) => item.value)).toEqual([
      'allTime',
      'last7Days',
      'last14Days',
      'last28Days',
      'customRange',
      'pointInTime',
    ]);
  });

  it('resolves custom ranges and point-in-time dates to search-lineage ranges', () => {
    expect(
      resolveLineageTimeRange({
        timePreset: 'customRange',
        customStartDate: '2026-01-05',
        customEndDate: '2026-01-07',
      }),
    ).toEqual({
      startTime: lineageDateToStartMillis('2026-01-05'),
      endTime: lineageDateToEndMillis('2026-01-07'),
    });
    expect(
      resolveLineageTimeRange({ timePreset: 'pointInTime', pointDate: '2026-01-07' }),
    ).toEqual({ endTime: lineageDateToEndMillis('2026-01-07') });
    // Invalid or inverted picks resolve to no time params, never a
    // half-formed range.
    expect(
      resolveLineageTimeRange({
        timePreset: 'customRange',
        customStartDate: '2026-01-07',
        customEndDate: '2026-01-05',
      }),
    ).toEqual({});
    expect(resolveLineageTimeRange({ timePreset: 'customRange' })).toEqual({});
    expect(resolveLineageTimeRange({ timePreset: 'pointInTime' })).toEqual({});
  });

  it('maps picked days to local-midnight starts and end-of-day ends', () => {
    const start = new Date(2026, 0, 5);
    const end = new Date(2026, 0, 8);
    expect(lineageDateToStartMillis('2026-01-05')).toBe(start.getTime());
    expect(lineageDateToEndMillis('2026-01-07')).toBe(end.getTime() - 1);
    expect(isLineageDateString('2026-02-30')).toBe(false);
    expect(isLineageDateString('2026-01-05')).toBe(true);
    expect(isLineageDateString('not-a-date')).toBe(false);
  });

  it('clamps nodes per layer to the official minimum of 5', () => {
    expect(clampNodesPerLayer(3)).toBe(5);
    expect(clampNodesPerLayer(50)).toBe(50);
    expect(clampNodesPerLayer('nope')).toBe(50);
  });

  it('normalizes unsupported layer back to defaults, keeps customRange, and clamps depth to 0-3', () => {
    const config = normalizeLineageCanvasConfig({
      upstreamDepth: 9,
      downstreamDepth: -2,
      nodesPerLayer: 2,
      layer: 'DataObservability',
      pipelineViewMode: 'Edge',
      timePreset: 'customRange',
      customStartDate: '2026-01-05',
      customEndDate: '2026-02-30',
      pointDate: '2026-01-07',
    });
    expect(config).toEqual({
      upstreamDepth: 3,
      downstreamDepth: 0,
      nodesPerLayer: 5,
      layer: 'EntityLineage',
      pipelineViewMode: 'Edge',
      timePreset: 'customRange',
      customStartDate: '2026-01-05',
      pointDate: '2026-01-07',
    });
  });
});
