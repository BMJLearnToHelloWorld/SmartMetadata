/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Task action modes, modelled on the official TaskActionMode enum
 * (openmetadata-ui/.../pages/TasksPage/TasksPage.interface.ts) and the
 * official action lists (openmetadata-ui/.../utils/TaskActionUtils.ts):
 * generic TASK_ACTION_LIST = VIEW / EDIT / CLOSE, glossary
 * GLOSSARY_TASK_ACTION_LIST = RESOLVE / CLOSE, incident
 * INCIDENT_TASK_ACTION_LIST = RE_ASSIGN / RESOLVE.
 *
 * `wired` is the product-side truth, not the official list: an action is
 * wired only when the product has the endpoint and field surface for it.
 * Unwired actions render disabled with a residual note — never as a
 * button that is bound to fail. The official kind-to-list mapping is NOT
 * reproduced here because the product task payload carries no kind
 * discriminator the official lists key on (no suggestion payload surface,
 * no incident-transition surface); collapsing the five modes into one
 * table with per-mode wired flags is the honest bridge, and the kind
 * split returns once those surfaces exist.
 */
export type TaskActionMode = 'view' | 'edit' | 're-assign' | 'resolve' | 'close';

export interface TaskAction {
  key: TaskActionMode;
  labelKey: string;
  wired: boolean;
  residualKey?: string;
}

export const TASK_ACTIONS: TaskAction[] = [
  { key: 'view', labelKey: 'collaboration.task.actionView', wired: false, residualKey: 'collaboration.task.actionViewResidual' },
  { key: 'edit', labelKey: 'collaboration.task.actionEdit', wired: false, residualKey: 'collaboration.task.actionEditResidual' },
  { key: 're-assign', labelKey: 'collaboration.task.actionReassign', wired: false, residualKey: 'collaboration.task.actionReassignResidual' },
  { key: 'resolve', labelKey: 'collaboration.task.actionResolve', wired: true },
  { key: 'close', labelKey: 'collaboration.task.actionClose', wired: true },
];

/**
 * Official terminal statuses (openmetadata-ui/.../utils/TaskNavigationUtils.ts
 * isTaskTerminalStatus): Approved / Rejected / Completed / Cancelled /
 * Failed. A task in any of these states is not actionable
 * (TaskTabNew deriveIsTaskActionable: closed => not actionable).
 *
 * Product bridge addition: 'Closed' itself. The product close endpoint
 * returns the task with status Closed, and the official lists above do
 * not name that literal; without it a just-closed task would stay
 * actionable in this console, which is plainly wrong. This is the only
 * addition to the official list, and it is marked as such.
 */
export const TASK_TERMINAL_STATUSES = ['Approved', 'Rejected', 'Completed', 'Cancelled', 'Failed', 'Closed'] as const;

export function isTaskTerminalStatus(status?: string): boolean {
  return (TASK_TERMINAL_STATUSES as readonly string[]).includes(status ?? '');
}

export function isTaskActionable(status?: string): boolean {
  return !isTaskTerminalStatus(status);
}
