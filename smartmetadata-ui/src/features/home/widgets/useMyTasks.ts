/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, type Ref } from 'vue';
import { listMyAssignedTasks } from '@/api/tasks';
import { countMyTaskBuckets, MyTaskBucket } from '@/catalog/myTaskBuckets';
import type { CollaborationTask } from '@/types/collaboration';
import { useWidgetLoad } from '@/features/home/widgetLoad';

/**
 * The viewer's open tasks for the "My tasks" card — a port of official
 * `hooks/useMyTasks.ts` onto `useWidgetLoad`.
 *
 * `/tasks/assigned` rather than `/tasks?assignee=`: it resolves the
 * viewer's teams server-side, so a task assigned to a team the viewer
 * is on shows up here as it does in the inbox. It cannot filter by
 * category, which is why the buckets are counted over the loaded page.
 * ADR:2026-11-08-my-data-my-task
 */
export const MY_TASKS_PAGE_SIZE = 100;
const MY_TASKS_FIELDS = 'assignees,createdBy,about,payload';
const MY_TASKS_TTL_MS = 60 * 1000;

export interface MyTasks {
  /** The loaded page, newest first as the server orders it. */
  tasks: Ref<CollaborationTask[]>;
  /** Every open task assigned to the viewer or their teams. */
  total: Ref<number>;
  /** Per bucket, counted over `tasks`; `ALL` is `total`. */
  counts: Ref<Record<MyTaskBucket, number>>;
  isLoading: Ref<boolean>;
  isError: Ref<boolean>;
  refetch: () => Promise<void>;
}

export function useMyTasks(): MyTasks {
  const loaded = useWidgetLoad('my-tasks', () =>
    listMyAssignedTasks({
      fields: MY_TASKS_FIELDS,
      limit: MY_TASKS_PAGE_SIZE,
      statusGroup: 'open',
    }),
    { ttlMs: MY_TASKS_TTL_MS },
  );
  const tasks = computed(() => loaded.data.value?.data ?? []);
  const total = computed(() => loaded.data.value?.paging?.total ?? tasks.value.length);
  const counts = computed(() => countMyTaskBuckets(tasks.value, total.value));
  return { counts, isError: loaded.isError, isLoading: loaded.isLoading, refetch: loaded.refetch, tasks, total };
}
