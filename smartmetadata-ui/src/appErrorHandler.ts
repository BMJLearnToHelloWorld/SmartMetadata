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
 * Second net (N-4 companion to SmErrorBoundary): `app.config.errorHandler`
 * for errors the boundary never sees — render/lifecycle failures in
 * App.vue itself (above the boundary) plus errors in code paths with no
 * ancestor boundary. LimitBanner and CsvJobsTray render errors no longer
 * reach this handler: both sit inside the top-level boundary since the
 * B-14 §5 widening (tray errors are caught first by its local silent
 * boundary). The boundary's onErrorCaptured returns false, so an
 * error it handled never reaches this handler and is never recorded
 * twice; that no-double-record behavior is verified by experiment in
 * appErrorHandler.test.ts, not claimed from source.
 *
 * Recording discipline mirrors the boundary: a single console.error, no
 * telemetry, no storage, no stack capture.
 */
export function reportUncaughtAppError(error: unknown): void {
  console.error(error);
}
