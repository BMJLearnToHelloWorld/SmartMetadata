/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { CollaborationTask } from '@/types/collaboration';
import {
  countMyTaskBuckets,
  filterMyTasks,
  getBulkTaskAction,
  getMyTaskBucket,
  MyTaskBucket,
} from './myTaskBuckets';

function task(overrides: Partial<CollaborationTask> & { id: string }): CollaborationTask {
  return { assignees: [], comments: [], ...overrides };
}

describe('myTaskBuckets', () => {
  it('maps categories to buckets and leaves custom tasks unbucketed', () => {
    expect(getMyTaskBucket(task({ id: '1', category: 'Incident' }))).toBe(MyTaskBucket.INCIDENTS);
    expect(getMyTaskBucket(task({ id: '2', category: 'DataAccess' }))).toBe(MyTaskBucket.ACCESS);
    expect(getMyTaskBucket(task({ id: '3', category: 'Approval' }))).toBe(MyTaskBucket.APPROVALS);
    expect(getMyTaskBucket(task({ id: '4', category: 'Review' }))).toBe(MyTaskBucket.APPROVALS);
    expect(getMyTaskBucket(task({ id: '5', category: 'MetadataUpdate' }))).toBe(
      MyTaskBucket.APPROVALS,
    );
    expect(getMyTaskBucket(task({ id: '6', category: 'Custom' }))).toBeUndefined();
  });

  it('counts buckets over the loaded page with ALL from the server total', () => {
    const tasks = [
      task({ id: '1', category: 'Incident' }),
      task({ id: '2', category: 'DataAccess' }),
      task({ id: '3', category: 'Custom' }),
    ];
    expect(countMyTaskBuckets(tasks, 250)).toEqual({
      [MyTaskBucket.ALL]: 250,
      [MyTaskBucket.INCIDENTS]: 1,
      [MyTaskBucket.ACCESS]: 1,
      [MyTaskBucket.APPROVALS]: 0,
    });
  });

  it('filters by bucket and passes all tasks through for ALL', () => {
    const tasks = [
      task({ id: '1', category: 'Incident' }),
      task({ id: '2', category: 'DataAccess' }),
    ];
    expect(filterMyTasks(tasks, MyTaskBucket.ALL)).toEqual(tasks);
    expect(filterMyTasks(tasks, MyTaskBucket.INCIDENTS).map((t) => t.id)).toEqual(['1']);
  });

  it('offers resolve only for access and approval selections', () => {
    const access = task({ id: '1', category: 'DataAccess' });
    const approval = task({ id: '2', category: 'Approval' });
    const incident = task({ id: '3', category: 'Incident' });
    expect(getBulkTaskAction([access])).toEqual({ kind: 'resolve', isAllAccess: true });
    expect(getBulkTaskAction([approval])).toEqual({ kind: 'resolve', isAllAccess: false });
    expect(getBulkTaskAction([access, approval])).toEqual({ kind: 'resolve', isAllAccess: false });
    expect(getBulkTaskAction([access, incident])).toEqual({ kind: 'open' });
    expect(getBulkTaskAction([])).toEqual({ kind: 'open' });
  });
});
