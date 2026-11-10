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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { resetWidgetLoadCache } from '@/features/home/widgetLoad';
import type { PipelineLastRunStatus } from '@/api/pipelines';
import {
  derivePipelineStatus,
  rankAllPipelines,
  usePipelineStatus,
  type PipelineStatusOverview,
  type PipelineStatusPages,
} from './usePipelineStatus';

const listPipelineSummaries = vi.fn();
vi.mock('@/api/pipelines', () => ({
  listPipelineSummaries: (...args: unknown[]) => listPipelineSummaries(...args),
}));

function summary(id: string, status?: PipelineLastRunStatus) {
  return {
    pipelineId: id,
    pipelineFqn: `svc.${id}`,
    pipelineName: id,
    lastRunStatus: status,
  };
}

function pages(overrides: Partial<PipelineStatusPages> = {}): PipelineStatusPages {
  return {
    all: { rows: [], total: 0 },
    Failed: { rows: [], total: 0 },
    Skipped: { rows: [], total: 0 },
    Pending: { rows: [], total: 0 },
    Successful: { rows: [], total: 0 },
    ...overrides,
  };
}

describe('rankAllPipelines', () => {
  it('ranks failures first, dedupes by pipelineId, caps at one page', () => {
    const ranked = rankAllPipelines(
      pages({
        all: {
          rows: [summary('a', 'Running'), summary('b', 'Successful')],
          total: 2,
        },
        Failed: { rows: [summary('f', 'Failed')], total: 1 },
        Successful: { rows: [summary('b', 'Successful')], total: 1 },
      }),
    );
    // Bucket pages in urgency order, then the unfiltered page: the
    // Successful-bucket row 'b' precedes the unfiltered page's 'a'.
    expect(ranked.map((row) => row.pipelineId)).toEqual(['f', 'b', 'a']);
  });
});

describe('derivePipelineStatus', () => {
  it('takes chip counts from server totals and rows from the bucket pages', () => {
    const derived = derivePipelineStatus(
      pages({
        all: { rows: [summary('a')], total: 5 },
        Failed: { rows: [summary('f', 'Failed')], total: 1 },
      }),
    );
    expect(derived.counts).toEqual({ all: 5, Failed: 1, Skipped: 0, Pending: 0, Successful: 0 });
    expect(derived.rows.Failed.map((row) => row.pipelineId)).toEqual(['f']);
    expect(derived.rows.all.map((row) => row.pipelineId)).toEqual(['f', 'a']);
  });

  it('derives empty pages when there is no data', () => {
    expect(derivePipelineStatus(undefined).counts.all).toBe(0);
  });
});

let exposed: PipelineStatusOverview | undefined;
const Harness = defineComponent({
  setup() {
    exposed = usePipelineStatus();
    return () => h('div', { 'data-testid': 'harness' });
  },
});

describe('usePipelineStatus', () => {
  beforeEach(() => {
    resetWidgetLoadCache();
    vi.clearAllMocks();
    exposed = undefined;
  });

  it('fetches five pages in parallel: unfiltered plus one per status', async () => {
    listPipelineSummaries.mockResolvedValue({ data: [], paging: { total: 0 } });
    mount(Harness);
    await flushPromises();
    expect(listPipelineSummaries).toHaveBeenCalledTimes(5);
    expect(listPipelineSummaries).toHaveBeenNthCalledWith(1, { limit: 10 });
    expect(listPipelineSummaries).toHaveBeenNthCalledWith(2, { limit: 10, status: 'Failed' });
    expect(listPipelineSummaries).toHaveBeenNthCalledWith(3, { limit: 10, status: 'Skipped' });
    expect(listPipelineSummaries).toHaveBeenNthCalledWith(4, { limit: 10, status: 'Pending' });
    expect(listPipelineSummaries).toHaveBeenNthCalledWith(5, { limit: 10, status: 'Successful' });
    expect(exposed?.isError.value).toBe(false);
  });

  it('reports an error when the fetch fails', async () => {
    listPipelineSummaries.mockRejectedValue(new Error('boom'));
    mount(Harness);
    await flushPromises();
    expect(exposed?.isError.value).toBe(true);
  });
});
