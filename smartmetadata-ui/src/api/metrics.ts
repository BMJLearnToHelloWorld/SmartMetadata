/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { apiRequest } from './client';

/**
 * Official deleteMetricAsync (rest/metricsAPI.ts): metric deletion is async —
 * DELETE /metrics/async/{id} starts a job; there is no synchronous delete
 * surface. The product has no metric-job tracking surface, so callers must
 * present this as "async delete submitted", never as "deleted".
 */
export function deleteMetricAsync(id: string): Promise<unknown> {
  return apiRequest(`/v1/metrics/async/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
