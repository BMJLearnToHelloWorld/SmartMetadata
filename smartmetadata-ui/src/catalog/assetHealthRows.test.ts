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
import type { TestIncident } from '@/types/quality';
import {
  getAssetHealthHeader,
  getContractHealthRow,
  getDataObservabilityHealthRow,
  getDataQualityHealthRow,
  getLatestPipelineStatus,
  getPipelineHealthRow,
  type AssetHealthRow,
} from './assetHealthRows';

function t(key: string, params?: Record<string, unknown>): string {
  if (!params) {
    return key;
  }
  return `${key}(${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;
}

function pipeline(statuses: { pipelineState?: string; startDate?: number; endDate?: number }[]): IngestionPipeline {
  return {
    id: 'p1',
    name: 'metadata',
    pipelineStatuses: statuses.map((status) => ({ ...status })),
  };
}

function incident(overrides: Partial<TestIncident>): TestIncident {
  return { id: 'i1', ...overrides };
}

function rowWithTone(tone: AssetHealthRow['tone'], cta = false): AssetHealthRow {
  return {
    category: 'pipeline',
    titleKey: 'label.pipeline',
    tone,
    subtitle: '',
    ...(cta ? { cta: { labelKey: 'label.link-pipeline', type: 'link-pipeline' as const } } : {}),
  };
}

describe('assetHealthRows', () => {
  it('picks the pipeline status with the latest start date', () => {
    const latest = getLatestPipelineStatus(
      pipeline([
        { pipelineState: 'success', startDate: 1000 },
        { pipelineState: 'failed', startDate: 2000 },
        { pipelineState: 'running' },
      ]),
    );
    expect(latest?.pipelineState).toBe('failed');
    expect(getLatestPipelineStatus(undefined)).toBeUndefined();
  });

  it('pipeline row: no state is a link-pipeline setup row', () => {
    const row = getPipelineHealthRow(undefined, t);
    expect(row.tone).toBe('neutral');
    expect(row.subtitle).toBe('message.no-pipeline-linked');
    expect(row.cta?.type).toBe('link-pipeline');
  });

  it('pipeline row: running shows started time, success shows last run time', () => {
    const running = getPipelineHealthRow(
      pipeline([{ pipelineState: 'running', startDate: 1000 }]),
      t,
    );
    expect(running.tone).toBe('info');
    expect(running.badgeLabel).toBe('label.running');
    expect(running.subtitle).toContain('message.started-time');
    const healthy = getPipelineHealthRow(
      pipeline([{ pipelineState: 'success', startDate: 1000, endDate: 2000 }]),
      t,
    );
    expect(healthy.tone).toBe('success');
    expect(healthy.badgeLabel).toBe('label.healthy');
    expect(healthy.subtitle).toContain('message.last-run-time');
    const unknown = getPipelineHealthRow(
      pipeline([{ pipelineState: 'failed', startDate: 1000 }]),
      t,
    );
    expect(unknown.tone).toBe('error');
    expect(unknown.badgeLabel).toBe('label.failed');
  });

  it('data quality row: no suite or zero total is an add-tests setup row', () => {
    expect(getDataQualityHealthRow(false, undefined, t).cta?.type).toBe('add-tests');
    expect(getDataQualityHealthRow(true, { total: 0 }, t).cta?.type).toBe('add-tests');
  });

  it('data quality row: failed beats queued and aborted; passing needs full success', () => {
    const failed = getDataQualityHealthRow(true, { success: 8, failed: 2, total: 10 }, t);
    expect(failed.tone).toBe('error');
    expect(failed.badgeLabel).toContain('message.count-failed-test');
    expect(failed.subtitle).toContain('message.count-by-total-test-plural');
    const queued = getDataQualityHealthRow(true, { success: 8, queued: 2, total: 10 }, t);
    expect(queued.tone).toBe('info');
    expect(queued.badgeLabel).toBe('label.queued');
    const partial = getDataQualityHealthRow(true, { success: 8, total: 10 }, t);
    expect(partial.tone).toBe('warning');
    expect(partial.badgeLabel).toBe('label.passing');
    const passing = getDataQualityHealthRow(true, { success: 10, total: 10 }, t);
    expect(passing.tone).toBe('success');
  });

  it('observability row: no suite is setup; resolved incidents do not count', () => {
    expect(getDataObservabilityHealthRow(false, [], t).cta?.type).toBe('enable-observability');
    const clear = getDataObservabilityHealthRow(
      true,
      [incident({ testCaseResolutionStatusType: 'Resolved', timestamp: 1000 })],
      t,
    );
    expect(clear.tone).toBe('success');
    expect(clear.badgeLabel).toBe('label.no-anomaly-plural');
  });

  it('observability row: high severity is an error, low severity a warning', () => {
    const high = getDataObservabilityHealthRow(
      true,
      [incident({ testCaseResolutionStatusType: 'New', severity: 'Severity2', timestamp: 1000 })],
      t,
    );
    expect(high.tone).toBe('error');
    expect(high.badgeLabel).toContain('message.count-anomaly');
    const low = getDataObservabilityHealthRow(
      true,
      [incident({ testCaseResolutionStatusType: 'New', severity: 'Severity4', timestamp: 1000 })],
      t,
    );
    expect(low.tone).toBe('warning');
  });

  it('contract row: no status is a create setup row; message beats the timestamp subtitle', () => {
    expect(getContractHealthRow(null, t).cta?.type).toBe('create-contract');
    const breach = getContractHealthRow(
      { id: 'c1', name: 'contract', latestResult: { status: 'Failed', timestamp: 1000 } },
      t,
    );
    expect(breach.tone).toBe('error');
    expect(breach.badgeLabel).toBe('label.breach');
    expect(breach.subtitle).toContain('message.last-check-time');
    const withMessage = getContractHealthRow(
      { id: 'c1', name: 'contract', latestResult: { status: 'Success', message: 'All checks passed' } },
      t,
    );
    expect(withMessage.subtitle).toBe('All checks passed');
  });

  it('header: setup-only is not-set-up; two errors are critical; one error or a warning is attention', () => {
    expect(getAssetHealthHeader([rowWithTone('neutral', true)]).labelKey).toBe('label.not-set-up');
    expect(
      getAssetHealthHeader([rowWithTone('error'), rowWithTone('error')]).labelKey,
    ).toBe('label.critical');
    expect(getAssetHealthHeader([rowWithTone('error')]).labelKey).toBe('label.attention');
    expect(getAssetHealthHeader([rowWithTone('warning')]).labelKey).toBe('label.attention');
    expect(getAssetHealthHeader([rowWithTone('info')]).labelKey).toBe('label.running');
    expect(getAssetHealthHeader([rowWithTone('success')]).labelKey).toBe('label.all-clear');
  });
});
