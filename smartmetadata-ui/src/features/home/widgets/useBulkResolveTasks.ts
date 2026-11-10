/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ref, type Ref } from 'vue';
import { resolveTask } from '@/api/tasks';
import {
  buildResolveBody,
  getTaskResolveActions,
  needsTaskActionInput,
} from '@/catalog/taskResolve';
import type { CollaborationTask } from '@/types/collaboration';

/**
 * Approves or rejects every selected task the way the inbox would one at a
 * time — its workflow transition when it has one, its legacy resolution
 * when not. A task whose action needs a comment or a pick is left for the
 * tasks page rather than resolved with the input missing.
 *
 * Settled rather than all-or-nothing: one task closed elsewhere a moment
 * ago must not stop the rest from going through. Unresolved ids are
 * handed back so the card keeps them selected for a retry.
 * ADR:2026-11-08-my-data-my-task
 */
export type BulkDecision = 'approve' | 'reject';

export interface BulkResolveResult {
  resolved: number;
  unresolved: number;
  unresolvedIds: string[];
}

const NEEDS_INPUT = 'needs-input';

export function useBulkResolveTasks() {
  const isResolving: Ref<boolean> = ref(false);

  async function resolveAll(
    tasks: CollaborationTask[],
    decision: BulkDecision,
    labels: { approve: string; reject: string },
  ): Promise<BulkResolveResult> {
    isResolving.value = true;
    try {
      const results = await Promise.allSettled(
        tasks.map((task) => {
          const action = getTaskResolveActions(task, labels).find(
            (candidate) => candidate.kind === decision,
          );
          return action !== undefined && !needsTaskActionInput(task, action)
            ? resolveTask(task.id, buildResolveBody(action, task))
            : Promise.reject(new Error(NEEDS_INPUT));
        }),
      );
      const unresolvedIds = tasks
        .filter((_, index) => results[index].status === 'rejected')
        .map((task) => task.id);
      return {
        resolved: tasks.length - unresolvedIds.length,
        unresolved: unresolvedIds.length,
        unresolvedIds,
      };
    } finally {
      isResolving.value = false;
    }
  }

  return { isResolving, resolveAll };
}
