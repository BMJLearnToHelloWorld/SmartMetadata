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
 * The title to show for a task row.
 *
 * Follows the product's existing convention (TaskDetailView: displayName
 * || name || id). A Task has no title field, and the server defaults
 * `name` to the task id for anything opened without one, so a name that
 * merely repeats the id is not a title: fall back to the description's
 * first line, then to `#<id>`.
 *
 * Official `getTaskTitle` additionally composes a "<type> <entity>"
 * title from the task-type message catalogue
 * (getTaskTypeMessageKey); the product has no such catalogue, so that
 * composed form is not ported here — see ADR:2026-11-08-my-data-my-task.
 */
export function getTaskTitle(task: CollaborationTask): string {
  const authored = [task.displayName, task.name]
    .map((value) => value?.trim())
    .find((value) => value !== undefined && value !== '' && value !== task.id);
  if (authored !== undefined) {
    return authored;
  }
  const description = task.description?.replace(/\n/g, ' ').trim();
  if (description !== undefined && description !== '') {
    return description;
  }
  return `#${task.id}`;
}
