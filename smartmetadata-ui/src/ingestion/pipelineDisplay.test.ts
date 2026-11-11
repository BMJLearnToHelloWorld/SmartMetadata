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
import type { IngestionPipeline, PipelineStatus } from '@/types/ingestion';
import {
  dedupeStatusesByRunId,
  formatRunDuration,
  formatRunTimestamp,
  getIngestionStatusCount,
  isPipelineRunActive,
  renderPipelineState,
  renderPipelineType,
  splitSearchHighlight,
} from './pipelineDisplay';

describe('pipelineDisplay', () => {
  it('renders types per official renderTypeField (P-51)', () => {
    expect(renderPipelineType('dbt')).toBe('dbt');
    expect(renderPipelineType('TestSuite')).toBe('Test Suite');
    expect(renderPipelineType('metadata')).toBe('Metadata');
    expect(renderPipelineType(undefined)).toBe('—');
  });

  it('counts from the latest run step summary (official formula)', () => {
    const pipeline = {
      id: 'p1',
      name: 'p',
      pipelineType: 'metadata',
      pipelineStatuses: [
        {
          runId: 'r1',
          pipelineState: 'success',
          status: [{ name: 's', records: 10, updated_records: 2, errors: 1, warnings: 3 }],
        } as PipelineStatus,
      ],
    } as IngestionPipeline;
    expect(getIngestionStatusCount(pipeline)).toEqual([
      { label: 'success', value: 12, type: 'success' },
      { label: 'failed', value: 1, type: 'failed' },
      { label: 'warning', value: 3, type: 'warning' },
    ]);
    expect(getIngestionStatusCount({ id: 'p2', name: 'q', pipelineType: 'metadata' } as IngestionPipeline)).toBeNull();
  });

  it('dedupes optimistic rows by runId, keeping the first (P-37)', () => {
    const a = { runId: 'r1', pipelineState: 'running' } as PipelineStatus;
    const b = { runId: 'r1', pipelineState: 'success' } as PipelineStatus;
    const c = { runId: 'r2', pipelineState: 'failed' } as PipelineStatus;
    expect(dedupeStatusesByRunId([a, b, c])).toEqual([a, c]);
  });

  it('formats run timestamps and durations (P-21)', () => {
    expect(formatRunTimestamp(undefined)).toBe('—');
    expect(formatRunTimestamp(1710000000000)).toContain('2024');
    expect(formatRunDuration(undefined, 1710000060000)).toBe('—');
    expect(formatRunDuration(1710000000000, undefined)).toBe('—');
    expect(formatRunDuration(1710000000000, 1710000060000)).toBe('1m');
  });

  it('detects live runs and renders state text', () => {
    expect(isPipelineRunActive('running')).toBe(true);
    expect(isPipelineRunActive('queued')).toBe(true);
    expect(isPipelineRunActive('success')).toBe(false);
    expect(renderPipelineState('partialSuccess')).toBe('PartialSuccess');
    expect(renderPipelineState(undefined)).toBe('—');
  });

  it('splits search text case-insensitively for highlight (P-36)', () => {
    expect(splitSearchHighlight('warehouse-metadata', 'house')).toEqual([
      { text: 'ware', match: false },
      { text: 'house', match: true },
      { text: '-metadata', match: false },
    ]);
    expect(splitSearchHighlight('warehouse-metadata', '')).toEqual([
      { text: 'warehouse-metadata', match: false },
    ]);
  });
});
