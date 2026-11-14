/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { authorizationHeader, loadSession } from '@/auth/token';
import { apiBaseUrl, refreshStoredSession } from '@/api/client';
import { mapIngestionPipeline } from '@/api/ingestionPipelines';
import { asBoolean, asNumber, asRecord, asString } from '@/api/json';
import type {
  GlobalCounter,
  ProgressNode,
  ProgressUpdate,
  ProgressUpdateType,
  ServiceProgressEvent,
} from '@/types/ingestion';

/**
 * Service progress stream, ported from official
 * hooks/useServiceProgressStream.ts + utils/SseStreamUtils.ts
 * (openmetadata-ui, pin a3012259ca): one shared connection per
 * service URL, replayed snapshots on connect, exponential-backoff
 * reconnect, a fatal 503 (progress tracking not configured) and a
 * one-refresh 401 policy.
 *
 * Transport adaptation (ruling deviation, see IMPLEMENTATION.md):
 * the pin uses @microsoft/fetch-event-source, which the fork does
 * not depend on; the fork's established SSE transport is raw fetch
 * + ReadableStream reader + manual frame parsing (useIngestionLogs),
 * so the pin's stream structure is ported onto that transport
 * instead of adding a dependency. The Authorization header is sent
 * per attempt from the stored session — a native EventSource cannot
 * send one, which is why the pin uses a fetch-based client too.
 *
 * The connection registry below is lifecycle-managed, not a cache:
 * an entry lives only while at least one subscriber is attached and
 * is dropped when the last one leaves or when the read loop exits
 * for good, so it cannot grow with the catalog.
 */

export type StreamHealth = 'connecting' | 'live' | 'unavailable' | 'down';

export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;
export const MAX_ATTEMPTS_BEFORE_DOWN = 5;

/** Terminal stream failure: the stream stops for the session. */
export class FatalStreamError extends Error {
  readonly reason: 'unavailable' | 'down';

  constructor(reason: 'unavailable' | 'down') {
    super(`Progress stream ${reason}`);
    this.name = 'FatalStreamError';
    this.reason = reason;
  }
}

/** A failure worth retrying after the backoff delay. */
export class RetriableStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetriableStreamError';
  }
}

export function getBackoffDelay(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

export interface StreamRetryState {
  attempts: number;
  unauthorizedCount: number;
}

export function createStreamRetryState(): StreamRetryState {
  return { attempts: 0, unauthorizedCount: 0 };
}

export function nextRetryHealth(state: StreamRetryState): StreamHealth {
  return state.attempts >= MAX_ATTEMPTS_BEFORE_DOWN ? 'down' : 'connecting';
}

/**
 * Open-response policy (the pin's `createStreamOpenHandler`, as a
 * direct function): a 200 resets the retry budget; 503 is fatal
 * (progress tracking not configured); the first 401 refreshes the
 * stored session and retries, the second consecutive 401 is fatal;
 * anything else is retriable.
 */
export async function handleStreamOpen(
  response: Pick<Response, 'ok' | 'status'>,
  retryState: StreamRetryState,
): Promise<void> {
  if (response.ok) {
    retryState.attempts = 0;
    retryState.unauthorizedCount = 0;
    return;
  }
  if (response.status === 503) {
    throw new FatalStreamError('unavailable');
  }
  if (response.status === 401) {
    retryState.unauthorizedCount += 1;
    if (retryState.unauthorizedCount >= 2) {
      throw new FatalStreamError('down');
    }
    await refreshStoredSession();
    throw new RetriableStreamError('Unauthorized; session refreshed, retrying');
  }
  throw new RetriableStreamError(`Progress stream open failed (HTTP ${response.status})`);
}

/**
 * Split a buffered SSE byte stream into complete `data:` payloads.
 * Frames end at a blank line; comment lines carry no data and are
 * skipped. The trailing partial frame is returned as the remainder
 * for the next chunk.
 */
export function parseSseBuffer(buffer: string): { events: string[]; remainder: string } {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: string[] = [];
  for (const frame of frames) {
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
      }
    }
    if (dataLines.length > 0) {
      events.push(dataLines.join('\n'));
    }
  }
  return { events, remainder };
}

const PROGRESS_UPDATE_TYPES: readonly string[] = [
  'DISCOVERY',
  'PROCESSING',
  'STEP_COMPLETE',
  'PIPELINE_COMPLETE',
  'ERROR',
];

function mapProgressNode(value: unknown): ProgressNode | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  const children = Array.isArray(rec.children)
    ? rec.children.flatMap((child) => {
        const mapped = mapProgressNode(child);
        return mapped ? [mapped] : [];
      })
    : undefined;
  return {
    active: asBoolean(rec.active),
    children: children?.length ? children : undefined,
    entityType: asString(rec.entityType) || undefined,
    expected: asNumber(rec.expected),
    label: asString(rec.label) || undefined,
    overflow: asNumber(rec.overflow),
    processed: asNumber(rec.processed),
  };
}

function mapGlobalCounters(value: unknown): GlobalCounter[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const counters = value.flatMap((item) => {
    const rec = asRecord(item);
    return rec
      ? [
          {
            done: asNumber(rec.done),
            entityType: asString(rec.entityType) || undefined,
            total: asNumber(rec.total),
          },
        ]
      : [];
  });
  return counters.length > 0 ? counters : undefined;
}

/**
 * The wire type of estimatedSecondsRemaining is `number | null`, and the
 * pin's computeEta treats the two absences differently: a missing field
 * keeps the previous ETA, an explicit null clears it ("not yet
 * computable"). asNumber would collapse null to undefined and make the
 * clear unreachable through the live stream, so this field keeps its
 * explicit null.
 */
function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return asNumber(value);
}

function mapProgressUpdate(value: unknown): ProgressUpdate | null {
  const rec = asRecord(value);
  if (!rec) {
    return null;
  }
  const runId = asString(rec.runId);
  const timestamp = asNumber(rec.timestamp);
  const updateType = asString(rec.updateType);
  if (!runId || timestamp === undefined || !PROGRESS_UPDATE_TYPES.includes(updateType)) {
    return null;
  }
  return {
    currentEntity: asString(rec.currentEntity) || undefined,
    estimatedSecondsRemaining: asNullableNumber(rec.estimatedSecondsRemaining),
    globalCounters: mapGlobalCounters(rec.globalCounters),
    message: asString(rec.message) || undefined,
    progress: mapProgressNode(rec.progress),
    runId,
    stepName: asString(rec.stepName) || undefined,
    timestamp,
    totalAssetsIngested: asNumber(rec.totalAssetsIngested),
    updateType: updateType as ProgressUpdateType,
  };
}

/**
 * Parse one SSE `data:` payload into a ServiceProgressEvent. A
 * malformed frame is skipped, never fatal — the stream must survive
 * a bad frame exactly as the pin's client does.
 */
export function parseServiceProgressEvent(data: string): ServiceProgressEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return null;
  }
  const rec = asRecord(parsed);
  if (!rec) {
    return null;
  }
  const pipelineFqn = asString(rec.pipelineFqn);
  const runId = asString(rec.runId);
  const event = mapProgressUpdate(rec.event);
  if (!pipelineFqn || !runId || !event) {
    return null;
  }
  const pipelineRec = asRecord(rec.ingestionPipeline);
  const ingestionPipeline = pipelineRec ? mapIngestionPipeline(pipelineRec) : null;
  return {
    event,
    ingestionPipeline: ingestionPipeline ?? undefined,
    pipelineFqn,
    runId,
  };
}

export function getServiceProgressStreamUrl(entityType: string, serviceFqn: string): string {
  return `${apiBaseUrl()}/v1/services/ingestionPipelines/progress/service/${entityType}/${encodeURIComponent(serviceFqn)}/stream`;
}

export interface StreamSubscription {
  onEvent: (event: ServiceProgressEvent) => void;
  onHealth: (health: StreamHealth) => void;
}

interface ActiveStream {
  controller: AbortController;
  subscriptions: Set<StreamSubscription>;
  health: StreamHealth;
  retryState: StreamRetryState;
  stopped: boolean;
}

const activeStreams = new Map<string, ActiveStream>();

/**
 * Forgets a connection whose read loop has exited for good. Leaving it in
 * activeStreams would hand every future subscriber a permanently silent
 * stream; dropping it lets the next subscriber reconnect fresh. Guards
 * against deleting a replacement connection registered under the same URL.
 */
function dropTerminatedConnection(url: string, stream: ActiveStream): void {
  if (activeStreams.get(url) === stream) {
    activeStreams.delete(url);
  }
}

function broadcastHealth(stream: ActiveStream, health: StreamHealth): void {
  stream.health = health;
  for (const subscription of stream.subscriptions) {
    subscription.onHealth(health);
  }
}

function broadcastEvent(stream: ActiveStream, event: ServiceProgressEvent): void {
  for (const subscription of stream.subscriptions) {
    subscription.onEvent(event);
  }
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      window.clearTimeout(timer);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function openAndConsume(url: string, stream: ActiveStream): Promise<void> {
  const session = loadSession(window.localStorage);
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (session) {
    headers.Authorization = authorizationHeader(session.accessToken);
  }
  const response = await fetch(url, { headers, signal: stream.controller.signal });
  await handleStreamOpen(response, stream.retryState);
  broadcastHealth(stream, 'live');
  const reader = response.body?.getReader();
  if (!reader) {
    throw new RetriableStreamError('Progress stream has no body');
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseSseBuffer(buffer);
    buffer = remainder;
    for (const data of events) {
      const parsed = parseServiceProgressEvent(data);
      if (parsed) {
        broadcastEvent(stream, parsed);
      }
    }
  }
}

async function runStream(url: string, stream: ActiveStream): Promise<void> {
  while (!stream.stopped) {
    try {
      await openAndConsume(url, stream);
      // A clean close is a retriable failure: the server replays the
      // active-run snapshots on reconnect.
      throw new RetriableStreamError('Progress stream closed');
    } catch (error) {
      if (stream.stopped) {
        return;
      }
      if (error instanceof FatalStreamError) {
        broadcastHealth(stream, error.reason === 'unavailable' ? 'unavailable' : 'down');
        dropTerminatedConnection(url, stream);
        return;
      }
      stream.retryState.attempts += 1;
      const health = nextRetryHealth(stream.retryState);
      broadcastHealth(stream, health);
      if (health === 'down') {
        dropTerminatedConnection(url, stream);
        return;
      }
      await abortableSleep(getBackoffDelay(stream.retryState.attempts), stream.controller.signal);
    }
  }
}

/**
 * Subscribe to the shared connection for one service URL. The first
 * subscriber opens the connection; the last unsubscribe aborts it
 * and drops the registry entry. The current health is reported
 * immediately on subscribe.
 */
export function subscribeToStream(
  url: string,
  subscription: StreamSubscription,
): () => void {
  let stream = activeStreams.get(url);
  if (!stream) {
    stream = {
      controller: new AbortController(),
      subscriptions: new Set(),
      health: 'connecting',
      retryState: createStreamRetryState(),
      stopped: false,
    };
    activeStreams.set(url, stream);
    void runStream(url, stream);
  }
  stream.subscriptions.add(subscription);
  subscription.onHealth(stream.health);
  const owned = stream;
  return () => {
    owned.subscriptions.delete(subscription);
    if (owned.subscriptions.size === 0) {
      owned.stopped = true;
      owned.controller.abort();
      dropTerminatedConnection(url, owned);
    }
  };
}

/**
 * Subscribe the caller to one service's progress stream while the
 * component is mounted, resubscribing when the service changes.
 * With no service identity there is nothing to subscribe to and the
 * health stays `connecting`.
 */
export function useServiceProgressStream(
  entityType: MaybeRefOrGetter<string | undefined>,
  serviceFqn: MaybeRefOrGetter<string | undefined>,
  onEvent: (event: ServiceProgressEvent) => void,
): { streamHealth: Ref<StreamHealth> } {
  const streamHealth = ref<StreamHealth>('connecting');
  let unsubscribe: (() => void) | null = null;

  const stop = watch(
    [() => toValue(entityType), () => toValue(serviceFqn)],
    ([type, fqn]) => {
      unsubscribe?.();
      unsubscribe = null;
      if (!type || !fqn) {
        streamHealth.value = 'connecting';
        return;
      }
      unsubscribe = subscribeToStream(getServiceProgressStreamUrl(type, fqn), {
        onEvent,
        onHealth: (health) => {
          streamHealth.value = health;
        },
      });
    },
    { immediate: true },
  );

  onUnmounted(() => {
    stop();
    unsubscribe?.();
    unsubscribe = null;
  });

  return { streamHealth };
}
