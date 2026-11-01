/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  clampNodesPerLayer,
  LINEAGE_TIME_PRESETS,
  normalizeLineageCanvasConfig,
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

  it('lists custom and point-in-time presets as unsupported, not silently active', () => {
    const unsupported = LINEAGE_TIME_PRESETS.filter((item) => !item.supported).map(
      (item) => item.value,
    );
    expect(unsupported).toEqual(['customRange', 'pointInTime']);
  });

  it('clamps nodes per layer to the official minimum of 5', () => {
    expect(clampNodesPerLayer(3)).toBe(5);
    expect(clampNodesPerLayer(50)).toBe(50);
    expect(clampNodesPerLayer('nope')).toBe(50);
  });

  it('normalizes unsupported layer and preset back to defaults and clamps depth to 0-3', () => {
    const config = normalizeLineageCanvasConfig({
      upstreamDepth: 9,
      downstreamDepth: -2,
      nodesPerLayer: 2,
      layer: 'DataObservability',
      pipelineViewMode: 'Edge',
      timePreset: 'customRange',
    });
    expect(config).toEqual({
      upstreamDepth: 3,
      downstreamDepth: 0,
      nodesPerLayer: 5,
      layer: 'EntityLineage',
      pipelineViewMode: 'Edge',
      timePreset: 'allTime',
    });
  });
});
