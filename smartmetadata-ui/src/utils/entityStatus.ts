/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official EntityStatusClass / getEntityStatusClass
 * (utils/EntityStatusUtils.ts).
 */
import type { StatusTypeValue } from '@/utils/statusBadge';

/** Official EntityStatus values used by EntityStatusBadge. */
export type EntityStatusValue =
  | 'Approved'
  | 'Draft'
  | 'Rejected'
  | 'Deprecated'
  | 'InReview'
  | 'Unprocessed'
  | 'Archived';

/** Official EntityStatusClass. */
export const ENTITY_STATUS_CLASS: Record<EntityStatusValue, StatusTypeValue> = {
  Approved: 'success',
  Draft: 'pending',
  Rejected: 'failure',
  Deprecated: 'deprecated',
  InReview: 'inReview',
  Unprocessed: 'pending',
  Archived: 'archived',
};

export function getEntityStatusClass(status: string): StatusTypeValue {
  return ENTITY_STATUS_CLASS[status as EntityStatusValue] ?? 'pending';
}

/** Official EntityStatusBadge hides Unprocessed. */
export function isUnprocessedStatus(status?: string): boolean {
  return !status || status.toLowerCase() === 'unprocessed';
}
