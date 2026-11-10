/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import type { CollaborationTask } from '@/types/collaboration';
import { useBulkResolveTasks } from './useBulkResolveTasks';

const resolveTask = vi.fn();
vi.mock('@/api/tasks', () => ({
  resolveTask: (...args: unknown[]) => resolveTask(...args),
}));

function task(overrides: Partial<CollaborationTask> & { id: string }): CollaborationTask {
  return { assignees: [], comments: [], status: 'Open', ...overrides };
}

describe('useBulkResolveTasks', () => {
  it('resolves every task and reports the unresolved ids for retry', async () => {
    resolveTask.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('gone'));
    const { resolveAll } = useBulkResolveTasks();
    const result = await resolveAll(
      [
        task({ id: 'a', category: 'DataAccess', type: 'DataAccessRequest' }),
        task({ id: 'b', category: 'Approval', type: 'RequestApproval' }),
      ],
      'approve',
      { approve: 'Approve', reject: 'Reject' },
    );
    expect(result).toEqual({ resolved: 1, unresolved: 1, unresolvedIds: ['b'] });
    expect(resolveTask).toHaveBeenCalledTimes(2);
  });

  it('leaves tasks needing input unresolved without calling resolve', async () => {
    const { resolveAll } = useBulkResolveTasks();
    const result = await resolveAll(
      [task({ id: 'i', category: 'Incident', type: 'TestCaseResolution' })],
      'approve',
      { approve: 'Approve', reject: 'Reject' },
    );
    expect(result).toEqual({ resolved: 0, unresolved: 1, unresolvedIds: ['i'] });
    expect(resolveTask).not.toHaveBeenCalled();
  });
});
