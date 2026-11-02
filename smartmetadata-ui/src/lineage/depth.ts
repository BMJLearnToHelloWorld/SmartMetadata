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
 * Server settings form range (Stage 8, closing the Stage 3 residual).
 * Official LineageConfigPage validates only min 0 and trusts the server;
 * the product lineage fetch clamps to 0–3, so a settings value above 3
 * could never take effect. The settings form therefore accepts exactly
 * the effective range 0–3 and rejects out-of-range saves instead of
 * silently clamping them — the canvas modal keeps min 0 and fetch clamping.
 */
export const LINEAGE_SETTINGS_DEPTH = { min: LINEAGE_DEPTH_MIN, max: LINEAGE_DEPTH_MAX } as const;

export function isLineageSettingsDepthValid(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= LINEAGE_SETTINGS_DEPTH.min &&
    value <= LINEAGE_SETTINGS_DEPTH.max
  );
}

export function clampLineageDepth(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return LINEAGE_DEPTH_DEFAULT;
  }
  return Math.min(LINEAGE_DEPTH_MAX, Math.max(LINEAGE_DEPTH_MIN, Math.trunc(numeric)));
}
