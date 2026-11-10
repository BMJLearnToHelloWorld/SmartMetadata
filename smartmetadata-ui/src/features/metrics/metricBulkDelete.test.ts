/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTopmostSelectedMetrics,
  getUnloadedMetricAncestorIds,
  waitForMetricsGone,
  type MetricParentLink,
} from './metricBulkDelete';
import { ApiError } from '@/api/client';

const links: MetricParentLink[] = [
  { id: 'root', fullyQualifiedName: 'root' },
  { id: 'child', parentId: 'root', fullyQualifiedName: 'root.child' },
  { id: 'grandchild', parentId: 'child', fullyQualifiedName: 'root.child.grandchild' },
  { id: 'other', fullyQualifiedName: 'other' },
];

describe('getTopmostSelectedMetrics', () => {
  it('keeps only the selected metrics with no selected ancestor', () => {
    expect(getTopmostSelectedMetrics(links, ['child', 'grandchild'])).toEqual([
      expect.objectContaining({ id: 'child' }),
    ]);
    expect(getTopmostSelectedMetrics(links, ['grandchild', 'other'])).toEqual([
      expect.objectContaining({ id: 'grandchild' }),
      expect.objectContaining({ id: 'other' }),
    ]);
  });

  it('resolves ancestry through extra parent ids when the parent is not loaded', () => {
    expect(
      getTopmostSelectedMetrics(
        [{ id: 'orphan', fullyQualifiedName: 'orphan' }],
        ['orphan'],
        new Map([['orphan', 'root']]),
      ),
    ).toEqual([expect.objectContaining({ id: 'orphan' })]);
    expect(
      getTopmostSelectedMetrics(
        [
          { id: 'a', fullyQualifiedName: 'a' },
          { id: 'b', fullyQualifiedName: 'b' },
        ],
        ['a', 'b'],
        new Map([['b', 'a']]),
      ),
    ).toEqual([expect.objectContaining({ id: 'a' })]);
  });

  it('prefers loaded parent links over extra parent ids', () => {
    expect(
      getTopmostSelectedMetrics(links, ['child', 'grandchild'], new Map([['grandchild', 'other']])),
    ).toEqual([expect.objectContaining({ id: 'child' })]);
  });
});

describe('getUnloadedMetricAncestorIds', () => {
  it('returns the first unloaded ancestor and stops at it (a hidden middle level)', () => {
    // Root is not loaded on the page (absent from links): the walk from
    // grandchild passes the loaded child and stops at root.
    const withoutRoot = links.filter((link) => link.id !== 'root');
    expect(getUnloadedMetricAncestorIds(withoutRoot, ['grandchild'])).toEqual(['root']);
    // With child unloaded too, the walk stops at child — the first unloaded ancestor.
    const withoutChild = links.filter((link) => link.id !== 'child');
    expect(getUnloadedMetricAncestorIds(withoutChild, ['grandchild'])).toEqual(['child']);
  });

  it('returns nothing when every ancestor is loaded', () => {
    expect(getUnloadedMetricAncestorIds(links, ['grandchild', 'child', 'root'])).toEqual([]);
  });
});

describe('waitForMetricsGone', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true once every FQN reads 404', async () => {
    vi.useFakeTimers();
    const fetchMetric = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(404, '', 'Not found'))
      .mockRejectedValueOnce(new ApiError(500, '', 'Server error'))
      .mockRejectedValueOnce(new ApiError(404, '', 'Not found'));
    const promise = waitForMetricsGone(['a', 'b'], {
      intervalMs: 1000,
      timeoutMs: 10000,
      fetchMetric,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe(true);
    // 'a' was gone at once; 'b' needed one retry (a 500 is "not gone yet").
    expect(fetchMetric).toHaveBeenCalledTimes(3);
  });

  it('resolves false on timeout when a metric never goes away', async () => {
    vi.useFakeTimers();
    const fetchMetric = vi.fn().mockResolvedValue({ id: 'x' });
    const promise = waitForMetricsGone(['a'], { intervalMs: 1000, timeoutMs: 2500, fetchMetric });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toBe(false);
  });

  it('resolves true immediately for an empty FQN list', async () => {
    await expect(waitForMetricsGone([])).resolves.toBe(true);
  });
});
