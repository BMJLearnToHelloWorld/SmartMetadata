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
import { isPipelineDeployed } from '@/api/ingestionPipelines';
import { formatBulkDeployFailureText, summarizeBulkDeploy } from './bulkDeploy';

describe('isPipelineDeployed', () => {
  it('requires code 200 and a non-disabled reason', () => {
    expect(isPipelineDeployed({ code: 200 })).toBe(true);
    expect(isPipelineDeployed({ code: 200, reason: 'ok' })).toBe(true);
    expect(isPipelineDeployed({ code: 200, reason: 'Pipeline Client Disabled' })).toBe(false);
    expect(isPipelineDeployed({ code: 500 })).toBe(false);
    expect(isPipelineDeployed({ code: 201 })).toBe(false);
  });

  it('treats a missing code as not deployed', () => {
    expect(isPipelineDeployed({})).toBe(false);
    expect(isPipelineDeployed({ reason: 'ok' })).toBe(false);
  });
});

describe('summarizeBulkDeploy', () => {
  it('M-1: all deployed with matching length reloads', () => {
    expect(
      summarizeBulkDeploy(2, [{ code: 200 }, { code: 200, reason: 'ok' }]),
    ).toEqual({ outcome: 'all-deployed', deployed: 2, failed: 0, shouldReload: true });
  });

  it('M-2: none deployed carries the shared reason verbatim', () => {
    expect(
      summarizeBulkDeploy(2, [
        { code: 200, reason: 'Pipeline Client Disabled' },
        { code: 200, reason: 'Pipeline Client Disabled' },
      ]),
    ).toEqual({
      outcome: 'none-deployed',
      deployed: 0,
      failed: 2,
      sharedReason: 'Pipeline Client Disabled',
      shouldReload: false,
    });
  });

  it('M-2: differing or empty reasons share nothing', () => {
    const differing = summarizeBulkDeploy(2, [
      { code: 500, reason: 'a' },
      { code: 500, reason: 'b' },
    ]);
    expect(differing.outcome).toBe('none-deployed');
    expect(differing.sharedReason).toBeUndefined();
    const empty = summarizeBulkDeploy(1, [{ code: 500 }]);
    expect(empty.sharedReason).toBeUndefined();
  });

  it('M-3/M-4: mixed results count failures without a reason', () => {
    const summary = summarizeBulkDeploy(3, [
      { code: 200 },
      { code: 200, reason: 'Pipeline Client Disabled' },
      { code: 500, reason: 'boom' },
    ]);
    expect(summary).toEqual({ outcome: 'partial', deployed: 1, failed: 2, shouldReload: true });
  });

  it('M-4: a missing code counts as a failure', () => {
    const summary = summarizeBulkDeploy(2, [{ code: 200 }, {}]);
    expect(summary.outcome).toBe('partial');
    expect(summary.deployed).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('M-6: non-array or length mismatch is unverifiable without reload', () => {
    expect(summarizeBulkDeploy(2, null)).toEqual({
      outcome: 'unverifiable',
      deployed: 0,
      failed: 2,
      shouldReload: false,
    });
    expect(summarizeBulkDeploy(2, [{ code: 200 }])).toEqual({
      outcome: 'unverifiable',
      deployed: 0,
      failed: 2,
      shouldReload: false,
    });
    expect(summarizeBulkDeploy(1, [{ code: 200 }, { code: 200 }])).toEqual({
      outcome: 'unverifiable',
      deployed: 0,
      failed: 1,
      shouldReload: false,
    });
  });
});

describe('formatBulkDeployFailureText', () => {
  it('appends a shared reason verbatim', () => {
    expect(formatBulkDeployFailureText('0 deployed, 2 not deployed', 'Pipeline Client Disabled')).toBe(
      '0 deployed, 2 not deployed — Pipeline Client Disabled',
    );
  });

  it('leaves the counts text alone without a reason', () => {
    expect(formatBulkDeployFailureText('0 deployed, 2 not deployed')).toBe(
      '0 deployed, 2 not deployed',
    );
    expect(formatBulkDeployFailureText('0 deployed, 2 not deployed', undefined)).toBe(
      '0 deployed, 2 not deployed',
    );
  });
});
