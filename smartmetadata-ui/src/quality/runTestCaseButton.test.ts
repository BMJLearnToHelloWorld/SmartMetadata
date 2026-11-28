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
import type { IngestionPipeline } from '@/types/ingestion';
import {
  getActiveRunState,
  getRunButtonLabelKey,
  getRunDisabledReasonKey,
  getRunnablePipeline,
  getTriggerPermissions,
} from './runTestCaseButton';

describe('runTestCaseButton official helpers', () => {
  it('picks the enabled deployed pipeline with the lowest id', () => {
    const pipelines = [
      { id: 'b', enabled: true, deployed: true },
      { id: 'a', enabled: true, deployed: true },
      { id: 'c', enabled: true, deployed: false },
    ] as IngestionPipeline[];
    expect(getRunnablePipeline(pipelines)?.id).toBe('a');
  });

  it('falls back to resource permissions when no runnable pipeline exists', () => {
    const resource = { Trigger: true } as never;
    const pipelinePerms = { Trigger: false } as never;
    expect(getTriggerPermissions(undefined, pipelinePerms, resource)).toBe(resource);
    const pipeline = { id: 'p1', enabled: true, deployed: true } as IngestionPipeline;
    expect(getTriggerPermissions(pipeline, pipelinePerms, resource)).toBe(pipelinePerms);
  });

  it('reports official disabled reasons and run labels', () => {
    expect(getRunDisabledReasonKey([], true)).toBe('message.pipelines-could-not-be-loaded');
    expect(getRunDisabledReasonKey([])).toBe('message.no-pipeline-linked');
    expect(getRunDisabledReasonKey([{ id: 'p', enabled: false, deployed: false } as IngestionPipeline])).toBe(
      'message.pipeline-not-deployed',
    );
    expect(getRunButtonLabelKey('Queued')).toBe('label.queued');
    expect(getRunButtonLabelKey('Running')).toBe('label.running');
    expect(getRunButtonLabelKey()).toBe('label.run-now');
  });

  it('treats a recent running status as the active run state', () => {
    const now = Date.UTC(2026, 0, 1);
    const pipeline = {
      id: 'p',
      enabled: true,
      deployed: true,
      pipelineStatuses: [{ pipelineState: 'Running', timestamp: now }],
    } as IngestionPipeline;
    expect(getActiveRunState(pipeline, now)).toBe('Running');
  });
});
