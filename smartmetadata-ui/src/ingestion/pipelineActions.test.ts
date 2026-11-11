/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { OperationPermissions } from '@/api/permissions';
import type { IngestionPipeline } from '@/types/ingestion';
import {
  canDeletePipeline,
  canDeployPipeline,
  canEditPipeline,
  canKillPipeline,
  canTogglePipelineStatus,
  canTriggerPipeline,
} from './pipelineActions';

function pipeline(overrides: Partial<IngestionPipeline> = {}): IngestionPipeline {
  return {
    id: 'p1',
    name: 'warehouse-metadata',
    pipelineType: 'metadata',
    enabled: true,
    deployed: true,
    ...overrides,
  };
}

describe('pipelineActions gating (P-09/P-17)', () => {
  it('denies everything on a missing permission fetch (fail-closed)', () => {
    const p = pipeline();
    expect(canEditPipeline(false, undefined)).toBe(false);
    expect(canDeletePipeline(false, undefined)).toBe(false);
    expect(canDeployPipeline(false, undefined, p)).toBe(false);
    expect(canTriggerPipeline(false, undefined, p)).toBe(false);
    expect(canTogglePipelineStatus(false, undefined)).toBe(false);
    expect(canKillPipeline(false, undefined)).toBe(false);
  });

  it('admits everything on the admin line alone', () => {
    const p = pipeline();
    expect(canEditPipeline(true, undefined)).toBe(true);
    expect(canDeletePipeline(true, undefined)).toBe(true);
    expect(canDeployPipeline(true, undefined, p)).toBe(true);
    expect(canTriggerPipeline(true, undefined, p)).toBe(true);
    expect(canTogglePipelineStatus(true, undefined)).toBe(true);
    expect(canKillPipeline(true, undefined)).toBe(true);
  });

  it('splits the official operation bits (PipelineActions.tsx:52-70)', () => {
    const p = pipeline();
    const editAll: OperationPermissions = { EditAll: true };
    expect(canEditPipeline(false, editAll)).toBe(true);
    expect(canDeletePipeline(false, editAll)).toBe(false);
    expect(canKillPipeline(false, editAll)).toBe(true);
    expect(canTogglePipelineStatus(false, editAll)).toBe(true);

    const deployOnly: OperationPermissions = { Deploy: true };
    expect(canDeployPipeline(false, deployOnly, p)).toBe(true);
    expect(canEditPipeline(false, deployOnly)).toBe(false);

    const triggerOnly: OperationPermissions = { Trigger: true };
    expect(canTriggerPipeline(false, triggerOnly, p)).toBe(true);
    expect(canDeployPipeline(false, triggerOnly, p)).toBe(false);

    const statusOnly: OperationPermissions = { EditIngestionPipelineStatus: true };
    expect(canTogglePipelineStatus(false, statusOnly)).toBe(true);
    expect(canEditPipeline(false, statusOnly)).toBe(false);
  });

  it('requires deployed && enabled for Run, enabled for Deploy', () => {
    const trigger: OperationPermissions = { Trigger: true };
    expect(canTriggerPipeline(false, trigger, pipeline({ deployed: false }))).toBe(false);
    expect(canTriggerPipeline(false, trigger, pipeline({ enabled: false }))).toBe(false);
    expect(canDeployPipeline(false, { Deploy: true }, pipeline({ enabled: false }))).toBe(false);
    // The toggle is not gated on enabled (a disabled pipeline is exactly
    // what the toggle acts on), only on the operation bit.
    expect(canTogglePipelineStatus(false, { EditIngestionPipelineStatus: true })).toBe(true);
  });
});
