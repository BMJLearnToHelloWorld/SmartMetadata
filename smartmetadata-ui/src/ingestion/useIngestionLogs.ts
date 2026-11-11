/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import { authorizationHeader, loadSession } from '@/auth/token';
import { apiBaseUrl } from '@/api/client';
import {
  downloadIngestionPipelineLogs,
  getIngestionPipelineLogs,
} from '@/api/ingestionPipelines';
import type { IngestionPipelineLog } from '@/types/ingestion';

/**
 * Vue port of official useEntityLogs + useIngestionLogSource +
 * usePaginatedLiveLog + useLogStream (openmetadata-ui, pin a3012259ca):
 * one ingestion run's log from whichever source fits its state — the
 * SSE tail while the run is live, the paginated REST endpoint for the
 * backlog and for finished runs. The two never run at once. The
 * hand-over happens on the live -> terminal edge, where the paginated
 * reader does the single authoritative refetch of the finished run. A
 * stream that gives up for any reason other than the run finishing
 * hands the still-running job back to the paginated + polling path
 * rather than freezing the viewer.
 *
 * The server's stream contract (IngestionPipelineResource
 * streamPipelineLogs + logStreamEvent.json): each SSE frame is one JSON
 * LogStreamEvent — eventType logs|complete|error, `logs` appended since
 * the previous event, `after` the resume cursor, `truncated` when the
 * backlog could not be replayed, `reason` runFinished|idleTimeout|
 * maxDuration|maxBytes on `complete`. Native EventSource cannot send
 * the Authorization header the JWT filter requires, so the tail is a
 * fetch + ReadableStream reader (the same reason official uses
 * @microsoft/fetch-event-source), with the cursor resumed on reconnect.
 */

export type LogStreamHealth = 'connecting' | 'healthy' | 'degraded' | 'failed';

export interface UseIngestionLogsOptions {
  /** Whether the viewer is open; fetching and streaming stop when false. */
  enabled: Ref<boolean> | (() => boolean);
  /** Pipeline id or fullyQualifiedName — the endpoint accepts either. */
  fqn: Ref<string> | (() => string);
  pipelineType?: Ref<string | undefined> | (() => string | undefined);
  /** Run the log belongs to; without one there is nothing to stream. */
  runId?: Ref<string | undefined> | (() => string | undefined);
  /** The run's own state says it is still producing output. */
  runActive: Ref<boolean> | (() => boolean);
  /** Title used for the downloaded file name. */
  title?: Ref<string> | (() => string);
}

export interface UseIngestionLogsResult {
  logs: Ref<string>;
  loading: Ref<boolean>;
  loadingMore: Ref<boolean>;
  hasMore: Ref<boolean>;
  totalLines: Ref<number>;
  downloading: Ref<boolean>;
  isLive: Ref<boolean>;
  isStreaming: Ref<boolean>;
  streamHealth: Ref<LogStreamHealth>;
  streamTruncated: Ref<boolean>;
  streamError: Ref<string | null>;
  /** REST fetch failure (no run 404, empty log 400, client disabled 200-string, log-backend 503): an error state, never an empty page. */
  error: Ref<string | null>;
  loadMore: () => void;
  download: () => void;
  stop: () => void;
}

const PIPELINE_LOG_FIELD: Record<string, keyof IngestionPipelineLog> = {
  metadata: 'ingestion_task',
  application: 'application_task',
  profiler: 'profiler_task',
  usage: 'usage_task',
  lineage: 'lineage_task',
  dbt: 'dbt_task',
  TestSuite: 'test_suite_task',
  dataInsight: 'data_insight_task',
  elasticSearchReindex: 'elasticsearch_reindex_task',
  autoClassification: 'auto_classification_task',
};

/** Official LogsUtils.getLogsFromResponse: prefer the generic `logs` key, fall back to the type-specific task field. */
export function getLogsFromResponse(res: IngestionPipelineLog, pipelineType?: string): string {
  if (res.logs) {
    return res.logs;
  }
  const field = pipelineType ? PIPELINE_LOG_FIELD[pipelineType] : undefined;
  // The index also covers the numeric `total` field; only string task
  // fields carry log text.
  const value = field ? res[field] : undefined;
  return typeof value === 'string' ? value : '';
}

/** Backends disagree on the final page: no `after`, or `after === total`. Either is the tail. */
function isTailPage(page: IngestionPipelineLog): boolean {
  return !page.after || (page.total !== undefined && Number(page.after) >= Number(page.total));
}

/** Read a ref/getter option. Required options resolve to T; optional ones to T | undefined. */
function read<T>(input: Ref<T> | (() => T)): T;
function read<T>(input: Ref<T> | (() => T) | undefined): T | undefined;
function read<T>(input: Ref<T> | (() => T) | undefined): T | undefined {
  if (input === undefined) {
    return undefined;
  }
  return typeof input === 'function' ? (input as () => T)() : input.value;
}

const TAIL_POLL_MS = 5000;
const MAX_STREAM_ATTEMPTS = 5;

function backoffDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30000);
}

interface LogStreamEvent {
  eventType?: 'logs' | 'complete' | 'error';
  runId?: string;
  logs?: string;
  after?: string;
  replay?: boolean;
  truncated?: boolean;
  reason?: 'runFinished' | 'idleTimeout' | 'maxDuration' | 'maxBytes';
  message?: string;
}

export function useIngestionLogs(options: UseIngestionLogsOptions): UseIngestionLogsResult {
  const logs = ref('');
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);
  const downloading = ref(false);
  const isLive = ref(false);
  const isStreaming = ref(false);
  const streamHealth = ref<LogStreamHealth>('connecting');
  const streamTruncated = ref(false);
  const streamError = ref<string | null>(null);
  const error = ref<string | null>(null);
  const totalLines = computed(() => (logs.value ? logs.value.split('\n').length : 0));

  // Paginated reader state: committed pages plus a growing tail page.
  const committed = ref('');
  const tail = ref('');
  const nextCursor = ref<string | undefined>(undefined);
  const tailCursor = ref<string | undefined>(undefined);
  const reachedTail = ref(false);
  const paginatedLogs = ref('');
  const paginatedLoading = ref(false);
  const paginatedLoadingMore = ref(false);
  const paginatedHasMore = ref(false);

  // Stream state.
  const streamLogs = ref('');
  const streamDone = ref(false);
  const runFinishedOnStream = ref(false);
  const streamGaveUp = ref(false);

  let abortController: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let busy = false;

  function clearTimers(): void {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function stop(): void {
    stopped = true;
    clearTimers();
    abortController?.abort();
    abortController = null;
  }

  function syncDisplayedLogs(): void {
    // Keep showing what the stream delivered until the paginated refetch
    // that follows the run's end has content of its own, so the viewer
    // never blanks on the hand-over.
    const showStreamLogs = Boolean(streamLogs.value) && (isStreaming.value || !paginatedLogs.value);
    logs.value = showStreamLogs ? streamLogs.value : paginatedLogs.value;
    loading.value = showStreamLogs ? false : paginatedLoading.value;
    loadingMore.value = paginatedLoadingMore.value;
    hasMore.value = showStreamLogs ? false : paginatedHasMore.value;
  }

  async function fetchPage(cursor?: string): Promise<IngestionPipelineLog> {
    const fqn = read(options.fqn);
    const res = await getIngestionPipelineLogs(fqn, cursor);
    return res;
  }

  function applyPage(page: IngestionPipelineLog, isInitial: boolean): void {
    const content = getLogsFromResponse(page, read(options.pipelineType));
    if (isInitial) {
      committed.value = '';
      tail.value = content;
      tailCursor.value = undefined;
      nextCursor.value = page.after;
      reachedTail.value = isTailPage(page);
    } else if (reachedTail.value) {
      // Tail poll: replace the growing tail page, never duplicate it.
      tail.value = content;
      nextCursor.value = page.after;
      reachedTail.value = isTailPage(page);
    } else {
      committed.value += tail.value;
      tail.value = content;
      tailCursor.value = nextCursor.value;
      nextCursor.value = page.after;
      reachedTail.value = isTailPage(page);
    }
    paginatedLogs.value = committed.value + tail.value;
    paginatedHasMore.value = !reachedTail.value && nextCursor.value !== undefined;
    syncDisplayedLogs();
  }

  async function loadInitialPaginated(): Promise<void> {
    if (busy) {
      return;
    }
    busy = true;
    paginatedLoading.value = true;
    error.value = null;
    syncDisplayedLogs();
    try {
      const page = await fetchPage();
      applyPage(page, true);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      paginatedLoading.value = false;
      busy = false;
      syncDisplayedLogs();
      scheduleTailPoll();
    }
  }

  async function loadMore(): Promise<void> {
    if (busy || !paginatedHasMore.value || isStreaming.value) {
      return;
    }
    busy = true;
    paginatedLoadingMore.value = true;
    syncDisplayedLogs();
    try {
      const page = await fetchPage(nextCursor.value);
      applyPage(page, false);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      paginatedLoadingMore.value = false;
      busy = false;
      syncDisplayedLogs();
    }
  }

  function scheduleTailPoll(): void {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (stopped || !read(options.enabled) || !isLive.value || isStreaming.value) {
      return;
    }
    pollTimer = setTimeout(() => {
      void (async () => {
        if (busy || stopped) {
          scheduleTailPoll();
          return;
        }
        busy = true;
        try {
          // Poll only the tail page and replace it.
          const page = await fetchPage(tailCursor.value);
          applyPage(page, false);
        } catch (err) {
          error.value = err instanceof Error ? err.message : String(err);
        } finally {
          busy = false;
          scheduleTailPoll();
        }
      })();
    }, TAIL_POLL_MS);
  }

  function streamUrl(after?: string): string {
    const fqn = read(options.fqn);
    const runId = read(options.runId) ?? '';
    const base = `${apiBaseUrl()}/v1/services/ingestionPipelines/logs/${encodeURIComponent(fqn)}/stream/${encodeURIComponent(runId)}`;
    return after ? `${base}?after=${encodeURIComponent(after)}` : base;
  }

  function handleStreamEvent(event: LogStreamEvent, cursor: { after?: string }): 'done' | 'resumable' | 'continue' {
    if (event.after) {
      cursor.after = event.after;
    }
    if (event.truncated) {
      streamTruncated.value = true;
    }
    if (event.eventType === 'logs') {
      streamLogs.value += event.logs ?? '';
      streamHealth.value = 'healthy';
      syncDisplayedLogs();
      return 'continue';
    }
    if (event.eventType === 'error') {
      streamError.value = event.message ?? 'Log stream failed';
      return 'done';
    }
    if (event.eventType === 'complete') {
      if (event.reason === 'runFinished') {
        runFinishedOnStream.value = true;
        return 'done';
      }
      if (event.reason === 'maxBytes') {
        return 'done';
      }
      // idleTimeout / maxDuration: the server shed load, the run lives on —
      // reconnect from the cursor.
      return 'resumable';
    }
    return 'continue';
  }

  function parseSseBuffer(buffer: string): { events: LogStreamEvent[]; rest: string } {
    const events: LogStreamEvent[] = [];
    let rest = buffer;
    let boundary = rest.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = rest.slice(0, boundary);
      rest = rest.slice(boundary + 2);
      const dataLines = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim());
      if (dataLines.length > 0) {
        try {
          events.push(JSON.parse(dataLines.join('\n')) as LogStreamEvent);
        } catch {
          // A malformed frame is skipped, never fatal to the tail.
        }
      }
      boundary = rest.indexOf('\n\n');
    }
    return { events, rest };
  }

  async function runStream(): Promise<void> {
    const cursor: { after?: string } = {};
    let attempt = 0;
    streamDone.value = false;
    runFinishedOnStream.value = false;
    streamGaveUp.value = false;
    isStreaming.value = true;
    streamHealth.value = 'connecting';
    syncDisplayedLogs();

    while (!stopped && read(options.enabled) && !streamDone.value && attempt < MAX_STREAM_ATTEMPTS) {
      const controller = new AbortController();
      abortController = controller;
      try {
        const session = loadSession(window.localStorage);
        const response = await fetch(streamUrl(cursor.after), {
          headers: {
            Accept: 'text/event-stream',
            ...(session ? { Authorization: authorizationHeader(session.accessToken) } : {}),
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Log stream failed (${response.status})`);
        }
        streamHealth.value = 'healthy';
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Log stream has no readable body');
        }
        const decoder = new TextDecoder();
        let buffer = '';
        let outcome: 'done' | 'resumable' | 'continue' = 'continue';
        while (outcome === 'continue') {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.rest;
          for (const event of parsed.events) {
            outcome = handleStreamEvent(event, cursor);
            if (outcome !== 'continue') {
              break;
            }
          }
        }
        try {
          reader.releaseLock();
        } catch {
          // Already closed; nothing to release.
        }
        if (outcome === 'done') {
          streamDone.value = true;
          break;
        }
        // Clean close or a resumable end reason: reconnect from the cursor.
        attempt += 1;
        streamHealth.value = 'degraded';
      } catch (err) {
        if (stopped || controller.signal.aborted) {
          return;
        }
        attempt += 1;
        streamHealth.value = 'degraded';
        streamError.value = err instanceof Error ? err.message : String(err);
      }
      if (streamDone.value || stopped || !read(options.enabled)) {
        break;
      }
      await new Promise<void>((resolve) => {
        reconnectTimer = setTimeout(resolve, backoffDelay(attempt));
      });
    }

    isStreaming.value = false;
    abortController = null;
    if (!runFinishedOnStream.value && !streamDone.value) {
      // The stream gave up without the run finishing: hand the
      // still-running job back to the paginated + polling path.
      streamGaveUp.value = true;
    }
    if (streamHealth.value === 'degraded' && !runFinishedOnStream.value) {
      streamHealth.value = streamGaveUp.value ? 'failed' : 'degraded';
    }
    syncDisplayedLogs();
    // The hand-over: once the stream says the run finished, the paginated
    // reader does the single authoritative refetch of the finished run.
    if (runFinishedOnStream.value) {
      isLive.value = false;
      await loadInitialPaginated();
      return;
    }
    if (!paginatedLogs.value) {
      await loadInitialPaginated();
      return;
    }
    scheduleTailPoll();
  }

  async function start(): Promise<void> {
    stopped = false;
    const fqn = read(options.fqn);
    if (!fqn) {
      return;
    }
    const active = read(options.runActive);
    const runId = read(options.runId);
    isLive.value = active && !runFinishedOnStream.value;
    error.value = null;
    streamError.value = null;
    if (active && runId) {
      await runStream();
    } else {
      await loadInitialPaginated();
    }
  }

  async function download(): Promise<void> {
    if (downloading.value) {
      return;
    }
    downloading.value = true;
    try {
      const blob = await downloadIngestionPipelineLogs(read(options.fqn));
      const title = read(options.title) || read(options.fqn);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${title}.log`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      downloading.value = false;
    }
  }

  watch(
    () => read(options.enabled),
    (enabled) => {
      if (enabled) {
        void start();
      } else {
        stop();
      }
    },
  );
  watch(
    () => [read(options.fqn), read(options.runId)] as [string, string | undefined],
    () => {
      if (read(options.enabled)) {
        stop();
        stopped = false;
        streamLogs.value = '';
        streamDone.value = false;
        runFinishedOnStream.value = false;
        streamGaveUp.value = false;
        streamError.value = null;
        streamTruncated.value = false;
        paginatedLogs.value = '';
        committed.value = '';
        tail.value = '';
        nextCursor.value = undefined;
        tailCursor.value = undefined;
        reachedTail.value = false;
        void start();
      }
    },
  );

  onUnmounted(stop);

  if (read(options.enabled)) {
    void start();
  }

  return {
    logs,
    loading,
    loadingMore,
    hasMore,
    totalLines,
    downloading,
    isLive,
    isStreaming,
    streamHealth,
    streamTruncated,
    streamError,
    error,
    loadMore: () => void loadMore(),
    download: () => void download(),
    stop,
  };
}
