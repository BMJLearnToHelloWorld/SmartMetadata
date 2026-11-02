/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistSession } from '@/auth/token';
import { exportAuditLogs, getAuditLogExportJob, getAuditLogExportResult } from './auditLogs';
import { deleteClassification, patchClassification } from './classifications';
import { deleteDataProduct } from './dataProducts';
import { deleteDomain } from './domains';
import { deleteEventSubscription } from './eventSubscriptions';
import { deleteGlossary } from './glossaries';
import { deleteGlossaryTerm } from './glossaryTerms';
import { deleteMetricAsync } from './metrics';
import { patchPolicy } from './policies';
import { createRole } from './roles';
import { deleteTag, patchTag } from './tags';
import {
  addTestCasesToLogicalTestSuite,
  deleteTestCase,
  removeTestCaseFromTestSuite,
} from './testCases';
import { deleteTestSuite } from './testSuites';

function stubFetch(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })),
  );
}

function lastFetch(): { url: string; init?: RequestInit } {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) {
    throw new Error('fetch was not called');
  }
  return { url: String(call[0]), init: call[1] };
}

describe('R6 write surfaces', () => {
  beforeEach(() => {
    localStorage.clear();
    persistSession(localStorage, { accessToken: 'tok', tokenType: 'Bearer' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('deletes a glossary through the generic DELETE surface', async () => {
    stubFetch({});
    await deleteGlossary('g1', { hardDelete: true, recursive: true });
    const { url, init } = lastFetch();
    expect(url).toContain('/api/v1/glossaries/g1');
    expect(url).toContain('hardDelete=true');
    expect(url).toContain('recursive=true');
    expect(init?.method).toBe('DELETE');
  });

  it('deletes a glossary term through the generic DELETE surface', async () => {
    stubFetch({});
    await deleteGlossaryTerm('t1', { hardDelete: true });
    expect(lastFetch().url).toContain('/api/v1/glossaryTerms/t1');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('deletes a classification with official recursive+hardDelete', async () => {
    stubFetch({});
    await deleteClassification('c1');
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/classifications/c1');
    expect(url).toContain('recursive=true');
    expect(url).toContain('hardDelete=true');
  });

  it('deletes a tag with official recursive+hardDelete', async () => {
    stubFetch({});
    await deleteTag('tag1');
    const { url } = lastFetch();
    expect(url).toContain('/api/v1/tags/tag1');
    expect(url).toContain('recursive=true');
    expect(url).toContain('hardDelete=true');
  });

  it('deletes a domain and a data product', async () => {
    stubFetch({});
    await deleteDomain('d1', { hardDelete: true });
    expect(lastFetch().url).toContain('/api/v1/domains/d1');
    await deleteDataProduct('dp1');
    expect(lastFetch().url).toContain('/api/v1/dataProducts/dp1');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('deletes a metric through the async surface, not a sync DELETE', async () => {
    stubFetch({});
    await deleteMetricAsync('m1');
    expect(lastFetch().url).toContain('/api/v1/metrics/async/m1');
  });

  it('deletes a test case and a test suite through the generic surface', async () => {
    stubFetch({});
    await deleteTestCase('tc1', { hardDelete: true });
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/tc1');
    await deleteTestSuite('ts1', { hardDelete: true });
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testSuites/ts1');
  });

  it('adds and removes test cases on a logical suite', async () => {
    stubFetch({});
    await addTestCasesToLogicalTestSuite('ts1', ['tc1', 'tc2']);
    const add = lastFetch();
    expect(add.url).toContain('/api/v1/dataQuality/testCases/logicalTestCases');
    expect(add.init?.method).toBe('PUT');
    expect(JSON.parse(String(add.init?.body ?? '{}'))).toMatchObject({
      testSuiteId: 'ts1',
      testCaseIds: ['tc1', 'tc2'],
    });
    await removeTestCaseFromTestSuite('ts1', 'tc1');
    expect(lastFetch().url).toContain('/api/v1/dataQuality/testCases/logicalTestCases/ts1/tc1');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('deletes an alert subscription', async () => {
    stubFetch({});
    await deleteEventSubscription('a1');
    expect(lastFetch().url).toContain('/api/v1/events/subscriptions/a1');
    expect(lastFetch().init?.method).toBe('DELETE');
  });

  it('patches classification and tag disabled flags as JSON Patch', async () => {
    stubFetch({ id: 'c1', name: 'C', disabled: true, owners: [] });
    await patchClassification('c1', [{ op: 'replace', path: '/disabled', value: true }]);
    expect(lastFetch().init?.method).toBe('PATCH');
    expect(lastFetch().init?.headers).toMatchObject({ 'Content-Type': 'application/json-patch+json' });
    stubFetch({ id: 'tag1', name: 'T', disabled: true, owners: [] });
    await patchTag('tag1', [{ op: 'replace', path: '/disabled', value: true }]);
    expect(lastFetch().init?.method).toBe('PATCH');
  });

  it('creates a role with policy refs', async () => {
    stubFetch({ id: 'r1', name: 'Analyst', policies: [], users: [], teams: [] });
    const role = await createRole({ name: 'Analyst', policies: ['p1'] });
    expect(role.name).toBe('Analyst');
    expect(JSON.parse(String(lastFetch().init?.body ?? '{}'))).toMatchObject({
      name: 'Analyst',
      policies: [{ id: 'p1', type: 'policy' }],
    });
  });

  it('patches a policy with a rules replace op', async () => {
    stubFetch({ id: 'pol1', name: 'P', rules: [], owners: [], teams: [], roles: [] });
    await patchPolicy('pol1', [{ op: 'replace', path: '/rules', value: [] }]);
    expect(lastFetch().url).toContain('/api/v1/policies/pol1');
    expect(lastFetch().init?.method).toBe('PATCH');
  });

  it('starts an audit export job, polls it, and fetches the text result', async () => {
    stubFetch({ jobId: 'job1', status: 'running' });
    const job = await exportAuditLogs({ userName: 'alice' });
    expect(job.jobId).toBe('job1');
    expect(lastFetch().url).toContain('/api/v1/audit/logs/export');
    expect(lastFetch().url).toContain('userName=alice');
    stubFetch({ jobId: 'job1', status: 'completed' });
    const polled = await getAuditLogExportJob('job1');
    expect(polled.status).toBe('completed');
    stubFetch('a,b\n1,2\n');
    const result = await getAuditLogExportResult('job1');
    expect(result).toContain('a,b');
  });
});
