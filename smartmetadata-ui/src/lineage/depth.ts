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

/**
 * Session/store depth default: the official lineage store starts at 3/3
 * (hooks/useLineageStore.ts:153, pin a3012259ca), while the REST layer
 * defaults to 1 when no config is passed. The session default applies
 * to the canvas store and the config-modal field defaults only; the
 * fetch-param default above stays 1.
 */
export const LINEAGE_SESSION_DEPTH_DEFAULT = 3;

export function clampLineageDepth(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return LINEAGE_DEPTH_DEFAULT;
  }
  return Math.min(LINEAGE_DEPTH_MAX, Math.max(LINEAGE_DEPTH_MIN, Math.trunc(numeric)));
}
