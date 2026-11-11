/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { OperationPermissions } from '@/api/permissions';
import type { IngestionPipeline } from '@/types/ingestion';

/**
 * Row-action gating, ported 1:1 from official PipelineActions.tsx:52-70
 * (openmetadata-ui, pin a3012259ca). The P1 admin line ORs in on top of
 * every operation, matching the detail view's canDeploy/canTrigger; a
 * missing or failed permission fetch denies (fail-closed).
 *
 * - Edit = EditAll
 * - Delete = Delete
 * - Deploy = EditAll || Deploy
 * - Trigger = Trigger
 * - Pause/Resume = EditAll || EditIngestionPipelineStatus
 * - Kill = EditAll
 *
 * Run additionally needs deployed && enabled; deploy additionally needs
 * enabled (a disabled pipeline is exactly the state the toggle acts on,
 * so the toggle is not gated on enabled — only on deployed).
 */
export function canEditPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): boolean {
  return isAdminUser || ops?.EditAll === true;
}

export function canDeletePipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): boolean {
  return isAdminUser || ops?.Delete === true;
}

export function canDeployPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  pipeline: IngestionPipeline,
): boolean {
  if (pipeline.enabled === false) {
    return false;
  }
  return isAdminUser || ops?.EditAll === true || ops?.Deploy === true;
}

export function canTriggerPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  pipeline: IngestionPipeline,
): boolean {
  if (pipeline.enabled === false || pipeline.deployed !== true) {
    return false;
  }
  return isAdminUser || ops?.Trigger === true;
}

export function canTogglePipelineStatus(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): boolean {
  return isAdminUser || ops?.EditAll === true || ops?.EditIngestionPipelineStatus === true;
}

export function canKillPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): boolean {
  return isAdminUser || ops?.EditAll === true;
}
