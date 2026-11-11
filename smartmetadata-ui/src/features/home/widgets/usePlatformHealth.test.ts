/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import { cleanReason, useIngestionPipelineStats, type IngestionPipelineStats } from './usePlatformHealth';

const getServicesOverview = vi.fn();
const listIngestionPipelines = vi.fn();

vi.mock('@/api/services', () => ({
  getServicesOverview: (...args: unknown[]) => getServicesOverview(...args),
}));
vi.mock('@/api/ingestionPipelines', () => ({
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
}));

function overviewResponse(data: unknown[], healthCounts: Record<string, Record<string, number>>, total: number) {
  return {
    total,
    data,
    healthCounts,
    counts: {},
    serviceTypeCounts: {},
  };
}

function serviceSummary(id: string, health: string, entityType = 'databaseService') {
  return {
    id,
    entityType,
    name: `svc-${id}`,
    displayName: `Service ${id}`,
    fullyQualifiedName: `svc-${id}`,
    serviceType: 'Postgres',
    health,
  };
}

function pipelineRun(pipelineState: string, timestamp: number, error?: string) {
  return {
    id: `pipe-${timestamp}`,
    name: `pipe-${timestamp}`,
    fullyQualifiedName: `svc-a.pipe-${timestamp}`,
    pipelineType: 'metadata',
    pipelineStatuses: [
      {
        pipelineState,
        timestamp,
        status: error
          ? [{ name: 'metadata', failures: [{ error }] }]
          : [],
      },
    ],
  };
}

const Harness = defineComponent({
  setup() {
    const { stats, isLoading, isError, refetch } = useIngestionPipelineStats();
    return { stats, isLoading, isError, refetch };
  },
  render() {
    return h('div', { 'data-testid': 'harness' }, String(this.stats.connectedServices));
  },
});

describe('useIngestionPipelineStats', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    getServicesOverview.mockReset();
    listIngestionPipelines.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads the failed page, backfills partial when room remains, and resolves culprits', async () => {
    getServicesOverview
      .mockResolvedValueOnce(
        overviewResponse(
          [serviceSummary('a', 'failed'), serviceSummary('b', 'failed')],
          { databaseService: { failed: 2, partialSuccess: 1, success: 1, notRun: 1 } },
          5,
        ),
      )
      .mockResolvedValueOnce(
        overviewResponse(
          [serviceSummary('c', 'partialSuccess')],
          { databaseService: { failed: 2, partialSuccess: 1, success: 1, notRun: 1 } },
          5,
        ),
      );
    listIngestionPipelines.mockImplementation(async (query: { serviceFilter?: string }) => {
      if (query.serviceFilter === 'svc-a') {
        return {
          data: [
            pipelineRun('success', 3000),
            pipelineRun(
              'failed',
              2000,
              '[org.postgresql.util.PSQLException: Connection refused]: Connection to localhost:5432 refused',
            ),
            pipelineRun('failed', 1000, 'Workflow failed: boom'),
          ],
          paging: { total: 3 },
        };
      }
      return { data: [], paging: { total: 0 } };
    });

    const wrapper = mount(Harness);
    await flushPromises();
    await flushPromises();
    // Setup bindings are unwrapped on the instance: vm.stats is the
    // stats object itself, not the computed ref.
    const stats = (wrapper.vm as unknown as { stats: IngestionPipelineStats }).stats;
    expect(stats.connectedServices).toBe(5);
    expect(stats.failedServices).toBe(2);
    expect(stats.warningServices).toBe(1);
    expect(stats.healthyServices).toBe(1);
    expect(stats.pendingServices).toBe(1);
    // Failed ranks before partial; the culprit is the most recent failed run.
    expect(stats.failingServices.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(stats.failingServices[0]?.reason).toBe('Connection to localhost:5432 refused');
    expect(stats.failingServices[0]?.lastRunTs).toBe(2000);
    expect(stats.failingServices[0]?.state).toBe('failed');
    expect(stats.failingServices[2]?.state).toBe('partialSuccess');
    // The overview filter narrows the page and its total, never the count
    // maps — and the repeat health param is sent as an array, never String()ed.
    expect(getServicesOverview).toHaveBeenCalledTimes(2);
    expect(getServicesOverview.mock.calls[0]?.[0]).toMatchObject({ health: ['failed'], limit: 10 });
    expect(getServicesOverview.mock.calls[1]?.[0]).toMatchObject({
      health: ['partialSuccess'],
      limit: 8,
    });
    expect(listIngestionPipelines).toHaveBeenCalledWith(
      expect.objectContaining({ fields: 'pipelineStatuses', limit: 50, serviceFilter: 'svc-a' }),
    );
  });

  it('derives the estate total from healthCounts when the failed page is empty', async () => {
    // Live 2026-11-11 case: one not-run service, zero failed — the
    // health=failed page has paging.total 0, but the estate total is 1.
    // Reading overview.total here used to show the "no services connected"
    // empty state although a service exists.
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse([], { databaseService: { notRun: 1 } }, 0),
    );
    const wrapper = mount(Harness);
    await flushPromises();
    await flushPromises();
    const stats = (wrapper.vm as unknown as { stats: IngestionPipelineStats }).stats;
    expect(stats.connectedServices).toBe(1);
    expect(stats.pendingServices).toBe(1);
    expect(stats.failedServices).toBe(0);
    expect(stats.healthyServices).toBe(0);
    expect(stats.warningServices).toBe(0);
    expect(stats.failingServices).toEqual([]);
    expect(getServicesOverview).toHaveBeenCalledTimes(1);
    expect(getServicesOverview.mock.calls[0]?.[0]).toMatchObject({ health: ['failed'], limit: 10 });
  });

  it('ignores the filtered paging.total when a service is failing', async () => {
    // The health=failed page's total is the failed count (1), not the
    // estate (4): the total must come from healthCounts, never the page.
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(
        [serviceSummary('a', 'failed')],
        { databaseService: { failed: 1, partialSuccess: 0, success: 2, notRun: 1 } },
        1,
      ),
    );
    listIngestionPipelines.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mount(Harness);
    await flushPromises();
    await flushPromises();
    const stats = (wrapper.vm as unknown as { stats: IngestionPipelineStats }).stats;
    expect(stats.connectedServices).toBe(4);
    expect(stats.failedServices).toBe(1);
    expect(stats.healthyServices).toBe(2);
    expect(stats.pendingServices).toBe(1);
    expect(stats.warningServices).toBe(0);
    expect(stats.failingServices.map((row) => row.id)).toEqual(['a']);
    expect(getServicesOverview).toHaveBeenCalledTimes(1);
  });

  it('does not fetch the partial page when the failed page is full', async () => {
    const failed = Array.from({ length: 10 }, (_, index) => serviceSummary(`f${index}`, 'failed'));
    getServicesOverview.mockResolvedValueOnce(
      overviewResponse(failed, { databaseService: { failed: 10, partialSuccess: 2, success: 0, notRun: 0 } }, 12),
    );
    listIngestionPipelines.mockResolvedValue({ data: [], paging: { total: 0 } });
    const wrapper = mount(Harness);
    await flushPromises();
    await flushPromises();
    const stats = (wrapper.vm as unknown as { stats: IngestionPipelineStats }).stats;
    expect(stats.failingServices).toHaveLength(10);
    expect(getServicesOverview).toHaveBeenCalledTimes(1);
  });

  it('cleanReason collapses whitespace, strips the bracket prefix, drops generic failures, truncates', () => {
    expect(cleanReason('[a.b.C: boom]:  real   error ')).toBe('real error');
    expect(cleanReason('Workflow failed: something went wrong')).toBe('');
    expect(cleanReason('')).toBe('');
    expect(cleanReason('x'.repeat(200))).toBe(`${'x'.repeat(90)}…`);
  });
});
