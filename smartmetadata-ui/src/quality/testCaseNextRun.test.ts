/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TestCase } from '@/types/quality';
import { fetchNextTestCaseRunTimestamp, getTestSuiteFqns, shouldFetchNextRun } from './testCaseNextRun';

const listIngestionPipelines = vi.fn();

vi.mock('@/api/ingestionPipelines', () => ({
  listIngestionPipelines: (...args: unknown[]) => listIngestionPipelines(...args),
}));

vi.mock('@/quality/cronUtils', () => ({
  getNextCronRunTimestamp: vi.fn(async (interval: string) =>
    interval === '0 0 * * *' ? Date.UTC(2026, 2, 1) : undefined,
  ),
}));

describe('testCaseNextRun', () => {
  beforeEach(() => {
    listIngestionPipelines.mockReset();
  });

  it('dedupes suite FQNs from testCase.testSuite and testSuites', () => {
    const testCase: TestCase = {
      id: '1',
      name: 'tc',
      parameterValues: [],
      testSuite: { name: 'suite.one' },
      testSuites: [{ fullyQualifiedName: 'suite.one' }, { name: 'suite.two' }],
    };
    expect(getTestSuiteFqns(testCase)).toEqual(['suite.one', 'suite.two']);
  });

  it('returns null when pipelines have no upcoming cron run', async () => {
    listIngestionPipelines.mockResolvedValue({ data: [{ enabled: true, airflowConfig: {} }] });
    await expect(fetchNextTestCaseRunTimestamp(['suite.one'])).resolves.toBeNull();
  });

  it('returns earliest next run across suites', async () => {
    listIngestionPipelines.mockResolvedValue({
      data: [
        { enabled: true, airflowConfig: { scheduleInterval: '0 0 * * *' } },
      ],
    });
    await expect(fetchNextTestCaseRunTimestamp(['suite.one'])).resolves.toBe(Date.UTC(2026, 2, 1));
  });

  it('shouldFetchNextRun only on results tab with suites', () => {
    expect(
      shouldFetchNextRun({ activeTab: 'test-case-results', testSuiteFqns: ['s'] }),
    ).toBe(true);
    expect(shouldFetchNextRun({ activeTab: 'issues', testSuiteFqns: ['s'] })).toBe(false);
  });
});