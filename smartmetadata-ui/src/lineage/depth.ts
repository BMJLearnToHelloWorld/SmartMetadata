/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/** LineageResource GET upstreamDepth / downstreamDepth: min=0, max=3, default=1. */
export const LINEAGE_DEPTH_MIN = 0;
export const LINEAGE_DEPTH_MAX = 3;
export const LINEAGE_DEPTH_DEFAULT = 1;

export function clampLineageDepth(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return LINEAGE_DEPTH_DEFAULT;
  }
  return Math.min(LINEAGE_DEPTH_MAX, Math.max(LINEAGE_DEPTH_MIN, Math.trunc(numeric)));
}
