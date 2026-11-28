/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official StatusBadge types and color/icon resolution
 * (StatusBadge.interface.ts, StatusBadge.constant.ts,
 * StatusBadge.component.tsx).
 */
export type StatusTypeValue =
  | 'success'
  | 'warning'
  | 'failure'
  | 'activeError'
  | 'running'
  | 'started'
  | 'stopped'
  | 'pending'
  | 'aborted'
  | 'inReview'
  | 'deprecated'
  | 'version'
  | 'acknowledged'
  | 'unprocessed'
  | 'archived';

/** Official STATUS_TYPE_TO_BADGE_COLOR (StatusBadge.constant.ts). */
export const STATUS_TYPE_TO_BADGE_COLOR: Record<StatusTypeValue, string> = {
  success: 'success',
  warning: 'warning',
  pending: 'warning',
  failure: 'error',
  stopped: 'error',
  activeError: 'error',
  aborted: 'orange',
  running: 'brand',
  acknowledged: 'blue',
  started: 'purple',
  inReview: 'purple',
  version: 'purple',
  deprecated: 'gray',
  archived: 'gray',
  unprocessed: 'gray',
};

/**
 * Official StatusBadge icon lookup keys from the `icons` map
 * (StatusBadge.constant.ts) that this port resolves. The icon is
 * resolved from the LABEL, exact match first, then lowercased.
 */
const STATUS_BADGE_ICON_KEYS: ReadonlySet<string> = new Set([
  'active',
  'completed',
  'failed',
  'running',
  'started',
  'stopped',
  'success',
  'pending',
  'activeError',
  'aborted',
]);

export function statusBadgeIconKey(label: string): string | undefined {
  if (STATUS_BADGE_ICON_KEYS.has(label)) {
    return label;
  }
  const lowered = label.toLowerCase();
  return STATUS_BADGE_ICON_KEYS.has(lowered) ? lowered : undefined;
}

/**
 * Official StatusBadge color resolution: the `failed` status aliases to
 * Failure (test-case results arrive lower-cased), and any unmapped
 * status falls back to gray.
 */
export function resolveStatusBadgeColor(status: string): string {
  const key = (status === 'failed' ? 'failure' : status) as StatusTypeValue;
  return STATUS_TYPE_TO_BADGE_COLOR[key] ?? 'gray';
}