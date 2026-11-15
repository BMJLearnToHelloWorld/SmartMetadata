/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ApiError } from '@/api/client';

/**
 * Delete choice (pin `DeleteType`, DeleteWidget.interface.ts): soft
 * delete deactivates the entity and it can be restored; hard delete
 * removes it permanently.
 */
export type DeleteType = 'soft-delete' | 'hard-delete';

/**
 * Delete options for a service (pin `deleteAsyncEntity` params, rest/
 * miscAPI.ts). `recursive` defaults to true at every service call site:
 * the pin passes `isRecursiveDelete` (= true) from both service detail
 * surfaces, and a forgotten argument must fail safe towards the
 * recursive delete, not towards an `entityIsNotEmpty` rejection (the
 * same fail-safe default the metrics async delete carries).
 */
export interface ServiceDeleteOptions {
  hardDelete?: boolean;
  recursive?: boolean;
}

/**
 * Async-delete job record (pin `AsyncDeleteJob`,
 * interface/entity/asyncDelete.interface.ts): `message`, `hardDelete`,
 * and `recursive` are required and `status` is the websocket
 * `'COMPLETED' | 'FAILED'` union when present; only the websocket
 * fields are optional. The server's job message is toasted when the
 * job is created; completion is observed through the bounded re-read,
 * since the product has no websocket client (D-F5,
 * ADR:2026-11-16-dc14-followup-ui). The call site still guards for an
 * undefined job: `apiRequest` returns undefined on an empty body.
 */
export interface AsyncDeleteJob {
  message: string;
  hardDelete: boolean;
  recursive: boolean;
  jobId?: string;
  status?: 'COMPLETED' | 'FAILED';
  entityName?: string;
  error?: string | null;
}

export interface WaitForServiceDeleteOptions {
  /** Poll interval; the pin's websocket pushes are instant, the product polls. */
  intervalMs?: number;
  /** Total budget; on expiry the caller applies its landing rule anyway. */
  timeoutMs?: number;
}

const BOUNDED_REREAD_INTERVAL_MS = 2000;
const BOUNDED_REREAD_TIMEOUT_MS = 30000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Bounded re-read after an async service delete, mirroring the metrics
 * precedent (`waitForMetricsGone`): a soft delete is confirmed when a
 * GET with include=all returns the service with `deleted: true`; a hard
 * delete is confirmed when the GET 404s. A non-404 failure is "not
 * confirmed yet" — a transient read failure must not report a delete
 * as finished. Resolves false on timeout; the caller still applies
 * the D-F6 landing rule and warns that the delete may not have
 * finished. The pin observes completion over the websocket instead;
 * this re-read is the fork adaptation (D-F5).
 */
export async function waitForServiceDelete(
  hardDelete: boolean,
  fetchService: () => Promise<{ deleted?: boolean } | null>,
  options: WaitForServiceDeleteOptions = {},
): Promise<boolean> {
  const intervalMs = options.intervalMs ?? BOUNDED_REREAD_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? BOUNDED_REREAD_TIMEOUT_MS;
  const startedAt = Date.now();
  for (;;) {
    let confirmed = false;
    try {
      const service = await fetchService();
      confirmed = !hardDelete && service?.deleted === true;
    } catch (error) {
      confirmed = hardDelete && error instanceof ApiError && error.status === 404;
    }
    if (confirmed) {
      return true;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return false;
    }
    await sleep(intervalMs);
  }
}
