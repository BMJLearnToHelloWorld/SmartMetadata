/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { CollaborationTask } from '@/types/collaboration';

/**
 * The chips above the "My tasks" list — a port of official
 * `openmetadata-ui/.../utils/myTaskBuckets.ts`.
 *
 * Custom tasks sit in no bucket: they only show under All.
 */
export enum MyTaskBucket {
  ALL = 'all',
  INCIDENTS = 'incidents',
  ACCESS = 'access',
  APPROVALS = 'approvals',
}

const BUCKET_BY_CATEGORY: Partial<Record<string, MyTaskBucket>> = {
  Incident: MyTaskBucket.INCIDENTS,
  DataAccess: MyTaskBucket.ACCESS,
  Approval: MyTaskBucket.APPROVALS,
  Review: MyTaskBucket.APPROVALS,
  MetadataUpdate: MyTaskBucket.APPROVALS,
};

export function getMyTaskBucket(task: CollaborationTask): MyTaskBucket | undefined {
  return task.category === undefined ? undefined : BUCKET_BY_CATEGORY[task.category];
}

/**
 * Per-bucket counts over `tasks`; `ALL` is the server's `total`.
 * The buckets are counted over the loaded page, so past it they
 * describe the loaded tasks rather than every task.
 */
export function countMyTaskBuckets(
  tasks: CollaborationTask[],
  total: number,
): Record<MyTaskBucket, number> {
  return tasks.reduce(
    (counts, task) => {
      const bucket = getMyTaskBucket(task);
      if (bucket !== undefined) {
        counts[bucket] += 1;
      }
      return counts;
    },
    {
      [MyTaskBucket.ALL]: total,
      [MyTaskBucket.INCIDENTS]: 0,
      [MyTaskBucket.ACCESS]: 0,
      [MyTaskBucket.APPROVALS]: 0,
    },
  );
}

export function filterMyTasks(tasks: CollaborationTask[], bucket: MyTaskBucket): CollaborationTask[] {
  return bucket === MyTaskBucket.ALL
    ? tasks
    : tasks.filter((task) => getMyTaskBucket(task) === bucket);
}

/**
 * What the selection bar offers for the selected tasks.
 *
 * Only access requests and approvals resolve from the card: both are a
 * plain approve-or-reject. An incident needs a root cause and a custom
 * task a form, so a selection holding either sends the viewer to the
 * tasks page instead of resolving anything blind.
 */
export type BulkTaskAction =
  | { kind: 'resolve'; isAllAccess: boolean }
  | { kind: 'open' };

export function getBulkTaskAction(tasks: CollaborationTask[]): BulkTaskAction {
  const buckets = tasks.map(getMyTaskBucket);
  const isResolvable =
    buckets.length > 0 &&
    buckets.every((bucket) => bucket === MyTaskBucket.ACCESS || bucket === MyTaskBucket.APPROVALS);
  if (!isResolvable) {
    return { kind: 'open' };
  }
  // Approve/deny labels differ by bucket: all-access selections grant or
  // deny, mixed or approval selections approve or reject. The widget
  // reads this from the action instead of re-deriving it.
  const isAllAccess = buckets.every((bucket) => bucket === MyTaskBucket.ACCESS);
  return { kind: 'resolve', isAllAccess };
}
