import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILER_RANGE_DAYS,
  calculateCustomMetrics,
  calculateRowCountMetrics,
  calculateSystemMetrics,
  defaultProfilerRange,
} from './tableProfilerChart';

describe('tableProfilerChart (official TableProfilerUtils + DEFAULT_RANGE_DATA)', () => {
  it('uses official last-7-days start-of-day to end-of-day range', () => {
    expect(DEFAULT_PROFILER_RANGE_DAYS).toBe(7);
    const now = Date.parse('2026-11-28T15:00:00+08:00');
    const range = defaultProfilerRange(now);
    const start = new Date(range.startTs);
    const end = new Date(range.endTs);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(range.endTs - range.startTs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(range.endTs - range.startTs).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });

  it('reverses official table profiles into rowCount series', () => {
    const points = calculateRowCountMetrics([
      { timestamp: 2, rowCount: 20 },
      { timestamp: 1, rowCount: 10 },
    ]);
    expect(points.map((point) => point.rowCount)).toEqual([10, 20]);
  });

  it('maps official system profiles by operation and custom metrics by name', () => {
    const operations = calculateSystemMetrics([
      { timestamp: 2, operation: 'Insert', rowsAffected: 5 },
      { timestamp: 1, operation: 'Delete', rowsAffected: 1 },
    ]);
    expect(operations[0]?.Delete).toBe(1);
    expect(operations[1]?.Insert).toBe(5);
    const custom = calculateCustomMetrics(
      [
        { timestamp: 1, customMetrics: [{ name: 'row_ratio', value: 0.2 }] },
        { timestamp: 2, customMetrics: [{ name: 'row_ratio', value: 0.4 }] },
      ],
      [{ name: 'row_ratio' }],
    );
    expect(custom.row_ratio?.map((point) => point.row_ratio)).toEqual([0.2, 0.4]);
  });
});
