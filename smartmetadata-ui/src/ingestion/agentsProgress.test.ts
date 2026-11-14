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
import type { Agent, ProgressUpdate } from '@/types/ingestion';
import {
  applyProgressToAgent,
  isTerminalProgressUpdate,
  resetAgentProgress,
  sumGlobalCounters,
  sumLeafProcessed,
} from './agentsProgress';

const NOW = new Date('2026-11-14T12:00:00.000Z').getTime();

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'p1',
    fqn: 'pg.metadata',
    pipelineType: 'metadata',
    name: 'Metadata Agent',
    type: 'Metadata',
    unit: 'assets',
    verb: 'ingested',
    status: 'running',
    pct: 0,
    eta: null,
    assets: 0,
    target: 0,
    errors: 0,
    warnings: 0,
    recentRuns: [],
    ...overrides,
  };
}

function update(overrides: Partial<ProgressUpdate> = {}): ProgressUpdate {
  return {
    runId: 'run-1',
    timestamp: NOW,
    updateType: 'PROCESSING',
    ...overrides,
  };
}

describe('isTerminalProgressUpdate', () => {
  it('treats PIPELINE_COMPLETE and ERROR as terminal', () => {
    expect(isTerminalProgressUpdate('PIPELINE_COMPLETE')).toBe(true);
    expect(isTerminalProgressUpdate('ERROR')).toBe(true);
    expect(isTerminalProgressUpdate('DISCOVERY')).toBe(false);
    expect(isTerminalProgressUpdate('PROCESSING')).toBe(false);
    expect(isTerminalProgressUpdate('STEP_COMPLETE')).toBe(false);
  });
});

describe('sumGlobalCounters / sumLeafProcessed', () => {
  it('sums counter done values, treating missing done as zero', () => {
    expect(sumGlobalCounters(undefined)).toBe(0);
    expect(
      sumGlobalCounters([
        { entityType: 'Table', done: 10, total: 20 },
        { entityType: 'Database', done: undefined, total: 3 },
      ]),
    ).toBe(10);
  });

  it('sums leaf processed values through the progress tree', () => {
    expect(sumLeafProcessed(undefined)).toBe(0);
    expect(
      sumLeafProcessed({
        label: '',
        processed: 999,
        children: [
          { label: 'db', processed: 50, children: [{ label: 's1', processed: 30 }, { label: 's2', processed: 20 }] },
          { label: 'db2', processed: 7 },
        ],
      }),
    ).toBe(57);
  });
});

describe('resetAgentProgress', () => {
  it('zeroes the run numbers and keeps the identity fields', () => {
    const reset = resetAgentProgress(
      agent({ pct: 80, assets: 40, target: 50, eta: 12, finishedAt: '10 mins ago' }),
    );
    expect(reset).toMatchObject({ pct: 0, assets: 0, target: 0, eta: null });
    expect(reset.finishedAt).toBeUndefined();
    expect(reset.fqn).toBe('pg.metadata');
    expect(reset.name).toBe('Metadata Agent');
  });
});

describe('applyProgressToAgent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.setItem('sm.locale.v1', 'en-US');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.removeItem('sm.locale.v1');
  });

  it('prefers totalAssetsIngested, then counters, then the progress tree', () => {
    const base = agent();
    const byTotal = applyProgressToAgent(
      base,
      update({
        totalAssetsIngested: 90,
        globalCounters: [{ entityType: 'Table', done: 10, total: 20 }],
        progress: { processed: 5 },
      }),
    );
    expect(byTotal.assets).toBe(90);
    const byCounters = applyProgressToAgent(
      base,
      update({
        globalCounters: [{ entityType: 'Table', done: 10, total: 20 }],
        progress: { processed: 5 },
      }),
    );
    expect(byCounters.assets).toBe(10);
    const byTree = applyProgressToAgent(base, update({ progress: { processed: 5 } }));
    expect(byTree.assets).toBe(5);
  });

  it('prefers present-but-zero counters over the progress tree', () => {
    const next = applyProgressToAgent(
      agent(),
      update({
        globalCounters: [{ done: 0, total: 10 }],
        progress: { processed: 5 },
      }),
    );
    expect(next.assets).toBe(0);
  });

  it('never moves the asset count backwards', () => {
    const next = applyProgressToAgent(agent({ assets: 50 }), update({ totalAssetsIngested: 30 }));
    expect(next.assets).toBe(50);
  });

  it('derives percent only from counters with all totals known, monotonically', () => {
    const withTotals = applyProgressToAgent(
      agent({ pct: 10 }),
      update({ globalCounters: [{ done: 5, total: 20 }] }),
    );
    expect(withTotals.pct).toBe(25);
    const unknownTotals = applyProgressToAgent(
      agent({ pct: 25 }),
      update({ globalCounters: [{ done: 5, total: null }] }),
    );
    expect(unknownTotals.pct).toBe(25);
    const backwards = applyProgressToAgent(
      agent({ pct: 80 }),
      update({ globalCounters: [{ done: 1, total: 20 }] }),
    );
    expect(backwards.pct).toBe(80);
  });

  it('clamps percent at 100 when reported done exceeds the known total', () => {
    const next = applyProgressToAgent(
      agent({ pct: 0 }),
      update({ globalCounters: [{ done: 30, total: 20 }] }),
    );
    expect(next.pct).toBe(100);
  });

  it('takes the target from known counter totals, else from assets, else keeps it', () => {
    expect(
      applyProgressToAgent(agent(), update({ globalCounters: [{ done: 1, total: 40 }] })).target,
    ).toBe(40);
    expect(applyProgressToAgent(agent(), update({ totalAssetsIngested: 9 })).target).toBe(9);
    expect(
      applyProgressToAgent(agent({ target: 33 }), update({ globalCounters: [] })).target,
    ).toBe(33);
  });

  it('keeps the previous target when any counter total is unknown', () => {
    const kept = applyProgressToAgent(
      agent({ target: 50 }),
      update({
        globalCounters: [
          { done: 4, total: 4 },
          { done: 0, total: null },
        ],
      }),
    );
    expect(kept.target).toBe(50);
    const fromAssets = applyProgressToAgent(
      agent({ target: 0 }),
      update({
        globalCounters: [
          { done: 4, total: 4 },
          { done: 0, total: null },
        ],
      }),
    );
    expect(fromAssets.target).toBe(4);
  });

  it('keeps the previous ETA when the update carries none', () => {
    expect(applyProgressToAgent(agent({ eta: 44 }), update()).eta).toBe(44);
    expect(applyProgressToAgent(agent({ eta: 44 }), update({ estimatedSecondsRemaining: 10 })).eta).toBe(10);
  });

  it('clears the ETA on an explicit null (the schema documents null as not yet computable)', () => {
    expect(
      applyProgressToAgent(agent({ eta: 44 }), update({ estimatedSecondsRemaining: null })).eta,
    ).toBeNull();
  });

  it('marks the agent running for non-terminal updates and binds the run id', () => {
    const next = applyProgressToAgent(agent({ status: 'queued' }), update({ runId: 'run-9' }));
    expect(next.status).toBe('running');
    expect(next.currentRunId).toBe('run-9');
    expect(next.finishedAt).toBeUndefined();
  });

  it('completes the agent on PIPELINE_COMPLETE with final numbers', () => {
    const next = applyProgressToAgent(
      agent({ pct: 60, eta: 30 }),
      update({ updateType: 'PIPELINE_COMPLETE', totalAssetsIngested: 120, timestamp: NOW - 600_000 }),
    );
    expect(next).toMatchObject({
      status: 'success',
      pct: 100,
      eta: 0,
      assets: 120,
      target: 120,
      finishedAt: '10 mins ago',
      currentRunId: 'run-1',
    });
  });

  it('fails the agent on ERROR, keeping percent and clearing the ETA', () => {
    const next = applyProgressToAgent(
      agent({ pct: 60, eta: 30, assets: 20 }),
      update({ updateType: 'ERROR', totalAssetsIngested: 25, timestamp: NOW - 600_000 }),
    );
    expect(next).toMatchObject({
      status: 'failed',
      pct: 60,
      eta: null,
      assets: 25,
      finishedAt: '10 mins ago',
    });
  });

  it('leaves errors and warnings untouched', () => {
    const next = applyProgressToAgent(agent({ errors: 3, warnings: 2 }), update());
    expect(next.errors).toBe(3);
    expect(next.warnings).toBe(2);
  });
});
