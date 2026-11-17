/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestionPipeline, PipelineStatus } from '@/types/ingestion';
import {
  aggregateProgress,
  aggregateStepTotals,
  buildRunTotals,
  buildStepAttention,
  formatRunStartedAt,
  getAgentStatusFromPipelineState,
  getRecentRuns,
  mapPipelineStatusToRun,
  mapPipelineToAgent,
  mapStepSummaryToRunStep,
  resolveRunStepStatus,
  toRunStatus,
} from './agentsDataMapper';

const NOW = new Date('2026-11-14T12:00:00.000Z').getTime();

function pipeline(overrides: Partial<IngestionPipeline> = {}): IngestionPipeline {
  return {
    id: 'p1',
    name: 'pg-metadata',
    fullyQualifiedName: 'pg.metadata',
    pipelineType: 'metadata',
    ...overrides,
  };
}

function status(overrides: Partial<PipelineStatus> = {}): PipelineStatus {
  return { runId: 'run-1', pipelineState: 'success', timestamp: NOW - 600_000, ...overrides };
}

describe('getAgentStatusFromPipelineState (official STATUS_TO_AGENT_STATUS)', () => {
  it('maps success-family states to success', () => {
    for (const state of ['success', 'partialSuccess', 'active', 'activeError', 'completed']) {
      expect(getAgentStatusFromPipelineState(state)).toBe('success');
    }
  });

  it('maps failed to failed and running-family states to running', () => {
    expect(getAgentStatusFromPipelineState('failed')).toBe('failed');
    for (const state of ['running', 'started', 'stopInProgress']) {
      expect(getAgentStatusFromPipelineState(state)).toBe('running');
    }
  });

  it('maps queued-family states and everything else to queued', () => {
    for (const state of ['queued', 'pending', 'NO_RUNS']) {
      expect(getAgentStatusFromPipelineState(state)).toBe('queued');
    }
    expect(getAgentStatusFromPipelineState('stopped')).toBe('queued');
    expect(getAgentStatusFromPipelineState('bogus')).toBe('queued');
    expect(getAgentStatusFromPipelineState(undefined)).toBe('queued');
  });
});

describe('aggregateProgress (running runs)', () => {
  it('collapses identical per-step maps per entity type instead of summing across steps', () => {
    const progress = {
      Table: { processed: 40, total: 100, estimatedRemainingSeconds: 30 },
      DatabaseSchema: { processed: 5, total: 5, estimatedRemainingSeconds: 12 },
    };
    const fields = aggregateProgress([
      { name: 'a', progress },
      { name: 'b', progress },
    ]);
    expect(fields.assets).toBe(45);
    expect(fields.target).toBe(105);
    expect(fields.pct).toBe(43);
    expect(fields.eta).toBe(30);
  });

  it('keeps the highest processed per entity type', () => {
    const fields = aggregateProgress([
      { name: 'a', progress: { Table: { processed: 10, total: 100 } } },
      { name: 'b', progress: { Table: { processed: 60, total: 100 } } },
    ]);
    expect(fields.assets).toBe(60);
    expect(fields.target).toBe(100);
    expect(fields.pct).toBe(60);
  });

  it('falls back the target to the asset count when no total is known', () => {
    const fields = aggregateProgress([{ name: 'a', progress: { Table: { processed: 7 } } }]);
    expect(fields.target).toBe(7);
    expect(fields.pct).toBe(100);
  });

  it('reports zero progress when no step carries a progress map', () => {
    // No step reports an ETA: the pin's sumProgress leaves eta null
    // (a 0 would render as "wrapping up" on the card).
    expect(aggregateProgress([{ name: 'a' }])).toMatchObject({
      pct: 0,
      assets: 0,
      target: 1,
      eta: null,
    });
  });

  it('leaves the ETA null when steps carry progress maps but no ETA', () => {
    const fields = aggregateProgress([
      { name: 'a', progress: { Table: { processed: 10, total: 100 } } },
    ]);
    expect(fields.eta).toBeNull();
    expect(fields.assets).toBe(10);
  });
});

describe('aggregateStepTotals (finished runs)', () => {
  it('takes assets as the max records across steps and sums errors and warnings', () => {
    const fields = aggregateStepTotals(
      [
        { name: 'a', records: 50, errors: 1, warnings: 2 },
        { name: 'b', records: 120, errors: 3, warnings: 1 },
        { name: 'c', records: 30 },
      ],
      NOW - 600_000,
    );
    expect(fields.assets).toBe(120);
    expect(fields.errors).toBe(4);
    expect(fields.warnings).toBe(3);
    expect(fields.pct).toBe(100);
    expect(fields.target).toBe(120);
    expect(fields.eta).toBe(0);
  });
});

describe('getRecentRuns', () => {
  it('keeps completed runs only, newest five, oldest first', () => {
    const runs = getRecentRuns([
      status({ runId: 'r6', pipelineState: 'running', timestamp: NOW }),
      status({ runId: 'r5', pipelineState: 'success', timestamp: NOW - 1000 }),
      status({ runId: 'r4', pipelineState: 'failed', timestamp: NOW - 2000 }),
      status({ runId: 'r3', pipelineState: 'stopped', timestamp: NOW - 3000 }),
      status({ runId: 'r2', pipelineState: 'partialSuccess', timestamp: NOW - 4000 }),
      status({ runId: 'r1', pipelineState: 'success', timestamp: NOW - 5000 }),
      status({ runId: 'r0', pipelineState: 'success', timestamp: NOW - 6000 }),
    ]);
    expect(runs).toEqual([
      { id: 'r1', status: 'success' },
      { id: 'r2', status: 'partial' },
      { id: 'r3', status: 'skipped' },
      { id: 'r4', status: 'failed' },
      { id: 'r5', status: 'success' },
    ]);
  });

  it('falls back to the timestamp when a run has no run id', () => {
    const runs = getRecentRuns([status({ runId: undefined, timestamp: 12345 })]);
    expect(runs).toEqual([{ id: '12345', status: 'success' }]);
  });
});

describe('mapPipelineToAgent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.setItem('sm.locale.v1', 'en-US');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem('sm.locale.v1');
  });

  it('maps a pipeline with no statuses to a none agent with empty progress', () => {
    const agent = mapPipelineToAgent(
      pipeline({ displayName: 'Metadata Agent', airflowConfig: { scheduleInterval: '0 0 * * 0' } }),
    );
    expect(agent).toMatchObject({
      id: 'p1',
      fqn: 'pg.metadata',
      pipelineType: 'metadata',
      name: 'Metadata Agent',
      type: 'Metadata',
      unit: 'assets',
      verb: 'ingested',
      status: 'none',
      pct: 0,
      eta: null,
      assets: 0,
      target: 0,
      errors: 0,
      warnings: 0,
      recentRuns: [],
      schedule: '0 0 * * 0',
    });
    expect(agent.currentRunId).toBeUndefined();
    expect(agent.finishedAt).toBeUndefined();
  });

  it('falls back to the pipeline name when no display name is set', () => {
    expect(mapPipelineToAgent(pipeline()).name).toBe('pg-metadata');
  });

  it('maps a running latest status through aggregateProgress', () => {
    const agent = mapPipelineToAgent(
      pipeline({
        pipelineStatuses: [
          status({
            pipelineState: 'running',
            status: [
              {
                name: 'a',
                progress: { Table: { processed: 25, total: 50, estimatedRemainingSeconds: 90 } },
              },
            ],
          }),
        ],
      }),
    );
    expect(agent.status).toBe('running');
    expect(agent.pct).toBe(50);
    expect(agent.assets).toBe(25);
    expect(agent.target).toBe(50);
    expect(agent.eta).toBe(90);
    expect(agent.currentRunId).toBe('run-1');
    expect(agent.lastRunAt).toBe(NOW - 600_000);
    expect(agent.finishedAt).toBeUndefined();
  });

  it('shows accumulated step errors and warnings on a running agent', () => {
    const agent = mapPipelineToAgent(
      pipeline({
        pipelineStatuses: [
          status({
            pipelineState: 'running',
            status: [
              {
                name: 'a',
                errors: 2,
                warnings: 1,
                progress: { Table: { processed: 25, total: 50 } },
              },
              { name: 'b', errors: 1, warnings: 3 },
            ],
          }),
        ],
      }),
    );
    expect(agent.status).toBe('running');
    expect(agent.errors).toBe(3);
    expect(agent.warnings).toBe(4);
    expect(agent.eta).toBeNull();
  });

  it('maps a finished latest status through aggregateStepTotals', () => {
    const agent = mapPipelineToAgent(
      pipeline({
        pipelineStatuses: [
          status({
            endDate: NOW - 600_000,
            status: [{ name: 'a', records: 80, errors: 2, warnings: 1 }],
          }),
        ],
      }),
    );
    expect(agent.status).toBe('success');
    expect(agent.pct).toBe(100);
    expect(agent.assets).toBe(80);
    expect(agent.errors).toBe(2);
    expect(agent.warnings).toBe(1);
    expect(agent.eta).toBe(0);
    expect(agent.finishedAt).toBe('10 mins ago');
  });

  it('maps a queued latest status to empty progress, never 100 percent', () => {
    const agent = mapPipelineToAgent(
      pipeline({ pipelineStatuses: [status({ pipelineState: 'queued' })] }),
    );
    expect(agent.status).toBe('queued');
    expect(agent.pct).toBe(0);
    expect(agent.assets).toBe(0);
    expect(agent.target).toBe(0);
  });

  it('maps pipeline types to agent type, unit, and verb', () => {
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'usage' }))).toMatchObject({
      type: 'Usage',
      unit: 'queries',
      verb: 'scanned',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'lineage' }))).toMatchObject({
      type: 'Lineage',
      unit: 'queries',
      verb: 'processed',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'profiler' }))).toMatchObject({
      type: 'Profiler',
      unit: 'assets',
      verb: 'profiled',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'autoClassification' }))).toMatchObject({
      type: 'Auto Classification',
      unit: 'assets',
      verb: 'ingested',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'dbt' }))).toMatchObject({
      type: 'dbt',
      unit: 'models',
      verb: 'parsed',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'TestSuite' }))).toMatchObject({
      type: 'Data Quality',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'dataInsight' }))).toMatchObject({
      type: 'Metadata',
    });
    expect(mapPipelineToAgent(pipeline({ pipelineType: 'mystery' }))).toMatchObject({
      type: 'Metadata',
      unit: 'assets',
      verb: 'ingested',
    });
  });

  it('carries the enabled flag through', () => {
    expect(mapPipelineToAgent(pipeline({ enabled: false })).enabled).toBe(false);
    expect(mapPipelineToAgent(pipeline({ enabled: true })).enabled).toBe(true);
  });
});

describe('run-history mapping (official mapPipelineStatusToRun)', () => {
  it('maps capitalized pipeline states and falls back to skipped', () => {
    expect(toRunStatus('Success')).toBe('success');
    expect(toRunStatus('PartialSuccess')).toBe('partial');
    expect(toRunStatus('Failed')).toBe('failed');
    expect(toRunStatus('Running')).toBe('running');
    expect(toRunStatus('Queued')).toBe('skipped');
    expect(toRunStatus('Stopped')).toBe('skipped');
    expect(toRunStatus('success')).toBe('skipped');
    expect(toRunStatus(undefined)).toBe('skipped');
  });

  it('formats the run start in pin customFormatDateTime shape', () => {
    const millis = new Date(2026, 10, 14, 9, 5).getTime();
    expect(formatRunStartedAt(millis)).toBe('Nov 14, 2026 · 09:05');
  });

  it('takes totals as max records/filtered/updated and summed warnings/errors', () => {
    expect(
      buildRunTotals([
        { records: 10, filtered: 2, updated_records: 1, warnings: 1, errors: 0 },
        { records: 7, filtered: 5, updated_records: 3, warnings: 2, errors: 1 },
      ]),
    ).toEqual({ records: 10, filtered: 5, updated: 3, warnings: 3, errors: 1 });
    expect(buildRunTotals([])).toEqual({ records: 0, filtered: 0, updated: 0, warnings: 0, errors: 0 });
  });

  it('resolves step status from errors, warnings, and empty counts', () => {
    expect(resolveRunStepStatus(10, 0, 1, 0)).toBe('partial');
    expect(resolveRunStepStatus(0, 0, 1, 0)).toBe('failed');
    expect(resolveRunStepStatus(10, 0, 0, 1)).toBe('partial');
    expect(resolveRunStepStatus(0, 0, 0, 0)).toBe('skipped');
    expect(resolveRunStepStatus(0, 3, 0, 0)).toBe('success');
    expect(resolveRunStepStatus(10, 0, 0, 0)).toBe('success');
  });

  it('builds attention from the first failure only', () => {
    expect(buildStepAttention({})).toBeUndefined();
    expect(
      buildStepAttention({
        failures: [
          { name: 'boom', error: 'kaboom', stackTrace: 'trace' },
          { name: 'second', error: 'ignored' },
        ],
      }),
    ).toEqual({
      severity: 'error',
      title: 'boom',
      message: 'kaboom',
      hint: undefined,
      stackTrace: 'trace',
    });
  });

  it('maps a full status to a run with duration, totals, and steps', () => {
    const run = mapPipelineStatusToRun(
      status({
        pipelineState: 'Success',
        startDate: NOW - 90_000,
        endDate: NOW,
        status: [
          { name: 'extract', records: 12, filtered: 1, updated_records: 2 },
          { name: 'load', records: 12, errors: 1, failures: [{ name: 'x', error: 'y' }] },
        ],
      }),
    );
    expect(run.id).toBe('run-1');
    expect(run.status).toBe('success');
    expect(run.duration).toBe(1.5);
    expect(run.totals).toEqual({ records: 12, filtered: 1, updated: 2, warnings: 0, errors: 1 });
    expect(run.steps.map((step) => step.status)).toEqual(['success', 'partial']);
    expect(run.steps[1].attention?.title).toBe('x');
  });

  it('falls back to the timestamp id and an empty start when the run id and start date are missing', () => {
    const run = mapPipelineStatusToRun(status({ runId: undefined, startDate: undefined, timestamp: NOW }));
    expect(run.id).toBe(String(NOW));
    expect(run.startedAt).not.toBe('');
    expect(run.duration).toBe(0);
    const dateless = mapPipelineStatusToRun(
      status({ runId: undefined, startDate: undefined, timestamp: undefined }),
    );
    expect(dateless.startedAt).toBe('');
  });

  it('maps a step summary with defaulted counts', () => {
    expect(mapStepSummaryToRunStep({ name: 'only' })).toMatchObject({
      name: 'only',
      status: 'skipped',
      records: 0,
      attention: undefined,
    });
  });
});
