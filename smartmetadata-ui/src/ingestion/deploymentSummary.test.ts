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
import type { Agent } from '@/types/ingestion';
import { getDeploymentSummary } from './deploymentSummary';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'p1',
    fqn: 'pg.metadata',
    pipelineType: 'metadata',
    name: 'Metadata Agent',
    type: 'Metadata',
    unit: 'assets',
    verb: 'ingested',
    status: 'success',
    pct: 100,
    eta: 0,
    assets: 10,
    target: 10,
    errors: 0,
    warnings: 0,
    recentRuns: [],
    ...overrides,
  };
}

/** Renders key(params) so assertions can check the exact composition inputs. */
function stubT(key: string, params?: Record<string, string | number>): string {
  const rendered = Object.entries(params ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
  return `${key}(${rendered})`;
}

describe('getDeploymentSummary (official DeploymentSummaryCard)', () => {
  it('renders nothing when no agent is active', () => {
    expect(getDeploymentSummary([], undefined, stubT)).toBeNull();
    expect(getDeploymentSummary([agent({ status: 'none' })], 1, stubT)).toBeNull();
  });

  it('counts running, done, failed, and queued over the tab total', () => {
    const summary = getDeploymentSummary(
      [
        agent({ fqn: 'a', status: 'running', pct: 50 }),
        agent({ fqn: 'b', status: 'success', pct: 100 }),
        agent({ fqn: 'c', status: 'failed', pct: 40 }),
        agent({ fqn: 'd', status: 'queued', pct: 0 }),
        agent({ fqn: 'e', status: 'none', pct: 0 }),
      ],
      6,
      stubT,
    );
    expect(summary).toMatchObject({
      allDone: false,
      total: 6,
      running: 1,
      done: 1,
      failed: 1,
      queued: 3,
      titleKey: 'ingestion.agents.deployingIngesting',
    });
    expect(summary?.subtitle).toBe(
      'ingestion.agents.deployProgress(done=1,running=1,queued=3,failedSuffix= · 1 ingestion.agents.failedLowercase())',
    );
  });

  it('uses the active count when no larger tab total is given', () => {
    const summary = getDeploymentSummary([agent({ status: 'running' })], undefined, stubT);
    expect(summary?.total).toBe(1);
    expect(summary?.queued).toBe(0);
  });

  it('takes assets from the newest non-queued Metadata agent run only', () => {
    const summary = getDeploymentSummary(
      [
        agent({ fqn: 'old', type: 'Metadata', status: 'success', assets: 100, lastRunAt: 1000 }),
        agent({ fqn: 'new', type: 'Metadata', status: 'success', assets: 250, lastRunAt: 2000 }),
        agent({ fqn: 'usage', pipelineType: 'usage', type: 'Usage', status: 'success', assets: 9999, lastRunAt: 3000 }),
        agent({ fqn: 'queued', type: 'Metadata', status: 'queued', assets: 555, lastRunAt: 4000 }),
      ],
      4,
      stubT,
    );
    expect(summary?.assets).toBe(250);
  });

  it('ignores non-metadata pipeline types even when they map to the Metadata display type', () => {
    const summary = getDeploymentSummary(
      [
        agent({ fqn: 'meta', type: 'Metadata', status: 'success', assets: 250, lastRunAt: 2000 }),
        agent({
          fqn: 'insight',
          pipelineType: 'dataInsight',
          type: 'Metadata',
          status: 'success',
          assets: 9999,
          lastRunAt: 3000,
        }),
      ],
      2,
      stubT,
    );
    expect(summary?.assets).toBe(250);
  });

  it('keeps the first agent on equal newest run timestamps', () => {
    const summary = getDeploymentSummary(
      [
        agent({ fqn: 'first', type: 'Metadata', status: 'success', assets: 100, lastRunAt: 2000 }),
        agent({ fqn: 'second', type: 'Metadata', status: 'success', assets: 250, lastRunAt: 2000 }),
      ],
      2,
      stubT,
    );
    expect(summary?.assets).toBe(100);
  });

  it('sums errors and takes the max ETA across running agents', () => {
    const summary = getDeploymentSummary(
      [
        agent({ fqn: 'a', status: 'running', errors: 2, eta: 30 }),
        agent({ fqn: 'b', status: 'running', errors: 3, eta: 90 }),
        agent({ fqn: 'c', status: 'success', errors: 1, eta: 0 }),
      ],
      3,
      stubT,
    );
    expect(summary?.errors).toBe(6);
    expect(summary?.maxEta).toBe(90);
  });

  it('reports no ETA when no running agent reports one', () => {
    const summary = getDeploymentSummary(
      [agent({ status: 'running', eta: null })],
      1,
      stubT,
    );
    expect(summary?.maxEta).toBeNull();
  });

  it('averages percent over the tab total, rounded', () => {
    const summary = getDeploymentSummary(
      [agent({ status: 'running', pct: 50 }), agent({ status: 'success', pct: 100 })],
      4,
      stubT,
    );
    expect(summary?.percent).toBe(38);
  });

  it('reports all-done with the finished summary and the healthy suffix', () => {
    const summary = getDeploymentSummary(
      [agent({ status: 'success' }), agent({ fqn: 'b', status: 'success' })],
      2,
      stubT,
    );
    expect(summary).toMatchObject({ allDone: true, titleKey: 'ingestion.agents.deploymentComplete' });
    expect(summary?.subtitle).toBe(
      'ingestion.agents.finishedSummary(done=2,total=2,attentionSuffix= · ingestion.agents.everythingHealthy())',
    );
  });

  it('reports all-done with the attention suffix when failures exist', () => {
    const summary = getDeploymentSummary(
      [agent({ status: 'success' }), agent({ fqn: 'b', status: 'failed' })],
      2,
      stubT,
    );
    expect(summary?.allDone).toBe(true);
    expect(summary?.subtitle).toContain('attentionSuffix= · 1 ingestion.agents.needAttention()');
  });
});
