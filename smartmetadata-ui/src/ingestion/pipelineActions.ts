/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import type { IngestionPipeline } from '@/types/ingestion';

/**
 * Row-action gating, ported 1:1 from official PipelineActions.tsx:52-70
 * (openmetadata-ui, pin a3012259ca) and routed through the single
 * derivation system (getDerivedPermissionFlags) — this module is the only
 * place pipeline-action policy math lives; the detail view calls these
 * helpers instead of re-deriving. The P1 admin line ORs in on top of
 * every operation; a missing or failed permission fetch denies
 * (fail-closed).
 *
 * - Edit = EditAll
 * - Delete = Delete
 * - Deploy = EditAll || Deploy (pin raw OR, NOT the derived field-first
 *   rule: Deploy:false + EditAll:true deploys upstream, so the OR is
 *   spelled out here via canEditAll || can('Deploy'))
 * - Trigger = Trigger
 * - Pause/Resume = EditAll || EditIngestionPipelineStatus (same raw OR)
 * - Kill = EditAll
 *
 * Run additionally needs deployed && enabled; deploy additionally needs
 * enabled (a disabled pipeline is exactly the state the toggle acts on,
 * so the toggle is not gated on enabled — only on deployed).
 *
 * D-5: a soft-deleted pipeline is read-only — Edit/Deploy/Trigger/
 * Toggle/Kill are all denied while deleted (official showActions rule),
 * including for admins. Delete is not an Edit* operation and keeps its
 * own gate: it surfaces the restore/purge path, exactly as the derived
 * flags leave canDelete ungated.
 */
export function canEditPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  deleted = false,
): boolean {
  return !deleted && (isAdminUser || getDerivedPermissionFlags(ops ?? {}, deleted).canEditAll);
}

export function canDeletePipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): boolean {
  return isAdminUser || getDerivedPermissionFlags(ops ?? {}).canDelete;
}

export function canDeployPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  pipeline: IngestionPipeline,
  deleted = false,
): boolean {
  if (pipeline.enabled === false || deleted) {
    return false;
  }
  const flags = getDerivedPermissionFlags(ops ?? {}, deleted);
  return isAdminUser || flags.canEditAll || flags.can('Deploy');
}

export function canTriggerPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  pipeline: IngestionPipeline,
  deleted = false,
): boolean {
  if (pipeline.enabled === false || pipeline.deployed !== true || deleted) {
    return false;
  }
  const flags = getDerivedPermissionFlags(ops ?? {}, deleted);
  return isAdminUser || flags.can('Trigger');
}

export function canTogglePipelineStatus(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  deleted = false,
): boolean {
  if (deleted) {
    return false;
  }
  const flags = getDerivedPermissionFlags(ops ?? {}, deleted);
  return isAdminUser || flags.canEditAll || flags.can('EditIngestionPipelineStatus');
}

export function canKillPipeline(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
  deleted = false,
): boolean {
  return !deleted && (isAdminUser || getDerivedPermissionFlags(ops ?? {}, deleted).canEditAll);
}
