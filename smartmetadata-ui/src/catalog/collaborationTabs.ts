/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ListTasksQuery } from '@/api/tasks';

/**
 * Collaboration list controls, driven by tables over the already-evidenced
 * product API surface — no invented filter values.
 *
 * Tasks: only 'open' has an evidenced statusGroup value (existing test
 * asserts statusGroup=open); 'all' omits the parameter entirely. A
 * closed-only tab would need an unevidenced statusGroup value, so it is
 * deliberately absent and recorded as a residual.
 * Activity: listActivityEvents takes a days parameter; the existing default
 * is 7, and 30 matches the entity-activity default.
 */
export interface TaskStatusTab {
  key: string;
  labelKey: string;
  statusGroup?: string;
}

export const TASK_STATUS_TABS: TaskStatusTab[] = [
  { key: 'open', labelKey: 'collaboration.tasks.statusOpen', statusGroup: 'open' },
  { key: 'all', labelKey: 'collaboration.tasks.statusAll' },
];

export function taskStatusQuery(tab: TaskStatusTab): Pick<ListTasksQuery, 'statusGroup'> {
  return tab.statusGroup ? { statusGroup: tab.statusGroup } : {};
}

export interface ActivityRangePreset {
  key: string;
  labelKey: string;
  days: number;
}

export const ACTIVITY_RANGE_PRESETS: ActivityRangePreset[] = [
  { key: 'last7', labelKey: 'collaboration.activity.range7', days: 7 },
  { key: 'last30', labelKey: 'collaboration.activity.range30', days: 30 },
];
