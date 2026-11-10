/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, type Ref } from 'vue';
import { listCatalogPipelineStatuses } from '@/api/catalogPipelines';
import { listPipelineSummaries, type PipelineLastRunStatus, type PipelineSummary } from '@/api/pipelines';
import { useWidgetLoad } from '@/features/home/widgetLoad';
import type { Paged } from '@/types/admin';

/**
 * Pipelines with their latest run, bucketed by that run's status — a port
 * of official `hooks/usePipelineStatus.ts` onto `useWidgetLoad`.
 * ADR:2026-11-08-my-data-pipeline-status
 */
export const PIPELINE_STATUS_PAGE_SIZE = 10;
export const PIPELINE_RUN_HISTORY_SIZE = 10;
const PIPELINE_RUN_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ALL_PIPELINES = 'all';

/**
 * The buckets the card offers, most urgent first: that order is also how
 * the "All" view ranks its rows. `Running` has no chip — a run in flight
 * is not yet news — but those pipelines still show under All.
 */
export const PIPELINE_STATUS_BUCKETS = [
  'Failed',
  'Skipped',
  'Pending',
  'Successful',
] as const;

export type PipelineStatusBucket =
  | typeof ALL_PIPELINES
  | (typeof PIPELINE_STATUS_BUCKETS)[number];

interface BucketPage {
  rows: PipelineSummary[];
  total: number;
}

export type PipelineStatusPages = Record<PipelineStatusBucket, BucketPage>;

const EMPTY_PAGE: BucketPage = { rows: [], total: 0 };

function toPage(response: Paged<PipelineSummary>): BucketPage {
  return {
    rows: response.data ?? [],
    total: response.paging?.total ?? response.data?.length ?? 0,
  };
}

async function fetchPipelineStatusPages(): Promise<PipelineStatusPages> {
  const [all, ...byStatus] = await Promise.all([
    listPipelineSummaries({ limit: PIPELINE_STATUS_PAGE_SIZE }),
    ...PIPELINE_STATUS_BUCKETS.map((status) =>
      listPipelineSummaries({ limit: PIPELINE_STATUS_PAGE_SIZE, status: status as PipelineLastRunStatus }),
    ),
  ]);
  const pages = PIPELINE_STATUS_BUCKETS.reduce(
    (acc, status, index) => ({ ...acc, [status]: toPage(byStatus[index]) }),
    { [ALL_PIPELINES]: toPage(all) } as PipelineStatusPages,
  );
  return pages;
}

/**
 * "All": every bucket in urgency order, then the name-ordered page to fill
 * in pipelines that are running or have never run. Deduplicated by
 * pipelineId, capped at one page.
 */
export function rankAllPipelines(pages: PipelineStatusPages): PipelineSummary[] {
  const seen = new Set<string>();
  return [
    ...PIPELINE_STATUS_BUCKETS.flatMap((status) => pages[status].rows),
    ...pages[ALL_PIPELINES].rows,
  ]
    .filter((row) => {
      const isNew = !seen.has(row.pipelineId);
      seen.add(row.pipelineId);
      return isNew;
    })
    .slice(0, PIPELINE_STATUS_PAGE_SIZE);
}

export function derivePipelineStatus(
  pages: PipelineStatusPages | undefined,
): Pick<PipelineStatusOverview, 'counts' | 'rows'> {
  const bucketPage = (bucket: PipelineStatusBucket): BucketPage => pages?.[bucket] ?? EMPTY_PAGE;
  const buckets: PipelineStatusBucket[] = [ALL_PIPELINES, ...PIPELINE_STATUS_BUCKETS];
  const counts = Object.fromEntries(
    buckets.map((bucket) => [bucket, bucketPage(bucket).total]),
  ) as Record<PipelineStatusBucket, number>;
  const rows = Object.fromEntries(
    buckets.map((bucket) => [
      bucket,
      bucket === ALL_PIPELINES && pages ? rankAllPipelines(pages) : bucketPage(bucket).rows,
    ]),
  ) as Record<PipelineStatusBucket, PipelineSummary[]>;
  return { counts, rows };
}

export interface PipelineStatusOverview {
  /** Rows per bucket; `all` ranks failures first rather than by name. */
  rows: Ref<Record<PipelineStatusBucket, PipelineSummary[]>>;
  /** Server totals per bucket, not counts over the rows in hand. */
  counts: Ref<Record<PipelineStatusBucket, number>>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

export function usePipelineStatus(): PipelineStatusOverview {
  const loaded = useWidgetLoad('pipeline-status', fetchPipelineStatusPages, {
    ttlMs: 5 * 60 * 1000,
  });
  const derived = computed(() => derivePipelineStatus(loaded.data.value));
  const rows = computed(() => derived.value.rows);
  const counts = computed(() => derived.value.counts);
  return { counts, isError: loaded.isError, isLoading: loaded.isLoading, refetch: loaded.refetch, rows };
}

/**
 * Recent runs for the pipelines on screen, oldest first, keyed by FQN.
 * One request per visible row — the card lists at most a page, and a row
 * whose history fails simply draws an empty strip rather than failing
 * the card.
 */
export interface PipelineRunDot {
  timestamp: number;
  executionStatus: string;
  /** Failure detail of this run, when the server reported one. */
  errorMessage?: string;
}

export function usePipelineRunHistory(fqns: Ref<string[]>) {
  const runsByFqn: Ref<Record<string, PipelineRunDot[]>> = ref({});
  const loadingByFqn: Ref<Record<string, boolean>> = ref({});

  async function loadHistory(nextFqns: string[]): Promise<void> {
    const endTs = Date.now();
    const startTs = endTs - PIPELINE_RUN_WINDOW_DAYS * DAY_MS;
    await Promise.all(
      nextFqns.map(async (fqn) => {
        loadingByFqn.value = { ...loadingByFqn.value, [fqn]: true };
        try {
          const page = await listCatalogPipelineStatuses(fqn, {
            endTs,
            limit: PIPELINE_RUN_HISTORY_SIZE,
            startTs,
          });
          // The endpoint answers newest first; the strip reads left to
          // right in time.
          runsByFqn.value = {
            ...runsByFqn.value,
            [fqn]: [...(page.data ?? [])]
              .reverse()
              .map((run) => ({
                errorMessage: run.error?.errorMessage,
                executionStatus: run.executionStatus,
                timestamp: run.timestamp,
              })),
          };
        } catch {
          // A failed history draws an empty strip, never fails the card.
          runsByFqn.value = { ...runsByFqn.value, [fqn]: [] };
        } finally {
          loadingByFqn.value = { ...loadingByFqn.value, [fqn]: false };
        }
      }),
    );
  }

  return { loadHistory, loadingByFqn, runsByFqn };
}
