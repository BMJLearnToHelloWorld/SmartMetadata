/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Socket channel consumption (per 02 §1.5/§2/§3 + t364 Q-06–Q-10).
 *
 * `useSocketChannel` subscribes one stable handler to one channel on
 * the shared socket: it (re)subscribes when the socket instance is
 * replaced, unsubscribes per-handler on instance change and on
 * unmount, and never touches connection lifecycle. Reconnects reuse
 * the same instance, so no re-subscription happens on reconnect.
 *
 * Event payloads arrive as JSON strings (WebSocketManager sends
 * strings). Empty, non-string, unparseable, or non-object payloads
 * are discarded with a non-sensitive diagnostic (channel + reason
 * only, never the payload) — Q-06.
 *
 * The pure helpers below implement the audit jobId match (§1.5.3/
 * §2.2), the WS/poll completion-consumed guard (§2.5, Q-08), and the
 * four-channel app-run merge (§3.2–§3.3, Q-09/Q-10). They carry no
 * socket dependency and are unit-testable in isolation.
 */
import type { Socket } from 'socket.io-client';
import { onBeforeUnmount, watch } from 'vue';
import { useSocketStore } from '@/stores/socket';

/** Channel names, verbatim from official SOCKET_EVENTS (constants.ts:351-368). */
export const SOCKET_CHANNELS = {
  CSV_EXPORT: 'csvExportChannel',
  SEARCH_INDEX_JOB: 'searchIndexJobStatus',
  RDF_INDEX_JOB: 'rdfIndexJobStatus',
  DATA_INSIGHTS_JOB: 'dataInsightsJobStatus',
  CACHE_WARMUP_JOB: 'cacheWarmupJobStatus',
  /** Pin SOCKET_EVENTS.BULK_ASSETS_CHANNEL (constants.ts:367): column bulk-update progress. */
  BULK_ASSETS: 'bulkAssetsChannel',
} as const;

export type SocketChannel = (typeof SOCKET_CHANNELS)[keyof typeof SOCKET_CHANNELS];

/** Official CSVExportWebsocketResponse (EntityExportModalProvider.interface.ts:18-26). */
export interface CsvExportSocketMessage {
  jobId: string;
  status: 'CANCELLED' | 'COMPLETED' | 'FAILED' | 'IN_PROGRESS';
  data: string | null;
  error: string | null;
  progress?: number;
  total?: number;
  message?: string;
}

function warnDiscarded(channel: string, reason: string): void {
  console.warn(`[socket] discarded event on ${channel}: ${reason}`);
}

/**
 * Parse one raw socket payload. Returns the parsed object, or null
 * when the event must be discarded (empty / non-string / unparseable /
 * non-object). Never throws, never logs the payload.
 */
export function parseSocketPayload(data: unknown, channel: string): Record<string, unknown> | null {
  if (!data) {
    return null;
  }
  if (typeof data !== 'string') {
    warnDiscarded(channel, 'non-string payload');
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    warnDiscarded(channel, 'unparseable JSON');
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warnDiscarded(channel, 'non-object payload');
    return null;
  }
  return parsed as Record<string, unknown>;
}

export function useSocketChannel(
  channel: SocketChannel,
  handler: (payload: Record<string, unknown>) => void,
): void {
  const socketStore = useSocketStore();

  // One stable wrapper per setup: subscribe and unsubscribe must use
  // the same function reference (02 §1.5.5, §3.4).
  const wrappedHandler = (data: unknown): void => {
    const payload = parseSocketPayload(data, channel);
    if (payload !== null) {
      handler(payload);
    }
  };

  const subscribe = (socket: Socket | null): void => {
    socket?.on(channel, wrappedHandler);
  };
  const unsubscribe = (socket: Socket | null): void => {
    socket?.off(channel, wrappedHandler);
  };

  watch(
    () => socketStore.socket,
    (next, prev) => {
      if (prev) {
        unsubscribe(prev);
      }
      subscribe(next);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    unsubscribe(socketStore.socket);
  });
}

/**
 * Explicit jobId equality for the audit channel (02 §1.5.3, Q-07 —
 * stricter than official's implicit single-job matching). No current
 * job id means no match.
 */
export function isMatchingExportJob(
  message: { jobId?: unknown },
  currentJobId: string | null | undefined,
): boolean {
  return (
    currentJobId !== null &&
    currentJobId !== undefined &&
    currentJobId !== '' &&
    message.jobId === currentJobId
  );
}

/**
 * Completion-consumed guard (02 §2.5, Q-08): bound to the single
 * current job. `consume` returns true only for the first completion
 * observed for a jobId and must be called synchronously before
 * starting the result fetch (or the legacy inline download), so a WS
 * event and a poll tick racing on the same completion download once.
 * `reset` runs when a new export starts.
 */
export function createCompletionConsumedGuard(): {
  consume: (jobId: string) => boolean;
  reset: () => void;
} {
  let consumedJobId: string | null = null;
  return {
    consume(jobId: string): boolean {
      if (consumedJobId === jobId) {
        return false;
      }
      consumedJobId = jobId;
      return true;
    },
    reset(): void {
      consumedJobId = null;
    },
  };
}

/**
 * App-run merge (02 §3.2, official AppRunsHistory.component.tsx:438-455
 * verbatim): match on strict appId + startTime equality, overlay the
 * update's fields, keep the existing row `id`. Unknown runs are never
 * appended; records missing a key field match nothing. Later events
 * overwrite earlier ones — no timestamp ordering guard (Q-09).
 */
export function mergeAppRunRecord<T extends Record<string, unknown>>(
  list: T[],
  updated: Record<string, unknown>,
): T[] {
  const appId = updated.appId;
  const startTime = updated.startTime;
  if (appId === undefined || appId === null || startTime === undefined || startTime === null) {
    return list;
  }
  return list.map((item) =>
    item.appId === appId && item.startTime === startTime
      ? { ...item, ...updated, id: item.id }
      : item,
  );
}
